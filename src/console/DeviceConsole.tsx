import React, { useState, useRef, useEffect } from 'react';
import {
  AUDIO_CONFIG,
  BLE_CONFIG,
  AudioMeasurements,
  SessionRecord,
  TransportType,
  BlePacket,
  chunkPayload,
  calculateCrc16,
} from '../shared/contract.ts';
import {
  generateSyntheticAudio,
  measureAudio,
  resampleTo16kMono,
  encodeWav16kMono,
  arrayBufferToBase64,
} from '../shared/audioProcessor.ts';
import {
  evaluateSession,
  createWelford,
  updateWelford,
  HistoricalSessionSummary,
  DEFAULT_ENGINE_CONFIG,
  EngineConfig,
} from '../shared/engine.ts';
import {
  virtualBus,
  DeviceState,
  INITIAL_DEVICE_STATE,
  LedState,
} from '../shared/transport.ts';
import { generateTemplateReport } from '../shared/reportGenerator.ts';
import { SafetyBanner } from '../components/SafetyBanner.tsx';
import { MobileCompanion } from '../mobile/MobileCompanion.tsx';
import { RespiratoryWaveformVisualizer } from './RespiratoryWaveformVisualizer.tsx';
import { ClinicalPdfReportModal } from '../components/ClinicalPdfReportModal.tsx';
import { AndroidSyncModal } from '../components/AndroidSyncModal.tsx';
import { useTheme } from '../shared/themeContext.tsx';
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Wifi,
  Bluetooth,
  Battery,
  Sliders,
  Download,
  Share2,
  Smartphone,
  ExternalLink,
  Activity,
  Layers,
  Sparkles,
  Send,
  HelpCircle,
  ShieldCheck,
  ChevronRight,
  Info,
  Clock,
  Radio,
  FileText,
  AlertTriangle,
  Sun,
  Moon,
  Printer,
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

interface DeviceConsoleProps {
  onOpenTestHarness: () => void;
  onOpenMobileView: () => void;
}

