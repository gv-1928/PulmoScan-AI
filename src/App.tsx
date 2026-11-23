import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Battery,
  CheckSquare,
  Database,
  FileText,
  Layers,
  Menu,
  PlayCircle,
  Radio,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import {
  getDominantClass,
  runSessionPipeline,
} from './features/pipeline';
import { LiveLabSection } from './pages/LiveLabSection';
import {
  decodeAndResampleAudioFile,
  generatePresetAudio,
  GeneratedAudioSource,
} from './simulation/audioPresets';
import { generate30DayDeteriorationSessions } from './simulation/longitudinalSim';
import { LiveCaptureFinal } from './transport/liveReceiver';
import {
  BleLinkConfig,
  ConsoleStepId,
  LinkMode,
  LiveCaptureMeta,
  PhonePhase,
  PhoneStatus,
  PresetId,
  QualityState,
  SessionAnalysisResult,
  SessionRecord,
  UtilityModalId,
} from './types/pulmoscan';
import { JudgeModeTour } from './ui/JudgeModeTour';
import { PhoneCompanion } from './ui/PhoneCompanion';
import { UtilityModals } from './ui/UtilityModals';

const HeroBreathScene = lazy(() =>
  import('./three/HeroBreathScene').then((m) => ({
    default: m.HeroBreathScene,
  })),
);

function createInitialAnalysis(
  initialAudio: GeneratedAudioSource,
): SessionAnalysisResult {
  const flatRow = new Array<number>(64).fill(-4);
  return {
    id: 'init-session',
    title: initialAudio.title,
    presetId: 'normal',
    breathsPerMin: 15,
    durationSec: initialAudio.durationSec,
    sampleRate: 16000,
    rawSamples: initialAudio.samples,
    reassembledSamples: initialAudio.samples,
    breathPhases: initialAudio.breathPhases,
    melSpectrogram: [flatRow],
    melTimesSec: [0],
    windows: [],
    classifier: {
      normal: 0.94,
      wheeze: 0.04,
      crackle: 0.02,
      validWindowCount: 7,
      totalWindowCount: 7,
      label: 'CNN Classification',
    },
    featureVector21D: {
      values: new Array<number>(21).fill(0),
      labels: [],
    },
    bleResult: {
      packets: [],
      reassembledSamples: initialAudio.samples,
      sentCount: 1628,
      receivedCount: 1628,
      lostCount: 0,
      lossPct: 0,
      maxGapMs: 0,
      mtuBytes: 244,
      windowTransportStats: [],
    },
    trace: {
      baselineMean: 0.38,
      baselineScale: 0.24,
      studentTDof: 6,
      predictiveSurprise: -0.22,
      censoringEvidenceTerm: 0,
      temperingLambda: 0.35,
      srStatistic: 0.28,
      srThreshold: 6.5,
      status: PhoneStatus.STABLE,
      contributingWindows: [],
    },
    dspTimeMs: 4.0,
    isSynthetic: true,
    dataOrigin: 'synthetic-demo',
  };
}

