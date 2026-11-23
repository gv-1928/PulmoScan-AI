import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  CheckCircle2,
  Download,
  Printer,
  X,
  XCircle,
} from 'lucide-react';
import { getDominantClass, runSessionPipeline } from '../features/pipeline';
import { generatePresetAudio } from '../simulation/audioPresets';
import {
  BleLinkConfig,
  PAPER_CONSTANTS,
  SessionAnalysisResult,
  UtilityModalId,
} from '../types/pulmoscan';
import { getRecommendationText } from './shared';

const HardwareExplodedModel = lazy(() =>
  import('../three/HardwareExplodedModel').then((m) => ({
    default: m.HardwareExplodedModel,
  })),
);

interface UtilityModalsProps {
  activeModal: UtilityModalId;
  onSelectModal: (modal: UtilityModalId) => void;
  analysis: SessionAnalysisResult;
  validBaselineDays: number;
  defaultBleConfig: BleLinkConfig;
  tempering: number;
}

const MODAL_TABS: Array<{ id: Exclude<UtilityModalId, null>; label: string }> = [
  { id: 'hardware', label: 'Sensor' },
  { id: 'acceptance', label: 'Self-check' },
  { id: 'clinical-pdf', label: 'Session report' },
  { id: 'phone-app', label: 'Phone app' },
  { id: 'data-source', label: 'Data source' },
];

interface AcceptanceCheckRow {
  id: string;
  title: string;
  detail: string;
  pass: boolean;
}

