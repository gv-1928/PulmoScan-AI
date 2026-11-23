import React, { Suspense, lazy, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing,
  BrainCircuit,
  FileText,
  LineChart,
  Radio,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { getDominantClass } from '../features/pipeline';
import { LiveCaptureFinal } from '../transport/liveReceiver';
import {
  BleLinkConfig,
  ConsoleStepId,
  LinkMode,
  PhonePhase,
  PhoneStatus,
  PresetId,
  QualityState,
  SessionAnalysisResult,
  UtilityModalId,
} from '../types/pulmoscan';
import { BluetoothLinkPanel } from '../ui/BluetoothLinkPanel';
import { ClassifierPanel } from '../ui/ClassifierPanel';
import { LiveHardwarePanel } from '../ui/LiveHardwarePanel';
import { QualityTimeline } from '../ui/QualityTimeline';
import {
  AnimatedNumber,
  getDataOriginLabel,
  getRecommendationText,
  getStatusVisual,
} from '../ui/shared';
import { WaveformCanvas } from '../ui/WaveformCanvas';

const DetectorBenchmarkPanel = lazy(() =>
  import('../ui/DetectorBenchmarkPanel').then((m) => ({
    default: m.DetectorBenchmarkPanel,
  })),
);

interface LiveLabSectionProps {
  activeStep: ConsoleStepId;
  onSelectStep: (step: ConsoleStepId) => void;
  activePreset: PresetId;
  breathsPerMin: number;
  bleConfig: BleLinkConfig;
  tempering: number;
  validBaselineDays: number;
  phonePhase: PhonePhase;
  analysis: SessionAnalysisResult;
  isProcessingAudio: boolean;
  uploadError: string | null;
  onSelectPreset: (preset: PresetId, syncImmediately?: boolean) => void;
  onChangeBpm: (bpm: number) => void;
  onUploadFile: (file: File) => void;
  onLiveCaptureComplete: (
    result: LiveCaptureFinal & { linkMode: LinkMode },
  ) => void;
  onChangeBleConfig: (config: BleLinkConfig) => void;
  onChangeTempering: (val: number) => void;
  onSyncToPhone: () => void;
  onOpenModal: (modal: UtilityModalId) => void;
  onPlaybackChange?: (state: {
    isPlaying: boolean;
    timeSec: number;
    rms: number;
  }) => void;
}

const STEP_ITEMS: Array<{
  id: ConsoleStepId;
  num: number;
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'input',
    num: 1,
    title: 'Audio Acquisition',
    subtitle: 'Microphone & sound',
    Icon: Upload,
  },
  {
    id: 'quality-gate',
    num: 2,
    title: 'Quality Checking',
    subtitle: 'Clarity, noise & loss',
    Icon: ShieldAlert,
  },
  {
    id: 'classifier',
    num: 3,
    title: 'CNN Classification',
    subtitle: 'Normal, Wheeze, Crackle',
    Icon: BrainCircuit,
  },
  {
    id: 'sync',
    num: 4,
    title: 'Personal Baseline Learning',
    subtitle: 'Bluetooth & normal pattern',
    Icon: Radio,
  },
  {
    id: 'detector',
    num: 5,
    title: 'Abnormality Detection',
    subtitle: 'Persistent changes',
    Icon: LineChart,
  },
  {
    id: 'alert-gen',
    num: 6,
    title: 'Alert Generation',
    subtitle: 'Status & advice',
    Icon: BellRing,
  },
];

const PRESET_CARDS: Array<{
  id: PresetId;
  title: string;
  subtitle: string;
}> = [
  { id: 'normal', title: 'Normal breath', subtitle: 'Steady quiet breathing' },
  {
    id: 'wheeze',
    title: 'Wheeze sound',
    subtitle: 'Soft whistle on breath out',
  },
  {
    id: 'crackle',
    title: 'Crackle sound',
    subtitle: 'Short pops on breath in',
  },
  {
    id: 'noisy',
    title: 'Noisy-Bad',
    subtitle: 'Loose fit and room noise',
  },
];

