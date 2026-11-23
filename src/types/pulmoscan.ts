export type PresetId =
  | 'normal'
  | 'wheeze'
  | 'crackle'
  | 'noisy'
  | 'custom'
  | 'live-ble'
  | 'live-wifi';

export type DataOrigin =
  | 'synthetic-demo'
  | 'uploaded-file'
  | 'live-bluetooth'
  | 'live-wifi';

export enum QualityState {
  VALID = 'VALID',
  TRANSPORT_CENSORED = 'TRANSPORT_CENSORED',
  ACQUISITION_CENSORED = 'ACQUISITION_CENSORED',
}

export enum PhoneStatus {
  READY = 'Ready for Recording',
  CALIBRATING = 'Personal Baseline Learning',
  STABLE = 'Stable',
  EARLY_WATCH = 'Early Watch',
  ELEVATED = 'Elevated',
  CENSORED_TODAY = 'Skipped today',
}

export type PhonePhase = 'READY' | 'ANALYZING' | 'RESULT';

export type LinkMode = 'BLE' | 'WIFI_DEV';

export type ScenarioId =
  | 'strong-prodrome'
  | 'weak-prodrome'
  | 'informative-censoring';

export type ConsoleStepId =
  | 'input'
  | 'quality-gate'
  | 'classifier'
  | 'sync'
  | 'detector'
  | 'alert-gen';

export type UtilityModalId =
  | 'hardware'
  | 'acceptance'
  | 'clinical-pdf'
  | 'phone-app'
  | 'data-source'
  | null;

export interface BlePacket {
  seq: number;
  version: number;
  flags: number;
  sampleIndex: number;
  byteLength: number;
  payloadSamples: number;
  timestampMs: number;
  lost: boolean;
  gapMsAfterPrev: number;
}

export interface BleLinkConfig {
  linkMode: LinkMode;
  mtuBytes: 185 | 244 | 512;
  packetLossPct: number;
  burstMode: boolean;
  disconnectEvent: boolean;
  autoSend: boolean;
  seed: number;
}

export interface WindowTransportStat {
  windowIndex: number;
  lossPct: number;
  maxGapMs: number;
  lostPackets: number;
  totalPackets: number;
}

export interface BleLinkResult {
  packets: BlePacket[];
  reassembledSamples: Float32Array;
  sentCount: number;
  receivedCount: number;
  lostCount: number;
  lossPct: number;
  maxGapMs: number;
  mtuBytes: number;
  windowTransportStats: WindowTransportStat[];
}

export interface WindowAnalysis {
  index: number;
  startSec: number;
  endSec: number;
  qualityState: QualityState;
  reason: string;
  lossPct: number;
  maxGapMs: number;
  clipPct: number;
  noiseFloorDb: number;
  contactScore: number;
  rms: number;
  wheezeProb: number;
  crackleProb: number;
  normalProb: number;
  acousticAnomalyScore: number;
}

export interface ClassifierOutput {
  normal: number;
  wheeze: number;
  crackle: number;
  validWindowCount: number;
  totalWindowCount: number;
  label: 'CNN Classification';
}

export interface FeatureVector21D {
  values: number[];
  labels: string[];
}

export interface BreathPhaseSpan {
  startSec: number;
  endSec: number;
  phase: 'inhale' | 'exhale';
}

export interface ContributingWindow {
  index: number;
  startSec: number;
  endSec: number;
  qualityState: QualityState;
  contribution: number;
  reason: string;
}

export interface ExplanationTrace {
  baselineMean: number;
  baselineScale: number;
  studentTDof: number;
  predictiveSurprise: number;
  censoringEvidenceTerm: number;
  temperingLambda: number;
  srStatistic: number;
  srThreshold: number;
  status: PhoneStatus;
  contributingWindows: ContributingWindow[];
}

export interface SessionAnalysisResult {
  id: string;
  title: string;
  presetId: PresetId;
  breathsPerMin: number;
  durationSec: number;
  sampleRate: number;
  rawSamples: Float32Array;
  reassembledSamples: Float32Array;
  breathPhases: BreathPhaseSpan[];
  melSpectrogram: number[][];
  melTimesSec: number[];
  windows: WindowAnalysis[];
  classifier: ClassifierOutput;
  featureVector21D: FeatureVector21D;
  bleResult: BleLinkResult;
  trace: ExplanationTrace;
  dspTimeMs: number;
  isSynthetic: boolean;
  dataOrigin?: DataOrigin;
}