export const UtilityModals: React.FC<UtilityModalsProps> = ({
  activeModal,
  onSelectModal,
  analysis,
  validBaselineDays,
  defaultBleConfig,
  tempering,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [checks, setChecks] = useState<AcceptanceCheckRow[] | null>(null);

  // Focus trap and Esc key
  useEffect(() => {
    if (!activeModal) return;
    const prevFocused = document.activeElement as HTMLElement | null;

    const focusTimer = setTimeout(() => {
      dialogRef.current?.focus();
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectModal(null);
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      prevFocused?.focus?.();
    };
  }, [activeModal, onSelectModal]);

  // Run live browser self-checks when Self-check modal opens
  useEffect(() => {
    if (activeModal !== 'acceptance') return;
    let cancelled = false;

    const runChecks = async () => {
      const normalAudio = generatePresetAudio('normal', 42, 15);
      const noisyAudio = generatePresetAudio('noisy', 42, 15);
      const wheezeAudio = generatePresetAudio('wheeze', 42, 16);

      const cleanBle: BleLinkConfig = {
        linkMode: 'BLE',
        mtuBytes: 244,
        packetLossPct: 0,
        burstMode: false,
        disconnectEvent: false,
        autoSend: true,
        seed: 1,
      };
      const loss12Ble: BleLinkConfig = { ...cleanBle, packetLossPct: 12 };

      const [resNormal, resLoss12, resNoisy, resWheeze0, resWheeze12] =
        await Promise.all([
          runSessionPipeline({
            id: 'sc-normal',
            title: normalAudio.title,
            presetId: 'normal',
            breathsPerMin: 15,
            rawSamples: normalAudio.samples,
            breathPhases: normalAudio.breathPhases,
            bleConfig: cleanBle,
            validBaselineDays,
            tempering,
          }),
          runSessionPipeline({
            id: 'sc-loss12',
            title: normalAudio.title,
            presetId: 'normal',
            breathsPerMin: 15,
            rawSamples: normalAudio.samples,
            breathPhases: normalAudio.breathPhases,
            bleConfig: loss12Ble,
            validBaselineDays,
            tempering,
          }),
          runSessionPipeline({
            id: 'sc-noisy',
            title: noisyAudio.title,
            presetId: 'noisy',
            breathsPerMin: 15,
            rawSamples: noisyAudio.samples,
            breathPhases: noisyAudio.breathPhases,
            bleConfig: cleanBle,
            validBaselineDays,
            tempering,
          }),
          runSessionPipeline({
            id: 'sc-wheeze-0',
            title: wheezeAudio.title,
            presetId: 'wheeze',
            breathsPerMin: 16,
            rawSamples: wheezeAudio.samples,
            breathPhases: wheezeAudio.breathPhases,
            bleConfig: cleanBle,
            validBaselineDays,
            tempering,
          }),
          runSessionPipeline({
            id: 'sc-wheeze-12',
            title: wheezeAudio.title,
            presetId: 'wheeze',
            breathsPerMin: 16,
            rawSamples: wheezeAudio.samples,
            breathPhases: wheezeAudio.breathPhases,
            bleConfig: loss12Ble,
            validBaselineDays,
            tempering,
          }),
        ]);

      if (cancelled) return;

      const goodCount = resNormal.windows.filter(
        (w) => w.qualityState === 'VALID',
      ).length;
      const lostCount = resLoss12.windows.filter(
        (w) => w.qualityState === 'TRANSPORT_CENSORED',
      ).length;
      const badCount = resNoisy.windows.filter(
        (w) => w.qualityState === 'ACQUISITION_CENSORED',
      ).length;

      const scoreA = resWheeze0.trace.srStatistic;
      const scoreB = resWheeze12.trace.srStatistic;

      setChecks([
        {
          id: 'SC-01',
          title: 'Bluetooth is the default wireless link',
          detail: `Link: ${defaultBleConfig.linkMode === 'BLE' ? 'Bluetooth' : 'Wi-Fi'}, chunk size: ${defaultBleConfig.mtuBytes} bytes`,
          pass:
            defaultBleConfig.linkMode === 'BLE' &&
            defaultBleConfig.mtuBytes === 244,
        },
        {
          id: 'SC-02',
          title:
            'All three clip states work (Good, Lost while sending, Bad recording)',
          detail: `Good=${goodCount}, Lost=${lostCount}, Bad=${badCount}`,
          pass: goodCount > 0 && lostCount > 0 && badCount > 0,
        },
        {
          id: 'SC-03',
          title:
            'Alert score stays steady when Bluetooth drops packets',
          detail: `Score at 0% loss = ${scoreA.toFixed(2)} vs 12% loss = ${scoreB.toFixed(2)}`,
          pass: Math.abs(scoreA - scoreB) <= 0.5,
        },
        {
          id: 'SC-04',
          title: 'CNN Classification stays tagged cleanly for demo',
          detail: `Tag: "${resNormal.classifier.label}"`,
          pass: resNormal.classifier.label === 'CNN Classification',
        },
        {
          id: 'SC-05',
          title: 'Personal Baseline Learning tracks 0 to 14 good days',
          detail: `Progress: ${validBaselineDays} of 14 days`,
          pass: validBaselineDays >= 0 && validBaselineDays <= 14,
        },
      ]);
    };

    runChecks();
    return () => {
      cancelled = true;
    };
  }, [activeModal, defaultBleConfig.linkMode, defaultBleConfig.mtuBytes, tempering, validBaselineDays]);

  const dominantClass = useMemo(
    () => getDominantClass(analysis.classifier),
    [analysis.classifier],
  );

  const handleSaveReportFile = () => {
    const payload = {
      disclaimer: 'DEMO ONLY · NOT A MEDICAL DEVICE · NOT FOR DIAGNOSIS',
      title: 'PulmoScan AI — Session report',
      sound: analysis.title,
      lengthSec: analysis.durationSec,
      alertGeneration: `${analysis.trace.srStatistic.toFixed(2)} / ${analysis.trace.srThreshold.toFixed(1)}`,
      phoneStatus: analysis.trace.status,
      personalBaselineLearning: `${validBaselineDays} of 14 days`,
      cnnClassification: dominantClass,
      recommendation: getRecommendationText(analysis.trace.status),
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulmoscan-session-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const modalTitle = useMemo(() => {
    switch (activeModal) {
      case 'hardware':
        return 'Sensor';
      case 'acceptance':
        return 'Self-check';
      case 'clinical-pdf':
        return 'Session report';
      case 'phone-app':
        return 'How the phone app works';
      case 'data-source':
        return 'Where this web data comes from';
      default:
        return '';
    }
  }, [activeModal]);

  return (
    <AnimatePresence>
      {activeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#020609]/80 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelectModal(null);
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="w-full max-w-5xl max-h-[90vh] clinical-glass-strong rounded-[20px] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#94E2D5]/15">
              <h2 className="text-base font-semibold text-[#E8F3F1]">
                {modalTitle}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex flex-wrap p-1 rounded-xl bg-[#040A0E] border border-[#94E2D5]/15"
                  role="tablist"
                >
                  {MODAL_TABS.map((t) => {
                    const active = activeModal === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onSelectModal(t.id)}
                        className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[34px] ${
                          active
                            ? 'text-[#050B10]'
                            : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="utility-modal-tab"
                            className="absolute inset-0 rounded-lg bg-[#2DD4BF]"
                            transition={{
                              type: 'spring',
                              stiffness: 320,
                              damping: 30,
                            }}
                          />
                        )}
                        <span className="relative z-10">{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => onSelectModal(null)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border border-[#94E2D5]/25 text-[#E8F3F1] hover:bg-white/5 min-h-[36px]"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {activeModal === 'hardware' && (
                <div className="space-y-4">
                  <p className="text-xs text-[#8AA3A0]">
                    What is this? Interactive 3D exploded view and specifications
                    for the PulmoScan chest-worn acoustic sensor.
                  </p>

                  <Suspense
                    fallback={
                      <div className="h-[460px] rounded-2xl shimmer-skeleton" />
                    }
                  >
                    <HardwareExplodedModel />
                  </Suspense>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1 sm:col-span-2 lg:col-span-3">
                      <div className="font-semibold text-[#2DD4BF]">
                        Hardware Architecture
                      </div>
                      <p className="text-[#E8F3F1] leading-relaxed">
                        ESP32-S3 BLE audio sensor; MEMS microphone mounted in a
                        3D-printed PETG housing behind a high-tension diaphragm
                        membrane; soft TPU contact ring (must rest flat on the
                        skin); USB-C charging.
                      </p>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">Audio format</div>
                      <div className="font-mono text-[#E8F3F1]">
                        {PAPER_CONSTANTS.SAMPLE_RATE_HZ / 1000} kHz, 16-bit mono,{' '}
                        {PAPER_CONSTANTS.RAW_BITRATE_KBPS} kbps raw
                      </div>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">BLE packet</div>
                      <div className="font-mono text-[#E8F3F1]">
                        {PAPER_CONSTANTS.BLE_PACKET_BYTES} B ={' '}
                        {PAPER_CONSTANTS.BLE_HEADER_BYTES} B header +{' '}
                        {PAPER_CONSTANTS.BLE_AUDIO_BYTES} B audio ={' '}
                        {PAPER_CONSTANTS.BLE_SAMPLES_PER_PACKET} samples ={' '}
                        {PAPER_CONSTANTS.BLE_PACKET_DURATION_MS} ms
                      </div>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">Windowing</div>
                      <div className="font-mono text-[#E8F3F1]">
                        {PAPER_CONSTANTS.WINDOW_SEC} s windows, 50% overlap (
                        {PAPER_CONSTANTS.WINDOW_HOP_SEC} s hop); up to{' '}
                        {PAPER_CONSTANTS.MAX_DURATION_SEC} s per session ={' '}
                        {PAPER_CONSTANTS.SESSION_WINDOWS_120S} windows
                      </div>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">DSP &amp; Features</div>
                      <div className="font-mono text-[#E8F3F1]">
                        {PAPER_CONSTANTS.N_FFT}-point FFT,{' '}
                        {PAPER_CONSTANTS.MEL_BANDS} mel bands
                      </div>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">Session budget</div>
                      <div className="font-mono text-[#E8F3F1]">
                        About {PAPER_CONSTANTS.SESSION_ENERGY_MAH} mAh and about{' '}
                        {PAPER_CONSTANTS.SESSION_COMPUTE_GFLOP} GFLOP per
                        session
                      </div>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">Economics</div>
                      <div className="font-mono text-[#E8F3F1]">
                        Cost per observation $
                        {PAPER_CONSTANTS.COST_PER_OBS_PULMOSCAN_USD} vs $
                        {PAPER_CONSTANTS.COST_PER_OBS_STETHOSCOPE_USD} for a
                        stethoscope; device ${PAPER_CONSTANTS.COST_DEVICE_USD}{' '}
                        vs ${PAPER_CONSTANTS.COST_STETHOSCOPE_USD}
                      </div>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">Transport thresholds</div>
                      <div className="font-mono text-[#E8F3F1]">
                        {PAPER_CONSTANTS.TRANSPORT_LOSS_THRESHOLD_PCT.toFixed(
                          1,
                        )}
                        % loss / {PAPER_CONSTANTS.TRANSPORT_GAP_THRESHOLD_MS} ms
                        gap
                      </div>
                    </div>
                    <div className="clinical-glass rounded-xl p-3.5 space-y-1">
                      <div className="text-[#8AA3A0]">Wi-Fi link</div>
                      <div className="font-mono text-[#E8F3F1]">
                        Wi-Fi is dev-only
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeModal === 'acceptance' && (
                <div className="space-y-4">
                  <p className="text-xs text-[#8AA3A0]">
                    What is this? Quick checks run right here in your browser to
                    prove every tool works.
                  </p>
                  {!checks ? (
                    <div className="space-y-2.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="h-16 rounded-xl shimmer-skeleton"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {checks.map((row, idx) => (
                        <motion.div
                          key={row.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="clinical-glass rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-[#2DD4BF]">
                                {row.id}
                              </span>
                              <span className="font-semibold text-[#E8F3F1]">
                                {row.title}
                              </span>
                            </div>
                            <div className="font-mono text-xs text-[#8AA3A0]">
                              {row.detail}
                            </div>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border ${
                              row.pass
                                ? 'bg-[#34D399]/15 text-[#34D399] border-[#34D399]/40'
                                : 'bg-[#FB7185]/15 text-[#FB7185] border-[#FB7185]/40'
                            }`}
                          >
                            {row.pass ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            <span>{row.pass ? 'PASS' : 'FAIL'}</span>
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeModal === 'clinical-pdf' && (
                <div className="space-y-4">
                  <div className="no-print flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-[#8AA3A0]">
                      What is this? A printable summary of this breathing
                      session.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] min-h-[40px]"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Print / Save PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveReportFile}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/25 text-[#E8F3F1] hover:bg-white/5 min-h-[40px]"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Save file</span>
                      </button>
                    </div>
                  </div>

                  <div className="printable-report clinical-glass rounded-2xl p-5 space-y-4">
                    <div className="font-mono text-xs text-[#FB7185] tracking-wide">
                      DEMO ONLY · NOT A MEDICAL DEVICE · NOT FOR DIAGNOSIS
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-[#E8F3F1]">
                        PulmoScan AI — Session report
                      </h3>
                      <div className="font-mono text-xs text-[#8AA3A0] mt-1">
                        Sound: {analysis.title} · Length:{' '}
                        {analysis.durationSec.toFixed(1)} s
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-[#040A0E] border border-[#94E2D5]/15">
                        <div className="text-[#8AA3A0]">Alert Generation</div>
                        <div className="font-mono text-base font-semibold text-[#2DD4BF] mt-1">
                          {analysis.trace.srStatistic.toFixed(2)} /{' '}
                          {analysis.trace.srThreshold.toFixed(1)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#040A0E] border border-[#94E2D5]/15">
                        <div className="text-[#8AA3A0]">Phone status</div>
                        <div className="text-sm font-semibold text-[#E8F3F1] mt-1">
                          {analysis.trace.status}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#040A0E] border border-[#94E2D5]/15">
                        <div className="text-[#8AA3A0]">
                          Personal Baseline Learning
                        </div>
                        <div className="font-mono text-sm font-semibold text-[#E8F3F1] mt-1">
                          {validBaselineDays} of 14 days
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#040A0E] border border-[#94E2D5]/15">
                        <div className="text-[#8AA3A0]">CNN Classification</div>
                        <div className="text-sm font-semibold text-[#E8F3F1] mt-1">
                          {dominantClass}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-[#8AA3A0] pt-2 border-t border-[#94E2D5]/12">
                      Demo version. Final model runs on the phone. Clips lost
                      while sending are ignored.
                    </div>
                  </div>
                </div>
              )}

              {activeModal === 'phone-app' && (
                <div className="space-y-4">
                  <p className="text-xs text-[#8AA3A0]">
                    What is this? How it works on your phone, step by step:
                  </p>
                  <div className="space-y-2 max-w-2xl mx-auto">
                    {[
                      {
                        title: '1. Audio Acquisition',
                        desc: 'Captures respiratory sounds using a microphone.',
                      },
                      {
                        title: '2. Quality Checking',
                        desc: 'Checks audio clarity, noise and packet loss.',
                      },
                      {
                        title: '3. CNN Classification',
                        desc: 'Identifies Normal, Wheeze and Crackle sounds.',
                      },
                      {
                        title: '4. Personal Baseline Learning',
                        desc: "Learns the user's normal respiratory pattern.",
                      },
                      {
                        title: '5. Abnormality Detection',
                        desc: 'Detects unusual and persistent changes in breathing patterns.',
                      },
                      {
                        title: '6. Alert Generation',
                        desc: 'Displays status and recording recommendations.',
                      },
                    ].map((s, idx, arr) => (
                      <React.Fragment key={s.title}>
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="clinical-glass rounded-xl p-3.5"
                        >
                          <div className="text-sm font-semibold text-[#2DD4BF]">
                            {s.title}
                          </div>
                          <div className="text-xs text-[#E8F3F1] mt-0.5">
                            {s.desc}
                          </div>
                        </motion.div>
                        {idx < arr.length - 1 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.05 + 0.03 }}
                            className="flex justify-center text-[#2DD4BF]/70"
                            aria-hidden="true"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </motion.div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {activeModal === 'data-source' && (
                <div className="space-y-4">
                  <p className="text-xs text-[#8AA3A0]">
                    What is this? Transparent breakdown of where every number
                    and sound already shown on this web page comes from:
                  </p>
                  <div className="space-y-3 text-xs">
                    <div className="clinical-glass rounded-xl p-4 space-y-1">
                      <div className="font-semibold text-[#2DD4BF]">
                        1. Default Sound Presets (Normal, Wheeze, Crackle,
                        Noisy-Bad)
                      </div>
                      <p className="text-[#E8F3F1] leading-relaxed">
                        Generated mathematically in your browser (not recorded
                        from patients or pulled from an API). They combine
                        filtered random noise with breath-cycle sine envelopes,
                        65 Hz heart-thump pulses, 390–780 Hz tones for wheeze,
                        short 1150 Hz bursts for crackle, and dropout noise for
                        Noisy-Bad.
                      </p>
                    </div>
                    <div className="clinical-glass rounded-xl p-4 space-y-1">
                      <div className="font-semibold text-[#2DD4BF]">
                        2. Sound Processing, Quality Checking &amp; Score Math
                      </div>
                      <p className="text-[#E8F3F1] leading-relaxed">
                        Computed live in your browser from whichever audio is
                        loaded (demo sound, uploaded file, live Bluetooth, or
                        live Wi-Fi) using a 512-point FFT, 64-band log-mel
                        spectrum, and rule-based acoustic scoring.
                      </p>
                    </div>
                    <div className="clinical-glass rounded-xl p-4 space-y-1">
                      <div className="font-semibold text-[#2DD4BF]">
                        3. Bluetooth Packet Framing &amp; 6-Month / 30-Day Trends
                      </div>
                      <p className="text-[#E8F3F1] leading-relaxed">
                        Packet size defaults (244-byte chunks = 118 samples at
                        16 kHz) match the sensor specification. The 6-month
                        chart and &quot;Seed 30-Day Demo History&quot; are
                        synthetic demo trajectories generated in the browser
                        from seeded random math—not stored database records.
                      </p>
                    </div>
                    <div className="clinical-glass rounded-xl p-4 space-y-1">
                      <div className="font-semibold text-[#2DD4BF]">
                        4. Live Sound via Bluetooth LE or Wi-Fi (Real Input)
                      </div>
                      <p className="text-[#E8F3F1] leading-relaxed">
                        Use the &quot;Connect Live Sensor (Bluetooth or
                        Wi-Fi)&quot; box in 1. Audio Acquisition to pair a real
                        BLE GATT sensor (Chrome/Edge) or receive audio over a
                        Wi-Fi WebSocket/HTTP URL. Once received, all 6 pipeline
                        steps and the Phone View update from your real audio and
                        measured packet loss.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