export const LiveLabSection: React.FC<LiveLabSectionProps> = ({
  activeStep,
  onSelectStep,
  activePreset,
  breathsPerMin,
  bleConfig,
  tempering,
  validBaselineDays,
  phonePhase,
  analysis,
  isProcessingAudio,
  uploadError,
  onSelectPreset,
  onChangeBpm,
  onUploadFile,
  onLiveCaptureComplete,
  onChangeBleConfig,
  onChangeTempering,
  onSyncToPhone,
  onOpenModal,
  onPlaybackChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  let validCount = 0;
  let transportCount = 0;
  let acqCount = 0;
  for (const w of analysis.windows) {
    if (w.qualityState === QualityState.VALID) validCount++;
    else if (w.qualityState === QualityState.TRANSPORT_CENSORED)
      transportCount++;
    else acqCount++;
  }

  const dominantClass = getDominantClass(analysis.classifier);
  const effectiveStatus =
    phonePhase === 'READY' ? PhoneStatus.READY : analysis.trace.status;
  const statusVis = getStatusVisual(effectiveStatus);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onUploadFile(files[0]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Step Rail (3 cols on lg+) */}
      <div className="lg:col-span-3 space-y-3">
        <nav
          aria-label="PulmoScan 6-step pipeline"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2"
        >
          {STEP_ITEMS.map(({ id, num, title, subtitle, Icon }) => {
            const active = activeStep === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelectStep(id)}
                className={`relative text-left p-3 rounded-2xl border transition-all min-h-[54px] flex items-center gap-3 overflow-hidden ${
                  active
                    ? 'clinical-glass-strong border-[#2DD4BF]/55 shadow-[0_0_20px_rgba(45,212,191,0.18)] text-[#E8F3F1]'
                    : 'clinical-glass border-[#94E2D5]/14 text-[#8AA3A0] hover:text-[#E8F3F1] hover:border-[#94E2D5]/30'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="step-rail-active"
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[#2DD4BF]"
                    transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                  />
                )}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                    active
                      ? 'bg-[#2DD4BF]/18 border-[#2DD4BF]/40 text-[#2DD4BF]'
                      : 'bg-[#040A0E]/60 border-[#94E2D5]/15 text-[#8AA3A0]'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate text-[#E8F3F1]">
                    {num}. {title}
                  </div>
                  <div className="text-[11px] truncate text-[#8AA3A0]">
                    {subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Live numbers card (desktop only) */}
        <div className="hidden lg:block clinical-glass rounded-2xl p-4 space-y-2.5 font-mono text-xs">
          <div className="clinical-caption text-[#8AA3A0]">Live numbers</div>
          <div className="flex items-center justify-between">
            <span className="text-[#8AA3A0]">Processing time</span>
            <AnimatedNumber
              value={analysis.dspTimeMs}
              decimals={1}
              suffix=" ms"
              className="text-[#E8F3F1]"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#8AA3A0]">Clips</span>
            <span className="text-[#E8F3F1]">
              <AnimatedNumber value={validCount} />G /{' '}
              <AnimatedNumber value={transportCount} />L /{' '}
              <AnimatedNumber value={acqCount} />B
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-[#94E2D5]/12">
            <span className="text-[#8AA3A0]">Alert score</span>
            <span className="text-[#2DD4BF] font-semibold">
              <AnimatedNumber value={analysis.trace.srStatistic} decimals={2} />{' '}
              / {analysis.trace.srThreshold.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Stage Card (9 cols on lg+) */}
      <div className="lg:col-span-9 clinical-glass rounded-[20px] p-4 sm:p-6 relative overflow-hidden">
        {/* Processing progress sweep */}
        {isProcessingAudio && (
          <motion.div
            aria-hidden="true"
            className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#2DD4BF] to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeStep === 'input' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-lg font-semibold text-[#E8F3F1]">
                        1. Audio Acquisition
                      </h2>
                      <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-lg bg-[#2DD4BF]/14 text-[#2DD4BF] border border-[#2DD4BF]/30">
                        {getDataOriginLabel(analysis.dataOrigin)}
                      </span>
                    </div>
                    <p className="text-sm text-[#8AA3A0] mt-1">
                      Captures respiratory sounds using a live Bluetooth/Wi-Fi
                      sensor, a demo sample, or your own sound file.
                    </p>
                  </div>
                </div>

                {/* A) LiveHardwarePanel */}
                <LiveHardwarePanel onCaptureComplete={onLiveCaptureComplete} />

                {/* B) Upload + presets row */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Dashed drop zone (5 cols) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      handleFiles(e.dataTransfer.files);
                    }}
                    className={`md:col-span-5 rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center gap-2.5 transition-all ${
                      isDragOver
                        ? 'border-[#2DD4BF] bg-[#2DD4BF]/10 shadow-[0_0_24px_rgba(45,212,191,0.22)]'
                        : 'border-[#94E2D5]/25 bg-[#040A0E]/55 hover:border-[#2DD4BF]/50'
                    }`}
                  >
                    <Upload
                      className="w-6 h-6 text-[#2DD4BF]"
                      aria-hidden="true"
                    />
                    <div className="text-xs font-medium text-[#E8F3F1]">
                      Drop your audio file here
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.wav,.mp3,.flac,.m4a"
                      className="hidden"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/30 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                    >
                      Choose file
                    </button>
                    {uploadError && (
                      <div
                        role="alert"
                        className="text-xs text-[#FB7185] mt-1 font-medium"
                      >
                        {uploadError}
                      </div>
                    )}
                  </div>

                  {/* 2x2 preset cards (7 cols) */}
                  <div className="md:col-span-7 grid grid-cols-2 gap-3">
                    {PRESET_CARDS.map((card) => {
                      const selected = activePreset === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => onSelectPreset(card.id, true)}
                          className={`text-left p-3.5 rounded-2xl border transition-all min-h-[76px] ${
                            selected
                              ? 'bg-[#2DD4BF]/14 border-[#2DD4BF] shadow-[0_0_20px_rgba(45,212,191,0.2)]'
                              : 'clinical-glass border-[#94E2D5]/14 hover:border-[#2DD4BF]/40'
                          }`}
                        >
                          <div className="text-sm font-semibold text-[#E8F3F1]">
                            {card.title}
                          </div>
                          <div className="text-xs text-[#8AA3A0] mt-1">
                            {card.subtitle}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* C) WaveformCanvas */}
                <WaveformCanvas
                  title={analysis.title}
                  samples={analysis.rawSamples}
                  sampleRate={analysis.sampleRate}
                  durationSec={analysis.durationSec}
                  breathPhases={analysis.breathPhases}
                  melSpectrogram={analysis.melSpectrogram}
                  melTimesSec={analysis.melTimesSec}
                  activePreset={activePreset}
                  breathsPerMin={breathsPerMin}
                  onSelectPreset={(preset) => onSelectPreset(preset, true)}
                  onChangeBpm={onChangeBpm}
                  onPlaybackChange={onPlaybackChange}
                />
              </div>
            )}

            {activeStep === 'quality-gate' && (
              <QualityTimeline windows={analysis.windows} />
            )}

            {activeStep === 'classifier' && (
              <ClassifierPanel
                classifier={analysis.classifier}
                windows={analysis.windows}
              />
            )}

            {activeStep === 'sync' && (
              <BluetoothLinkPanel
                bleConfig={bleConfig}
                onChangeConfig={onChangeBleConfig}
                bleResult={analysis.bleResult}
                rawSamples={analysis.rawSamples}
                windows={analysis.windows}
                srStatistic={analysis.trace.srStatistic}
                srThreshold={analysis.trace.srThreshold}
                validBaselineDays={validBaselineDays}
                onSyncToPhone={onSyncToPhone}
              />
            )}

            {activeStep === 'detector' && (
              <Suspense
                fallback={
                  <div className="space-y-4">
                    <div className="h-8 w-64 rounded-xl shimmer-skeleton" />
                    <div className="h-64 w-full rounded-2xl shimmer-skeleton" />
                    <div className="h-32 w-full rounded-2xl shimmer-skeleton" />
                  </div>
                }
              >
                <DetectorBenchmarkPanel
                  tempering={tempering}
                  onChangeTempering={onChangeTempering}
                />
              </Suspense>
            )}

            {activeStep === 'alert-gen' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="clinical-caption text-[#2DD4BF]">
                      6. ALERT GENERATION
                    </div>
                    <h2 className="text-lg font-semibold text-[#E8F3F1] mt-0.5">
                      6. Alert Generation
                    </h2>
                    <p className="text-sm text-[#8AA3A0] mt-0.5">
                      Displays status and recording recommendations.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenModal('clinical-pdf')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/30 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Session report</span>
                  </button>
                </div>

                {/* Three stat cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="clinical-glass rounded-2xl p-4 space-y-1.5">
                    <div className="text-xs text-[#8AA3A0]">Current Status</div>
                    <div className={`text-lg font-semibold ${statusVis.color}`}>
                      {phonePhase === 'READY'
                        ? 'Ready for Recording'
                        : analysis.trace.status}
                    </div>
                    <div
                      className={`font-mono text-xs ${
                        statusVis.isAlertTone
                          ? 'text-[#FB7185]'
                          : 'text-[#2DD4BF]'
                      }`}
                    >
                      Score {analysis.trace.srStatistic.toFixed(2)} /{' '}
                      {analysis.trace.srThreshold.toFixed(1)}
                    </div>
                  </div>

                  <div className="clinical-glass rounded-2xl p-4 space-y-1.5">
                    <div className="text-xs text-[#8AA3A0]">
                      Personal Baseline Learning
                    </div>
                    <div className="font-mono text-lg font-semibold text-[#E8F3F1]">
                      {validBaselineDays} of 14 days
                    </div>
                    <div className="text-xs text-[#8AA3A0]">
                      Learns the user&apos;s normal respiratory pattern.
                    </div>
                  </div>

                  <div className="clinical-glass rounded-2xl p-4 space-y-1.5">
                    <div className="text-xs text-[#8AA3A0]">
                      CNN Classification
                    </div>
                    <div className="text-lg font-semibold text-[#E8F3F1]">
                      {dominantClass}
                    </div>
                    <div className="text-xs text-[#8AA3A0]">
                      Demo version. Final model runs on the phone.
                    </div>
                  </div>
                </div>

                {/* Recording recommendations card */}
                <div className="instrument-panel rounded-2xl p-4 space-y-1.5">
                  <div className="text-xs font-semibold text-[#2DD4BF]">
                    Recording recommendations
                  </div>
                  <p className="text-sm text-[#E8F3F1]">
                    {getRecommendationText(effectiveStatus)}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