export default function App() {
  const [activeStep, setActiveStep] = useState<ConsoleStepId>('input');
  const [activePreset, setActivePreset] = useState<PresetId>('normal');
  const [breathsPerMin, setBreathsPerMin] = useState<number>(15);
  const [activeModal, setActiveModal] = useState<UtilityModalId>(null);
  const [judgeModeOpen, setJudgeModeOpen] = useState<boolean>(false);
  const [hidePhone, setHidePhone] = useState<boolean>(false);
  const [standalonePhone, setStandalonePhone] = useState<boolean>(false);
  const [mobilePhoneOpen, setMobilePhoneOpen] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  const [phonePhase, setPhonePhase] = useState<PhonePhase>('READY');
  const [validBaselineDays, setValidBaselineDays] = useState<number>(0);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [participantContext, setParticipantContext] =
    useState<string>('Resting · Morning');

  const [bleConfig, setBleConfig] = useState<BleLinkConfig>({
    linkMode: 'BLE',
    mtuBytes: 244,
    packetLossPct: 0,
    burstMode: false,
    disconnectEvent: false,
    autoSend: true,
    seed: 1,
  });

  const [tempering, setTempering] = useState<number>(0.35);
  const [audioSource, setAudioSource] = useState<GeneratedAudioSource>(() =>
    generatePresetAudio('normal', 42, 15),
  );
  const [liveCaptureMeta, setLiveCaptureMeta] =
    useState<LiveCaptureMeta | null>(null);
  const [analysis, setAnalysis] = useState<SessionAnalysisResult>(() =>
    createInitialAnalysis(audioSource),
  );
  const [isProcessingAudio, setIsProcessingAudio] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Playback telemetry for hero 3D and sound-reactive accents
  const [playbackState, setPlaybackState] = useState({
    isPlaying: false,
    timeSec: 0,
    rms: 0,
  });

  // Hero fade opacity on scroll
  const [heroScrollOpacity, setHeroScrollOpacity] = useState(1);
  useEffect(() => {
    const onScroll = () => {
      const next = Math.max(0, Math.min(1, 1 - window.scrollY / 380));
      setHeroScrollOpacity(next);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const syncPendingRef = useRef<boolean>(false);
  const phoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (phoneTimerRef.current) {
        clearTimeout(phoneTimerRef.current);
      }
    };
  }, []);

  const commitSessionToPhone = useCallback((result: SessionAnalysisResult) => {
    let validWindows = 0;
    let transportCensoredWindows = 0;
    let acquisitionCensoredWindows = 0;
    for (const w of result.windows) {
      if (w.qualityState === QualityState.VALID) validWindows++;
      else if (w.qualityState === QualityState.TRANSPORT_CENSORED)
        transportCensoredWindows++;
      else acquisitionCensoredWindows++;
    }

    const dominantClass = getDominantClass(result.classifier);
    setPhonePhase('ANALYZING');

    if (phoneTimerRef.current) {
      clearTimeout(phoneTimerRef.current);
    }

    phoneTimerRef.current = setTimeout(() => {
      setSessions((prev) => {
        const dayIndex = prev.length + 1;
        const rec: SessionRecord = {
          id: `sess-${Date.now()}-${dayIndex}`,
          dayIndex,
          timestampIso: new Date().toISOString(),
          label: result.title,
          presetId: result.presetId,
          status: result.trace.status,
          srStatistic: result.trace.srStatistic,
          validWindows,
          transportCensoredWindows,
          acquisitionCensoredWindows,
          dominantClass,
          isSynthetic: result.isSynthetic,
        };
        if (result.trace.status === PhoneStatus.CENSORED_TODAY) {
          rec.censoredReason =
            transportCensoredWindows > 0
              ? 'Lost while sending (Bluetooth)'
              : 'Bad recording';
        }
        return [...prev, rec];
      });

      if (validWindows > 0) {
        setValidBaselineDays((prev) => Math.min(14, prev + 1));
      }
      setPhonePhase('RESULT');
    }, 220);
  }, []);

  // Re-run session pipeline on source/config changes
  useEffect(() => {
    let cancelled = false;
    setIsProcessingAudio(true);

    runSessionPipeline({
      id: `run-${Date.now()}`,
      title: audioSource.title,
      presetId: activePreset,
      breathsPerMin,
      rawSamples: audioSource.samples,
      breathPhases: audioSource.breathPhases,
      bleConfig,
      validBaselineDays,
      tempering,
      liveBleResult: liveCaptureMeta?.bleResult ?? null,
      dataOrigin: liveCaptureMeta?.dataOrigin,
    })
      .then((res) => {
        if (cancelled) return;
        setAnalysis(res);
        setIsProcessingAudio(false);
        if (syncPendingRef.current) {
          syncPendingRef.current = false;
          commitSessionToPhone(res);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsProcessingAudio(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // validBaselineDays intentionally excluded so syncing baseline increment doesn't retrigger DSP
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    audioSource,
    activePreset,
    breathsPerMin,
    bleConfig,
    tempering,
    liveCaptureMeta,
    commitSessionToPhone,
  ]);

  const handleSelectPreset = (preset: PresetId, syncImmediately = true) => {
    setUploadError(null);
    setLiveCaptureMeta(null);
    setActivePreset(preset);
    syncPendingRef.current = Boolean(syncImmediately && bleConfig.autoSend);
    setAudioSource(generatePresetAudio(preset, 42, breathsPerMin));
  };

  const handleChangeBpm = (bpm: number) => {
    setBreathsPerMin(bpm);
    if (
      activePreset !== 'custom' &&
      activePreset !== 'live-ble' &&
      activePreset !== 'live-wifi'
    ) {
      setLiveCaptureMeta(null);
      syncPendingRef.current = false;
      setAudioSource(generatePresetAudio(activePreset, 42, bpm));
    }
  };

  const handleLoadWheezeSample = () => {
    setUploadError(null);
    setLiveCaptureMeta(null);
    setActivePreset('wheeze');
    setBreathsPerMin(16);
    syncPendingRef.current = true;
    setAudioSource(generatePresetAudio('wheeze', 42, 16));
  };

  const handleUploadFile = async (file: File) => {
    setIsProcessingAudio(true);
    setUploadError(null);
    try {
      const decoded = await decodeAndResampleAudioFile(file);
      setLiveCaptureMeta(null);
      setActivePreset('custom');
      syncPendingRef.current = bleConfig.autoSend;
      setAudioSource(decoded);
    } catch {
      setUploadError(
        'Could not read that sound file. Try a standard audio file.',
      );
      setIsProcessingAudio(false);
    }
  };

  const handleLiveCaptureComplete = (
    result: LiveCaptureFinal & { linkMode: LinkMode },
  ) => {
    setUploadError(null);
    setBleConfig((prev) => ({
      ...prev,
      linkMode: result.linkMode,
      disconnectEvent: false,
    }));
    const nextPreset: PresetId =
      result.linkMode === 'BLE' ? 'live-ble' : 'live-wifi';
    setActivePreset(nextPreset);
    setLiveCaptureMeta({
      bleResult: result.bleResult,
      dataOrigin:
        result.linkMode === 'BLE' ? 'live-bluetooth' : 'live-wifi',
      batteryPct: result.batteryPct,
    });
    syncPendingRef.current = true;
    setAudioSource({
      samples: result.samples,
      sampleRate: 16000,
      durationSec: result.durationSec,
      breathPhases: result.breathPhases,
      title: result.title,
    });
  };

  const handleChangeBleConfig = (next: BleLinkConfig) => {
    if (bleConfig.autoSend) {
      const disconnectChanged =
        next.disconnectEvent !== bleConfig.disconnectEvent;
      const lossCrossed2 =
        bleConfig.packetLossPct <= 2 && next.packetLossPct > 2;
      const lossCrossed10 =
        bleConfig.packetLossPct < 10 && next.packetLossPct >= 10;
      if (disconnectChanged || lossCrossed2 || lossCrossed10) {
        syncPendingRef.current = true;
      }
    }
    setBleConfig(next);
  };

  const handleManualSync = () => {
    commitSessionToPhone(analysis);
  };

  const handleSeedDemo = () => {
    const demoSessions = generate30DayDeteriorationSessions(7);
    const validDays = demoSessions.filter(
      (s) => s.status !== PhoneStatus.CENSORED_TODAY,
    ).length;
    setSessions(demoSessions);
    setValidBaselineDays(Math.min(14, validDays));
    setPhonePhase('RESULT');
  };

  const handleClearDemo = () => {
    setSessions([]);
    setValidBaselineDays(0);
    setPhonePhase('READY');
  };

  const handleWordmarkClick = () => {
    setStandalonePhone(false);
    setActiveModal(null);
    setActiveStep('input');
    setMobileNavOpen(false);
  };

  // Sensor status LED & label
  const sensorStatus = bleConfig.disconnectEvent
    ? { label: 'Disconnected', dotClass: 'bg-[#FB7185]' }
    : phonePhase === 'ANALYZING' || isProcessingAudio
      ? { label: 'Sending', dotClass: 'bg-[#FB7185] animate-pulse' }
      : phonePhase === 'RESULT'
        ? { label: 'Ready', dotClass: 'bg-[#2DD4BF]' }
        : { label: 'Idle', dotClass: 'bg-[#8AA3A0]' };

  const batteryLabel =
    liveCaptureMeta?.batteryPct !== null &&
    liveCaptureMeta?.batteryPct !== undefined
      ? `${liveCaptureMeta.batteryPct}%`
      : 'Demo';

  const navItems: Array<{
    id: 'home' | 'detector' | 'hardware' | 'acceptance';
    label: string;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      id: 'home',
      label: 'Home',
      active: activeStep !== 'detector' && activeModal === null,
      onClick: () => {
        setStandalonePhone(false);
        setActiveModal(null);
        setActiveStep('input');
        setMobileNavOpen(false);
      },
    },
    {
      id: 'detector',
      label: 'Abnormality Detection',
      active: activeStep === 'detector' && activeModal === null,
      onClick: () => {
        setStandalonePhone(false);
        setActiveModal(null);
        setActiveStep('detector');
        setMobileNavOpen(false);
      },
    },
    {
      id: 'hardware',
      label: 'Sensor',
      active: activeModal === 'hardware',
      onClick: () => {
        setActiveModal('hardware');
        setMobileNavOpen(false);
      },
    },
    {
      id: 'acceptance',
      label: 'Self-check',
      active: activeModal === 'acceptance',
      onClick: () => {
        setActiveModal('acceptance');
        setMobileNavOpen(false);
      },
    },
  ];

  const headerGlowOpacity = playbackState.isPlaying
    ? Math.min(0.85, 0.25 + playbackState.rms * 2.4)
    : 0.14;

  return (
    <div className="min-h-screen relative bg-[#050B10] text-[#E8F3F1] flex flex-col">
      {/* Atmospheric background layers (presentation only) */}
      <div
        aria-hidden="true"
        className="no-print fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse 75% 50% at 20% 0%, rgba(45, 212, 191, 0.09), transparent 70%), radial-gradient(ellipse 55% 45% at 85% 15%, rgba(139, 92, 246, 0.06), transparent 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="no-print fixed inset-0 pointer-events-none z-0 bg-aurora-grid opacity-70"
      />
      <div
        aria-hidden="true"
        className="no-print fixed inset-0 pointer-events-none z-0 bg-film-grain"
      />

      {/* Lazy Hero 3D Breathing Lung Canvas */}
      <Suspense fallback={null}>
        <div className="no-print">
          <HeroBreathScene
            breathsPerMin={breathsPerMin}
            breathPhases={analysis.breathPhases}
            status={
              phonePhase === 'READY'
                ? PhoneStatus.STABLE
                : analysis.trace.status
            }
            classifier={analysis.classifier}
            isPlaying={playbackState.isPlaying}
            playheadSec={playbackState.timeSec}
            scrollOpacity={heroScrollOpacity}
          />
        </div>
      </Suspense>

      {/* 1. Disclaimer bar */}
      <div className="no-print relative z-20 px-4 pt-2.5">
        <div className="max-w-[1440px] mx-auto text-center text-[11px] font-mono text-[#8AA3A0] clinical-glass rounded-xl py-1.5 px-3">
          Demo only. Not a medical device. Not for diagnosis.
        </div>
      </div>

      {/* 2. Sticky floating header */}
      <header className="no-print sticky top-2.5 z-30 px-4 mt-2.5">
        <div
          className="max-w-[1440px] mx-auto clinical-glass-strong rounded-2xl px-4 py-2.5 flex items-center justify-between gap-4 transition-shadow"
          style={{
            borderColor: `rgba(45, 212, 191, ${headerGlowOpacity})`,
            boxShadow: playbackState.isPlaying
              ? `0 0 26px rgba(45, 212, 191, ${headerGlowOpacity * 0.45})`
              : undefined,
          }}
        >
          {/* Left: Wordmark */}
          <button
            type="button"
            onClick={handleWordmarkClick}
            className="group inline-flex items-center gap-2 text-left min-h-[40px]"
          >
            <span
              className="w-2.5 h-2.5 rounded-full bg-[#2DD4BF] shadow-[0_0_12px_#2DD4BF]"
              aria-hidden="true"
            />
            <span className="font-display text-base sm:text-lg font-semibold tracking-tight bg-gradient-to-r from-[#E8F3F1] via-[#5EEAD4] to-[#2DD4BF] bg-clip-text text-transparent group-hover:from-[#5EEAD4] group-hover:to-[#E8F3F1] transition-all">
              PulmoScan AI
            </span>
          </button>

          {/* Center nav (desktop) */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-1"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`relative px-3.5 py-2 rounded-xl text-xs transition-colors min-h-[40px] ${
                  item.active
                    ? 'text-[#2DD4BF] font-semibold'
                    : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
                }`}
              >
                <span>{item.label}</span>
                {item.active && (
                  <motion.span
                    layoutId="header-nav-underline"
                    className="absolute left-3 right-3 bottom-1 h-0.5 rounded-full bg-[#2DD4BF] shadow-[0_0_10px_#2DD4BF]"
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Right: Quick tour + mobile menu */}
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setJudgeModeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#2DD4BF] to-[#5EEAD4] text-[#050B10] shadow-[0_0_22px_rgba(45,212,191,0.3)] hover:brightness-105 transition-all min-h-[40px]"
            >
              <PlayCircle className="w-4 h-4" aria-hidden="true" />
              <span>Quick tour</span>
            </motion.button>

            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              className="md:hidden p-2 rounded-xl border border-[#94E2D5]/25 text-[#E8F3F1] min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              {mobileNavOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav sheet */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="md:hidden max-w-[1440px] mx-auto mt-2 clinical-glass-strong rounded-2xl p-3 flex flex-col gap-1"
            >
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`text-left px-3.5 py-2.5 rounded-xl text-sm min-h-[44px] ${
                    item.active
                      ? 'bg-[#2DD4BF]/15 text-[#2DD4BF] font-semibold'
                      : 'text-[#E8F3F1] hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <main className="no-print relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 pt-6 pb-10 space-y-5">
        {standalonePhone ? (
          <PhoneCompanion
            phonePhase={phonePhase}
            validBaselineDays={validBaselineDays}
            sessions={sessions}
            analysis={analysis}
            linkMode={bleConfig.linkMode}
            participantContext={participantContext}
            onChangeContext={setParticipantContext}
            onLoadWheezeSample={handleLoadWheezeSample}
            onSeedDemo={handleSeedDemo}
            onClearDemo={handleClearDemo}
            onToggleStandalone={() => setStandalonePhone(false)}
            onHidePhone={() => setStandalonePhone(false)}
            standalone
          />
        ) : (
          <>
            {/* 3. Title block */}
            <section className="space-y-2.5 max-w-4xl">
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-semibold leading-tight tracking-tight bg-gradient-to-r from-[#E8F3F1] via-[#5EEAD4] to-[#2DD4BF] bg-clip-text text-transparent">
                PulmoScan breathing sound monitor
              </h1>
              <p className="text-xs sm:text-sm text-[#8AA3A0] leading-relaxed">
                1. Audio Acquisition: Captures respiratory sounds using a
                microphone. → 2. Quality Checking: Checks audio clarity, noise
                and packet loss. → 3. CNN Classification: Identifies Normal,
                Wheeze and Crackle sounds. → 4. Personal Baseline Learning:
                Learns the user&apos;s normal respiratory pattern. → 5.
                Abnormality Detection: Detects unusual and persistent changes in
                breathing patterns. → 6. Alert Generation: Displays status and
                recording recommendations.
              </p>
            </section>

            {/* 4. Toolbar card */}
            <section
              aria-label="Session toolbar"
              className="clinical-glass rounded-2xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3"
            >
              {/* Left: LED + Sensor state + Battery + Link mode */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 font-mono text-xs px-2.5 py-1.5 rounded-xl bg-[#040A0E]/80 border border-[#94E2D5]/15">
                  <span
                    className={`w-2 h-2 rounded-full ${sensorStatus.dotClass}`}
                    aria-hidden="true"
                  />
                  <span className="text-[#E8F3F1]">
                    Sensor: {sensorStatus.label}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 font-mono text-xs text-[#8AA3A0]">
                  <Battery className="w-4 h-4 text-[#2DD4BF]" aria-hidden="true" />
                  <span>{batteryLabel}</span>
                </div>

                <div className="inline-flex p-0.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/15">
                  {(
                    [
                      { mode: 'BLE' as LinkMode, label: 'Bluetooth', Icon: Radio },
                      {
                        mode: 'WIFI_DEV' as LinkMode,
                        label: 'Wi-Fi (dev)',
                        Icon: Wifi,
                      },
                    ] as const
                  ).map(({ mode, label, Icon }) => {
                    const active = bleConfig.linkMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          handleChangeBleConfig({
                            ...bleConfig,
                            linkMode: mode,
                          })
                        }
                        className={`relative px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 min-h-[32px] ${
                          active
                            ? 'text-[#050B10]'
                            : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="toolbar-link-pill"
                            className="absolute inset-0 rounded-lg bg-[#2DD4BF]"
                            transition={{
                              type: 'spring',
                              stiffness: 320,
                              damping: 30,
                            }}
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadWheezeSample}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] transition-colors min-h-[40px]"
                >
                  <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Load wheeze sample</span>
                </button>

                <button
                  type="button"
                  onClick={() => setJudgeModeOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/22 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                >
                  <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Quick tour</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('acceptance')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/22 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                >
                  <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Self-check</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('clinical-pdf')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/22 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                >
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Session report</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('phone-app')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/22 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Phone app</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('data-source')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/22 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                >
                  <Database className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Data source</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHidePhone((h) => !h)}
                  className="hidden xl:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/25 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                >
                  <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{hidePhone ? 'Show Phone' : 'Hide Phone'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMobilePhoneOpen(true)}
                  className="xl:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#2DD4BF]/55 text-[#2DD4BF] hover:bg-[#2DD4BF]/10 transition-colors min-h-[40px]"
                >
                  <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Phone</span>
                </button>
              </div>
            </section>

            {/* 5. Main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div
                className={
                  hidePhone ? 'xl:col-span-12' : 'xl:col-span-8'
                }
              >
                <LiveLabSection
                  activeStep={activeStep}
                  onSelectStep={setActiveStep}
                  activePreset={activePreset}
                  breathsPerMin={breathsPerMin}
                  bleConfig={bleConfig}
                  tempering={tempering}
                  validBaselineDays={validBaselineDays}
                  phonePhase={phonePhase}
                  analysis={analysis}
                  isProcessingAudio={isProcessingAudio}
                  uploadError={uploadError}
                  onSelectPreset={handleSelectPreset}
                  onChangeBpm={handleChangeBpm}
                  onUploadFile={handleUploadFile}
                  onLiveCaptureComplete={handleLiveCaptureComplete}
                  onChangeBleConfig={handleChangeBleConfig}
                  onChangeTempering={setTempering}
                  onSyncToPhone={handleManualSync}
                  onOpenModal={setActiveModal}
                  onPlaybackChange={setPlaybackState}
                />
              </div>

              {!hidePhone && (
                <aside className="hidden xl:block xl:col-span-4 sticky top-20">
                  <PhoneCompanion
                    phonePhase={phonePhase}
                    validBaselineDays={validBaselineDays}
                    sessions={sessions}
                    analysis={analysis}
                    linkMode={bleConfig.linkMode}
                    participantContext={participantContext}
                    onChangeContext={setParticipantContext}
                    onLoadWheezeSample={handleLoadWheezeSample}
                    onSeedDemo={handleSeedDemo}
                    onClearDemo={handleClearDemo}
                    onToggleStandalone={() => setStandalonePhone(true)}
                    onHidePhone={() => setHidePhone(true)}
                  />
                </aside>
              )}
            </div>
          </>
        )}
      </main>

      {/* Mobile / Tablet centered Phone drawer (< xl) */}
      <AnimatePresence>
        {mobilePhoneOpen && !standalonePhone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="no-print xl:hidden fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#020609]/80 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobilePhoneOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-[390px]"
            >
              <PhoneCompanion
                phonePhase={phonePhase}
                validBaselineDays={validBaselineDays}
                sessions={sessions}
                analysis={analysis}
                linkMode={bleConfig.linkMode}
                participantContext={participantContext}
                onChangeContext={setParticipantContext}
                onLoadWheezeSample={handleLoadWheezeSample}
                onSeedDemo={handleSeedDemo}
                onClearDemo={handleClearDemo}
                onToggleStandalone={() => {
                  setMobilePhoneOpen(false);
                  setStandalonePhone(true);
                }}
                onHidePhone={() => setMobilePhoneOpen(false)}
                onCloseDrawer={() => setMobilePhoneOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <UtilityModals
        activeModal={activeModal}
        onSelectModal={setActiveModal}
        analysis={analysis}
        validBaselineDays={validBaselineDays}
        defaultBleConfig={bleConfig}
        tempering={tempering}
      />

      {/* Quick Tour */}
      <JudgeModeTour
        open={judgeModeOpen}
        onClose={() => setJudgeModeOpen(false)}
        onNavigateChapter={({ step, modal }) => {
          setStandalonePhone(false);
          setActiveStep(step);
          setActiveModal(modal ?? null);
        }}
      />

      {/* 6. Footer */}
      <footer className="no-print relative z-10 px-4 pb-5 mt-auto">
        <div className="max-w-[1440px] mx-auto clinical-glass rounded-2xl px-4 py-3 text-center text-xs font-mono text-[#8AA3A0]">
          PulmoScan AI · Demo only · Works on your phone · Not a medical device.
        </div>
      </footer>
    </div>
  );
}