export interface SessionRecord {
  id: string;
  dayIndex: number;
  timestampIso: string;
  label: string;
  presetId: PresetId;
  status: PhoneStatus;
  srStatistic: number;
  validWindows: number;
  transportCensoredWindows: number;
  acquisitionCensoredWindows: number;
  dominantClass: 'Normal' | 'Wheeze' | 'Crackle';
  censoredReason?: string;
  isSynthetic: boolean;
}

export interface DailyDetectorPoint {
  day: number;
  hbQcsr: number;
  zScore: number;
  population: number;
  hbAlert: boolean;
  zAlert: boolean;
  popAlert: boolean;
  censoredType: 'none' | 'transport' | 'acquisition';
  latentSeverity: number;
}

export interface BenchmarkRow {
  detector: string;
  falseAlertsPer30Days: number;
  detectionDelayDays: number | null;
  sensitivity: number;
  notes: string;
}

export interface BenchmarkSimulationResult {
  scenario: ScenarioId;
  seed: number;
  subjectId: number;
  informativeCensoring: boolean;
  tempering: number;
  changePointDay: number;
  hbThreshold: number;
  zThreshold: number;
  popThreshold: number;
  trajectory: DailyDetectorPoint[];
  table: BenchmarkRow[];
}

export interface LiveCaptureMeta {
  bleResult: BleLinkResult;
  dataOrigin: DataOrigin;
  batteryPct: number | null;
}

export interface WindowMetric {
  rms: number;
  clipPct: number;
  noiseFloorDb: number;
  contactScore: number;
  tonalWheezeRatio: number;
  crackleBurstDensity: number;
  bandSnrDb: number;
}

export interface DspPipelineOutput {
  melSpectrogram: number[][];
  melTimesSec: number[];
  featureVector21D: FeatureVector21D;
  windowMetrics: WindowMetric[];
  dspTimeMs: number;
}

export const PAPER_CONSTANTS = {
  SAMPLE_RATE_HZ: 16000,
  MAX_DURATION_SEC: 120,
  BLE_PACKET_BYTES: 244,
  BLE_HEADER_BYTES: 8,
  BLE_AUDIO_BYTES: 236,
  BLE_SAMPLES_PER_PACKET: 118,
  BLE_PACKET_DURATION_MS: 7.375,
  WINDOW_SEC: 3,
  WINDOW_OVERLAP: 0.5,
  WINDOW_HOP_SEC: 1.5,
  N_FFT: 512,
  FFT_HOP: 256,
  MEL_BANDS: 64,
  TRANSPORT_LOSS_THRESHOLD_PCT: 2.0,
  TRANSPORT_GAP_THRESHOLD_MS: 20.0,
  CALIBRATION_DAYS_TARGET: 14,
  RAW_BITRATE_KBPS: 256,
  SESSION_ENERGY_MAH: 3.7,
  SESSION_COMPUTE_GFLOP: 5.1,
  SESSION_WINDOWS_120S: 79,
  COST_PER_OBS_PULMOSCAN_USD: 0.055,
  COST_DEVICE_USD: 60,
  COST_PER_OBS_STETHOSCOPE_USD: 11.11,
  COST_STETHOSCOPE_USD: 400,
  MATCHED_SENSITIVITY: 0.9,
  COHORT_SUBJECTS: 3000,
  COHORT_DAYS: 180,
  COHORT_SEEDS: 5,
  HB_FALSE_ALERTS_30D: 0.09,
  ZSCORE_FALSE_ALERTS_30D: 0.23,
  POP_FALSE_ALERTS_30D: 1.95,
  INFORMATIVE_CENSORING_REDUCTION_PCT: 31,
  INFORMATIVE_CENSORING_BEFORE: 0.153,
  INFORMATIVE_CENSORING_AFTER: 0.106,
} as const;