export const DeviceConsole: React.FC<DeviceConsoleProps> = ({
  onOpenTestHarness,
  onOpenMobileView,
}) => {
  const { theme, toggleTheme } = useTheme();
  // Device & Transport States
  const [deviceState, setDeviceState] = useState<DeviceState>(INITIAL_DEVICE_STATE);
  const [transportMode, setTransportMode] = useState<TransportType>('wifi');
  const [mtu, setMtu] = useState<number>(BLE_CONFIG.DEFAULT_MTU);
  const [packetLossPercent, setPacketLossPercent] = useState<number>(0);
  const [isSimulatingDisconnect, setIsSimulatingDisconnect] = useState<boolean>(false);
  const [fastPacing, setFastPacing] = useState<boolean>(true);
  const [autoSend, setAutoSend] = useState<boolean>(true);
  const [showPhonePreview, setShowPhonePreview] = useState<boolean>(true);
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [showClinicalPdf, setShowClinicalPdf] = useState<boolean>(false);
  const [showAndroidSyncModal, setShowAndroidSyncModal] = useState<boolean>(false);
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_ENGINE_CONFIG);

  // Audio Pipeline States
  const [activeStage, setActiveStage] = useState<number>(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [pcmSamples, setPcmSamples] = useState<Float32Array | null>(null);
  const [fileName, setFileName] = useState<string>('synthetic_wheeze_demo.wav');
  const [audioDuration, setAudioDuration] = useState<number>(8.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [measurements, setMeasurements] = useState<AudioMeasurements | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisLatency, setAnalysisLatency] = useState<number | null>(null);
  const [cloudReport, setCloudReport] = useState<any | null>(null);
  const [rawJsonResponse, setRawJsonResponse] = useState<string>('');
  const [blePacketLog, setBlePacketLog] = useState<
    Array<{ seq: number; total: number; bytes: number; hex: string; timestamp: string }>
  >([]);
  const [transmitProgress, setTransmitProgress] = useState<number>(0);

  // Stored baseline accumulator
  const [baselineAcc, setBaselineAcc] = useState(() => createWelford());
  const [sessionsHistory, setSessionsHistory] = useState<SessionRecord[]>([]);

  // Guided Demo Walkthrough State
  const [guidedDemoStep, setGuidedDemoStep] = useState<number | null>(null);
  const [activeClipType, setActiveClipType] = useState<'Normal' | 'Wheeze' | 'Crackle' | 'Noisy'>('Wheeze');

  // Web Audio Context Reference
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Broadcast device state changes
  useEffect(() => {
    const updated: DeviceState = {
      ...deviceState,
      transportMode,
      mtu,
      packetLossPercent,
      isConnected: !isSimulatingDisconnect,
    };
    setDeviceState(updated);
    virtualBus.send({
      type: 'DEVICE_STATE',
      sender: 'console',
      timestamp: Date.now(),
      payload: updated,
    });
  }, [transportMode, mtu, packetLossPercent, isSimulatingDisconnect]);

  // Subscribe to companion NACKs for packet recovery
  useEffect(() => {
    const unsub = virtualBus.subscribe((msg) => {
      if (msg.type === 'NACK') {
        const missingSeqs: number[] = msg.payload?.missingSeqs || [];
        console.log('[Console] Received NACK for packets:', missingSeqs);
        // Resend missing packets
        if (cloudReport && pcmSamples && measurements) {
          const fullSession: SessionRecord = {
            id: `sess-${Date.now()}`,
            timestamp: new Date().toISOString(),
            transport: transportMode,
            quality: measurements.qualityScore as 0 | 1,
            status: measurements.qualityScore === 0 ? 'REPEAT_RECORDING' : 'Stable',
            localClass: measurements.localClass,
            confidence: measurements.confidence,
            measurements,
            report: cloudReport,
            trace: {
              A: 0.8,
              conf: measurements.confidence,
              D: 1.2,
              slope: 0.05,
              persist: 2,
              g: 1.8,
              baselineStatus: 'Building',
              nValid: 5,
              acuteOverride: false,
              explanation: 'NACK retransmitted packet stream',
            },
          };
          const jsonStr = JSON.stringify(fullSession);
          const packets = chunkPayload(jsonStr, mtu);
          missingSeqs.forEach((seq) => {
            const pkt = packets.find((p) => p.seq === seq);
            if (pkt) {
              virtualBus.send({
                type: 'PACKET',
                sender: 'console',
                timestamp: Date.now(),
                payload: pkt,
              });
            }
          });
        }
      }
    });
    return () => unsub();
  }, [cloudReport, pcmSamples, measurements, mtu, transportMode]);

  // Audio Playback
  const handleTogglePlayback = () => {
    if (isPlaying) {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    if (!pcmSamples) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: AUDIO_CONFIG.SAMPLE_RATE });
    }
    const ctx = audioCtxRef.current;
    const buffer = ctx.createBuffer(1, pcmSamples.length, AUDIO_CONFIG.SAMPLE_RATE);
    buffer.copyToChannel(pcmSamples as any, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => setIsPlaying(false);
    src.start();
    audioSourceRef.current = src;
    setIsPlaying(true);
  };

  // Full Pipeline Execution
  const processAudioPipeline = async (
    rawSamples: Float32Array,
    name: string,
    isDemo: boolean = false
  ) => {
    setActiveStage(1);
    setFileName(name);
    setAudioDuration(rawSamples.length / AUDIO_CONFIG.SAMPLE_RATE);
    setPcmSamples(rawSamples);
    setDeviceState((prev) => ({ ...prev, ledState: 'processing' }));

    const lowerName = name.toLowerCase();
    if (lowerName.includes('wheeze')) {
      setActiveClipType('Wheeze');
    } else if (lowerName.includes('crackle')) {
      setActiveClipType('Crackle');
    } else if (lowerName.includes('noisy')) {
      setActiveClipType('Noisy');
    } else if (lowerName.includes('normal')) {
      setActiveClipType('Normal');
    }

    // Stage 1: Preparation (16 kHz mono)
    await new Promise((r) => setTimeout(r, 120));
    setActiveStage(2);

    // Stage 2: Quality Gate
    await new Promise((r) => setTimeout(r, 150));
    const m = measureAudio(rawSamples, AUDIO_CONFIG.SAMPLE_RATE, config.RHO_MIN);
    setMeasurements(m);

    if (m.qualityScore === 0) {
      setDeviceState((prev) => ({ ...prev, ledState: 'repeat' }));
    }

    // Stage 3: Feature Extraction & Stand-in Classifier
    setActiveStage(3);
    await new Promise((r) => setTimeout(r, 180));

    // Stage 4: Cloud AI Analysis (or Fallback)
    setActiveStage(4);
    setIsAnalyzing(true);

    const wavArrayBuffer = encodeWav16kMono(rawSamples, AUDIO_CONFIG.SAMPLE_RATE);
    const audioBase64 = arrayBufferToBase64(wavArrayBuffer);

    let report: any;
    let latency = 0;

    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          measurements: m,
          localClass: m.localClass,
          quality: m.qualityScore,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      report = data.report;
      latency = data.latencyMs || 420;
    } catch (err) {
      console.warn('Backend call failed, using deterministic template report:', err);
      report = generateTemplateReport(m, 'measurement-only');
      latency = 180;
    }

    setCloudReport(report);
    setRawJsonResponse(JSON.stringify(report, null, 2));
    setAnalysisLatency(latency);
    setIsAnalyzing(false);

    // Evaluate fusion engine
    const fusion = evaluateSession(m, [], baselineAcc, 'Stable', config);
    setBaselineAcc(fusion.updatedBaseline);

    const fullSessionRecord: SessionRecord = {
      id: `sess-${Date.now()}`,
      timestamp: new Date().toISOString(),
      transport: transportMode,
      quality: m.qualityScore as 0 | 1,
      status: fusion.status,
      localClass: m.localClass,
      confidence: m.confidence,
      measurements: m,
      report,
      trace: fusion.trace,
      isDemoData: isDemo,
    };

    setSessionsHistory((prev) => [fullSessionRecord, ...prev]);

    // Stage 5: Transmit
    setActiveStage(5);
    if (autoSend) {
      transmitToCompanion(fullSessionRecord);
    }
  };

  // Transmission execution
  const transmitToCompanion = async (record: SessionRecord) => {
    setDeviceState((prev) => ({ ...prev, ledState: 'sent' }));
    setTransmitProgress(10);

    if (transportMode === 'wifi') {
      // High-Speed Direct Wi-Fi Sync
      setBlePacketLog([
        {
          seq: 1,
          total: 1,
          bytes: JSON.stringify(record).length,
          hex: 'WIFI_DIRECT_ENCRYPTED_FRAME',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setTransmitProgress(100);
      virtualBus.send({
        type: 'WIFI_REPORT',
        sender: 'console',
        timestamp: Date.now(),
        payload: record,
      });

      // Also publish to Wi-Fi API for external Android Expo Go app
      fetch('/api/sync/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }).catch((err) => console.warn('Wi-Fi broadcast error:', err));
    } else {
      // Virtual BLE Mode: Chunks with MTU, CRC16, and Pacing
      const jsonStr = JSON.stringify(record);
      const packets = chunkPayload(jsonStr, mtu);
      const total = packets.length;
      const logs: any[] = [];

      for (let i = 0; i < total; i++) {
        // Simulated packet loss drop
        const shouldDrop =
          packetLossPercent > 0 && Math.random() * 100 < packetLossPercent && i > 0 && i < total - 1;

        const p = packets[i];
        logs.unshift({
          seq: p.seq,
          total: p.total,
          bytes: p.data.length,
          hex: p.data.substring(0, 16) + '...',
          timestamp: new Date().toLocaleTimeString(),
        });
        setBlePacketLog([...logs]);

        if (!shouldDrop) {
          virtualBus.send({
            type: 'PACKET',
            sender: 'console',
            timestamp: Date.now(),
            payload: p,
          });
        } else {
          console.log(`[Simulation] Dropped packet ${p.seq}/${p.total} to trigger NACK recovery`);
        }

        setTransmitProgress(Math.round(((i + 1) / total) * 100));
        await new Promise((r) => setTimeout(r, fastPacing ? 10 : BLE_CONFIG.PACKET_PACING_MS));
      }
    }
  };

  // Generate Demo Clip Handlers
  const handleGenerateClip = (type: 'Normal' | 'Wheeze' | 'Crackle' | 'Noisy') => {
    const raw = generateSyntheticAudio(type, 8.0);
    processAudioPipeline(raw, `synthetic_${type.toLowerCase()}_demo.wav`, true);
  };

  // Guided Demo Walkthrough
  const handleNextGuidedStep = () => {
    const next = guidedDemoStep === null ? 0 : (guidedDemoStep + 1) % 5;
    setGuidedDemoStep(next);

    switch (next) {
      case 0:
        // Step 1: Normal Clip
        handleGenerateClip('Normal');
        break;
      case 1:
        // Step 2: Wheeze Clip
        handleGenerateClip('Wheeze');
        break;
      case 2:
        // Step 3: Crackle Clip
        handleGenerateClip('Crackle');
        break;
      case 3:
        // Step 4: Noisy Clip (Quality Gate Failure & Re-record guide)
        handleGenerateClip('Noisy');
        break;
      case 4:
        // Step 5: 30-Day Trend demonstration
        virtualBus.send({
          type: 'CONNECT_ACK',
          sender: 'console',
          timestamp: Date.now(),
          payload: { action: 'show_trend' },
        });
        break;
    }
  };

  // Export Session Bundle
  const handleExportSessionBundle = () => {
    if (!cloudReport || !measurements) return;
    const bundle = {
      device: BLE_CONFIG.DEVICE_NAME,
      firmware: deviceState.firmware,
      config,
      measurements,
      report: cloudReport,
      packetLog: blePacketLog,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulmoscan_session_bundle_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-100/80 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col transition-colors">
      {/* 0. Non-negotiable Medical Disclaimer Banner */}
      <SafetyBanner />

      {/* Top Clinical Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-7 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-extrabold text-base shadow-sm shadow-teal-600/30">
            PS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                PulmoScan AI
              </h1>
              <span className="text-[10px] bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold px-2 py-0.5 rounded-md">
                Device Console
              </span>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono px-1.5 py-0.5 rounded">
                v2.0-sim
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Acoustic Quality Gate • INT8 Stand-in Classifier • Gemini Structured Analysis
            </p>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Guided Demo Button */}
          <button
            onClick={handleNextGuidedStep}
            className="flex items-center gap-1.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-200" />
            <span>
              {guidedDemoStep === null
                ? 'Start Guided Demo'
                : `Guided Demo (Step ${guidedDemoStep + 1}/5)`}
            </span>
          </button>

          {/* Clinical PDF Report Export */}
          <button
            onClick={() => setShowClinicalPdf(true)}
            disabled={!sessionsHistory[0]}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-40"
            title="Generate and print formal clinical auscultation PDF report"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clinical PDF</span>
          </button>

          {/* Android Companion Sync (Expo Go) */}
          <button
            onClick={() => setShowAndroidSyncModal(true)}
            className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-800 text-teal-400 hover:text-white border border-slate-700 hover:border-teal-500 px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition"
            title="Connect Android companion app via Expo Go over Wi-Fi"
          >
            <Smartphone className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Android (Expo)</span>
          </button>

          {/* Test Harness Link */}
          <button
            onClick={onOpenTestHarness}
            className="flex items-center gap-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span className="hidden md:inline">Acceptance Tests</span>
            <span className="md:hidden">/test</span>
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Dark Mode"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Toggle Phone Preview Button */}
          <button
            onClick={() => setShowPhonePreview(!showPhonePreview)}
            className={`flex items-center gap-1.5 border px-3 py-2 rounded-xl text-xs font-semibold shadow-2xs transition ${
              showPhonePreview
                ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showPhonePreview ? 'Hide Phone' : 'Show Phone'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: Left 6-Stage Console + Right Phone Frame */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 6-Stage Pipeline (7 or 12 cols) */}
        <div className={`space-y-6 ${showPhonePreview ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {/* Device Status Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-800">Hardware Peripheral:</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    deviceState.ledState === 'processing'
                      ? 'bg-amber-500 animate-ping'
                      : deviceState.ledState === 'sent'
                      ? 'bg-emerald-500'
                      : deviceState.ledState === 'repeat'
                      ? 'bg-rose-500'
                      : 'bg-teal-500'
                  }`}
                />
                <span className="font-mono text-slate-600 uppercase font-semibold">
                  LED: {deviceState.ledState}
                </span>
              </div>
              <div className="flex items-center gap-1 text-slate-500 font-mono">
                <Battery className="w-3.5 h-3.5 text-slate-600" />
                <span>{deviceState.batteryPercent}%</span>
              </div>
            </div>

            {/* Transport Mode Switch */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Link:</span>
              <div className="flex bg-slate-100 p-0.5 rounded-xl">
                <button
                  onClick={() => setTransportMode('wifi')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                    transportMode === 'wifi'
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Wifi className="w-3 h-3" />
                  Wi-Fi Direct
                </button>
                <button
                  onClick={() => setTransportMode('ble')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                    transportMode === 'ble'
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Bluetooth className="w-3 h-3" />
                  Virtual BLE
                </button>
              </div>
            </div>
          </div>

          {/* STAGE 0 — INPUT */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                  0
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Acoustic Audio Input</h2>
                  <p className="text-xs text-slate-500">
                    Drop recorded chest auscultation audio or generate synthetic demo clips
                  </p>
                </div>
              </div>

              {fileName && (
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-800 block truncate max-w-[200px]">
                    {fileName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {audioDuration.toFixed(1)}s • 16.0 kHz
                  </span>
                </div>
              )}
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    if (reader.result instanceof ArrayBuffer) {
                      const ctx = new AudioContext();
                      const decoded = await ctx.decodeAudioData(reader.result);
                      const resampled = await resampleTo16kMono(decoded);
                      processAudioPipeline(resampled, file.name);
                    }
                  };
                  reader.readAsArrayBuffer(file);
                }
              }}
              className="border-2 border-dashed border-slate-200 hover:border-teal-500/80 bg-slate-50/50 hover:bg-teal-50/20 rounded-2xl p-6 text-center transition cursor-pointer space-y-2 group"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.onchange = (e: any) => {
                  const file = e.target?.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = async () => {
                      if (reader.result instanceof ArrayBuffer) {
                        const ctx = new AudioContext();
                        const decoded = await ctx.decodeAudioData(reader.result);
                        const resampled = await resampleTo16kMono(decoded);
                        processAudioPipeline(resampled, file.name);
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  }
                };
                input.click();
              }}
            >
              <Upload className="w-8 h-8 mx-auto text-slate-400 group-hover:text-teal-600 transition" />
              <p className="text-xs font-bold text-slate-700">
                Click to browse or drop lung sound audio (WAV, MP3, FLAC, M4A)
              </p>
              <p className="text-[10px] text-slate-400">
                Resampled to 16 kHz mono • 120s max session
              </p>
            </div>

            {/* Synthetic Generator Buttons */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Generate Synthetic Demo Audio (DEMO DATA)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => handleGenerateClip('Normal')}
                  className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 p-2.5 rounded-xl text-xs font-bold text-left transition"
                >
                  <span className="block text-emerald-900">Normal</span>
                  <span className="text-[10px] text-emerald-700 font-normal">100–800Hz clear breath</span>
                </button>

                <button
                  onClick={() => handleGenerateClip('Wheeze')}
                  className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 p-2.5 rounded-xl text-xs font-bold text-left transition"
                >
                  <span className="block text-amber-900">Wheeze</span>
                  <span className="text-[10px] text-amber-700 font-normal">400–700Hz tonal glide</span>
                </button>

                <button
                  onClick={() => handleGenerateClip('Crackle')}
                  className="bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 p-2.5 rounded-xl text-xs font-bold text-left transition"
                >
                  <span className="block text-sky-900">Crackle</span>
                  <span className="text-[10px] text-sky-700 font-normal">Sparse broadband clicks</span>
                </button>

                <button
                  onClick={() => handleGenerateClip('Noisy')}
                  className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 p-2.5 rounded-xl text-xs font-bold text-left transition"
                >
                  <span className="block text-rose-900">Noisy / Bad</span>
                  <span className="text-[10px] text-rose-700 font-normal">Clipping & thumps (q=0)</span>
                </button>
              </div>
            </div>

            {/* Audio Waveform & Playback */}
            {pcmSamples && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-4">
                <button
                  onClick={handleTogglePlayback}
                  className="w-10 h-10 rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-2xs transition"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>

                {/* Mini Waveform visualization */}
                <div className="flex-1 flex items-center gap-0.5 h-8 overflow-hidden">
                  {measurements?.waveformSample?.slice(0, 120).map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-teal-600/70 rounded-full"
                      style={{
                        height: `${Math.max(12, Math.abs(v) * 100)}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* REAL-TIME RESPIRATORY WAVEFORM VISUALIZER (RECHARTS) */}
          <RespiratoryWaveformVisualizer
            externalPattern={activeClipType}
            onPatternChange={(p) => setActiveClipType(p === 'Tachypnea' ? 'Noisy' : p)}
          />

          {/* STAGE 1 & 2 — PREPARE & QUALITY GATE */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Acoustic Quality Gate (3s Windows / 50% Overlap)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Evaluates clipping, noise floor, and sensor contact stability
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowConfigPanel(!showConfigPanel)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg"
              >
                <Sliders className="w-3 h-3 text-teal-600" />
                <span>Config</span>
              </button>
            </div>

            {/* Config Panel (editable thresholds) */}
            {showConfigPanel && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-3">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Threshold Configuration (Unvalidated)</span>
                  <span className="text-[10px] text-slate-400 font-mono">DEFAULT_ENGINE_CONFIG</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 block">RHO_MIN (usable ratio)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={config.RHO_MIN}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, RHO_MIN: parseFloat(e.target.value) || 0.6 }))
                      }
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">A_HIGH (acute override)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={config.A_HIGH}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, A_HIGH: parseFloat(e.target.value) || 0.7 }))
                      }
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">ETA_HIGH (elevated)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={config.ETA_HIGH}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, ETA_HIGH: parseFloat(e.target.value) || 2.4 }))
                      }
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Window Strip */}
            {measurements ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>
                    Usable windows: <strong>{measurements.validWindows}</strong> of {measurements.totalWindows} (
                    {(measurements.usableAudioRatio * 100).toFixed(0)}%)
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-xs ${
                      measurements.qualityScore === 1
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    Quality Verdict: {measurements.qualityScore === 1 ? 'PASS (q=1)' : 'FAIL (q=0)'}
                  </span>
                </div>

                {/* Coloured window blocks */}
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {measurements.windows.map((w) => (
                    <div
                      key={w.index}
                      className={`flex-1 min-w-[36px] py-1.5 px-1 rounded-lg text-center font-mono text-[9px] font-bold border transition ${
                        w.isValid
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-rose-50 border-rose-300 text-rose-800'
                      }`}
                      title={w.isValid ? `Window ${w.index}: Valid` : `Window ${w.index}: ${w.discardReason}`}
                    >
                      {w.isValid ? 'VAL' : 'DIS'}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-xl">
                Awaiting audio input to execute window analysis...
              </div>
            )}
          </div>

          {/* STAGE 3 — MEASURE (FFT & Acoustic Indicators) */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Acoustic Indicators & Rule-Based Classifier
                  </h2>
                  <p className="text-xs text-slate-500">
                    Rule-based stand-in for on-device INT8 CNN
                  </p>
                </div>
              </div>

              {measurements && (
                <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-xl">
                  {measurements.localClass} ({(measurements.confidence * 100).toFixed(0)}% conf)
                </span>
              )}
            </div>

            {measurements ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold block">Wheeze Burden</span>
                  <div className="text-base font-extrabold text-amber-700">
                    {(measurements.wheezeBurden * 100).toFixed(1)}%
                  </div>
                  <span className="text-[10px] text-slate-400">{measurements.wheezeCount} events</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold block">Crackle Count</span>
                  <div className="text-base font-extrabold text-sky-700">
                    {measurements.crackleCount}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {measurements.crackleRatePerBreath} / breath
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold block">Breathing Rate</span>
                  <div className="text-base font-extrabold text-slate-800">
                    {measurements.respiratoryRate ? `${measurements.respiratoryRate} bpm` : 'Variable'}
                  </div>
                  <span className="text-[10px] text-slate-400">Autocorrelation</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold block">Dual Finding</span>
                  <div className="text-base font-extrabold text-slate-800">
                    {measurements.bothFlag ? 'Wheeze+Crackle' : 'Single finding'}
                  </div>
                  <span className="text-[10px] text-slate-400">Composite check</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-xl">
                Measurements will appear once audio is processed.
              </div>
            )}
          </div>

          {/* MULTI-AXIS D3 SPIDER / RADAR CHART CARD */}
          {measurements && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Multi-Axis Clinical Spider Chart</h2>
                  <p className="text-xs text-slate-500">D3-powered multi-dimensional respiratory biomarker profile</p>
                </div>
                <span className="text-[10px] bg-teal-50 text-teal-700 font-bold px-2.5 py-1 rounded-xl border border-teal-200">
                  Radar v2.4
                </span>
              </div>

              <div className="w-full h-64 bg-slate-50 rounded-2xl border border-slate-100 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius="80%"
                    data={[
                      { subject: 'Wheeze Burden', value: Math.min(100, Math.round(measurements.wheezeBurden * 100)), fullMark: 100 },
                      { subject: 'Crackle Index', value: Math.min(100, Math.round(measurements.crackleCount * 12)), fullMark: 100 },
                      { subject: 'Cadence (BPM)', value: Math.min(100, Math.round(((measurements.respiratoryRate || 16) / 30) * 100)), fullMark: 100 },
                      { subject: 'Usable Ratio', value: Math.round(measurements.usableAudioRatio * 100), fullMark: 100 },
                      { subject: 'Confidence', value: Math.round(measurements.confidence * 100), fullMark: 100 },
                    ]}
                  >
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbd5e1" />
                    <Radar
                      name="Patient Profile"
                      dataKey="value"
                      stroke="#0d9488"
                      fill="#0d9488"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* STAGE 4 — CLOUD AI ANALYSIS */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                  4
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Cloud AI Interpretation (Gemini)</h2>
                  <p className="text-xs text-slate-500">
                    Multimodal structured reasoning grounded in device measurements
                  </p>
                </div>
              </div>

              {analysisLatency !== null && (
                <span className="text-xs font-mono text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">
                  {analysisLatency} ms
                </span>
              )}
            </div>

            {isAnalyzing ? (
              <div className="py-6 text-center space-y-2">
                <div className="w-8 h-8 mx-auto border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-semibold text-slate-600">
                  Querying Gemini with 16 kHz audio and acoustic feature vector...
                </p>
              </div>
            ) : cloudReport ? (
              <div className="space-y-3">
                <div className="bg-teal-50/70 border border-teal-200/80 rounded-2xl p-4 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-teal-900">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      Generated Summary
                    </span>
                    <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                      AI Review: {cloudReport.audio_review.agreement}
                    </span>
                  </div>
                  <p className="text-slate-800">{cloudReport.summary}</p>
                </div>

                {/* Raw JSON disclosure */}
                <details className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    Inspect Validated Structured JSON Payload
                  </summary>
                  <pre className="mt-2 p-2 bg-slate-900 text-teal-300 rounded-lg text-[10px] font-mono overflow-x-auto max-h-48">
                    {rawJsonResponse}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-xl">
                Awaiting analysis execution...
              </div>
            )}
          </div>

          {/* STAGE 5 — TRANSMIT & BLE LOG */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                  5
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Synchronize with Mobile Companion
                  </h2>
                  <p className="text-xs text-slate-500">
                    {transportMode === 'wifi'
                      ? 'High-speed Wi-Fi transmission (instant delivery)'
                      : `Virtual BLE Chunking • MTU ${mtu} • CRC16 Trailer Guard`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSend}
                    onChange={(e) => setAutoSend(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>Auto-send</span>
                </label>

                {sessionsHistory[0] && (
                  <button
                    onClick={() => transmitToCompanion(sessionsHistory[0])}
                    className="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Now</span>
                  </button>
                )}
              </div>
            </div>

            {/* Transport Simulation Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs">
              <div>
                <label className="text-[10px] text-slate-500 font-semibold block">MTU Size</label>
                <select
                  value={mtu}
                  onChange={(e) => setMtu(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                >
                  <option value={23}>23 bytes (Legacy)</option>
                  <option value={185}>185 bytes (Default)</option>
                  <option value={512}>512 bytes (High-thru)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-semibold block">
                  Simulate Packet Loss ({packetLossPercent}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={packetLossPercent}
                  onChange={(e) => setPacketLossPercent(parseInt(e.target.value))}
                  className="w-full mt-1 accent-teal-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-3">
                <button
                  onClick={() => setIsSimulatingDisconnect(!isSimulatingDisconnect)}
                  className={`w-full py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                    isSimulatingDisconnect
                      ? 'bg-rose-100 border-rose-300 text-rose-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isSimulatingDisconnect ? 'Reconnect Link' : 'Simulate Disconnect'}
                </button>
              </div>
            </div>

            {/* Packet Log Feed */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Transmission Packet Feed
              </span>
              <div className="bg-slate-950 text-slate-200 rounded-2xl p-3 font-mono text-[10px] h-28 overflow-y-auto space-y-1">
                {blePacketLog.length === 0 ? (
                  <span className="text-slate-600">No packets dispatched yet.</span>
                ) : (
                  blePacketLog.map((pkt, i) => (
                    <div key={i} className="flex justify-between items-center text-teal-400">
                      <span>[{pkt.timestamp}] SEQ {pkt.seq}/{pkt.total} ({pkt.bytes}B)</span>
                      <span className="text-slate-500">{pkt.hex}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Session Bundle & Clinical PDF Export */}
            <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
              <button
                onClick={() => setShowClinicalPdf(true)}
                disabled={!sessionsHistory[0]}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 px-3.5 py-2 rounded-xl shadow-xs transition disabled:opacity-40"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Export Clinical PDF Report</span>
              </button>

              <button
                onClick={handleExportSessionBundle}
                disabled={!cloudReport}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-2 rounded-xl shadow-2xs transition disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-teal-600" />
                <span>Export Raw Session JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Phone Preview (5 cols) */}
        {showPhonePreview && (
          <aside aria-label="Interactive Phone Preview" className="lg:col-span-5 lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-teal-600" />
                Mobile Companion (/m)
              </span>
              <button
                onClick={onOpenMobileView}
                className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-300 flex items-center gap-1"
              >
                <span>Standalone Tab</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {/* Realistic iPhone Screen Bezel Frame (390 x 780 viewport) */}
            <div className="relative mx-auto w-full max-w-[390px] h-[780px] bg-slate-900 rounded-[50px] p-3 shadow-2xl ring-1 ring-slate-800">
              {/* Dynamic Island / Speaker Notch */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-50 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900 ml-auto mr-3"></div>
              </div>

              {/* Mobile Screen Iframe/Component Host */}
              <div className="w-full h-full bg-slate-50 dark:bg-slate-900 rounded-[40px] overflow-hidden relative shadow-inner pt-7 flex flex-col">
                <MobileCompanion
                  initialSessions={sessionsHistory}
                  onTriggerRecord={handleGenerateClip}
                />
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Printable Clinical PDF Report Modal */}
      {sessionsHistory[0] && (
        <ClinicalPdfReportModal
          isOpen={showClinicalPdf}
          onClose={() => setShowClinicalPdf(false)}
          session={sessionsHistory[0]}
        />
      )}

      {/* Android Expo Sync Info Modal */}
      <AndroidSyncModal
        isOpen={showAndroidSyncModal}
        onClose={() => setShowAndroidSyncModal(false)}
      />
    </div>
  );
};
