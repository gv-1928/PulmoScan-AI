import { runRuleBasedClassifier } from '../classifier/ruleClassifier';
import { evaluateSessionHbQcsr } from '../detector/hbQcsr';
import { evaluateQualityGate } from '../quality-gate/qualityGate';
import { simulateBleLink } from '../transport/bleLink';
import {
  BleLinkConfig,
  BleLinkResult,
  BreathPhaseSpan,
  ClassifierOutput,
  ContributingWindow,
  DataOrigin,
  PresetId,
  QualityState,
  SessionAnalysisResult,
} from '../types/pulmoscan';
import { runDspInWorker } from './useDspWorker';

export interface RunSessionPipelineInput {
  id: string;
  title: string;
  presetId: PresetId;
  breathsPerMin: number;
  rawSamples: Float32Array;
  breathPhases: BreathPhaseSpan[];
  bleConfig: BleLinkConfig;
  validBaselineDays: number;
  tempering: number;
  liveBleResult?: BleLinkResult | null;
  dataOrigin?: DataOrigin;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function deriveDataOrigin(
  presetId: PresetId,
  explicit?: DataOrigin,
): DataOrigin {
  if (explicit) return explicit;
  if (presetId === 'live-ble') return 'live-bluetooth';
  if (presetId === 'live-wifi') return 'live-wifi';
  if (presetId === 'custom') return 'uploaded-file';
  return 'synthetic-demo';
}

export function getDominantClass(
  classifier: ClassifierOutput,
): 'Normal' | 'Wheeze' | 'Crackle' {
  if (
    classifier.wheeze >= classifier.normal &&
    classifier.wheeze >= classifier.crackle
  ) {
    return 'Wheeze';
  }
  if (classifier.crackle >= classifier.normal) {
    return 'Crackle';
  }
  return 'Normal';
}

export async function runSessionPipeline(
  input: RunSessionPipelineInput,
): Promise<SessionAnalysisResult> {
  const sampleRate = 16000;
  const bleResult =
    input.liveBleResult ?? simulateBleLink(input.rawSamples, input.bleConfig);

  // Note: DSP always runs on rawSamples, never reassembledSamples
  const dsp = await runDspInWorker(input.rawSamples);
  const windows = evaluateQualityGate(dsp, bleResult);
  const classifier = runRuleBasedClassifier(windows);
  const trace = evaluateSessionHbQcsr(
    windows,
    input.validBaselineDays,
    input.tempering,
  );

  const durationSec = round2(input.rawSamples.length / sampleRate);
  const isSynthetic =
    input.presetId !== 'custom' &&
    input.presetId !== 'live-ble' &&
    input.presetId !== 'live-wifi';

  return {
    id: input.id,
    title: input.title,
    presetId: input.presetId,
    breathsPerMin: input.breathsPerMin,
    durationSec,
    sampleRate,
    rawSamples: input.rawSamples,
    reassembledSamples: bleResult.reassembledSamples,
    breathPhases: input.breathPhases,
    melSpectrogram: dsp.melSpectrogram,
    melTimesSec: dsp.melTimesSec,
    windows,
    classifier,
    featureVector21D: dsp.featureVector21D,
    bleResult,
    trace,
    dspTimeMs: dsp.dspTimeMs,
    isSynthetic,
    dataOrigin: deriveDataOrigin(input.presetId, input.dataOrigin),
  };
}

export interface Local21DExplanation {
  summary: string;
  bullets: string[];
  contributingWindows: ContributingWindow[];
  features: Array<{ label: string; value: number }>;
  jsonPayload: Record<string, unknown>;
}

export function buildLocal21DExplanation(
  analysis: SessionAnalysisResult,
): Local21DExplanation {
  const total = analysis.windows.length;
  let validCount = 0;
  let transportCount = 0;
  let acqCount = 0;
  for (const w of analysis.windows) {
    if (w.qualityState === QualityState.VALID) validCount++;
    else if (w.qualityState === QualityState.TRANSPORT_CENSORED)
      transportCount++;
    else acqCount++;
  }

  const featureMap: Record<string, number> = {};
  analysis.featureVector21D.labels.forEach((lbl, idx) => {
    featureMap[lbl] = analysis.featureVector21D.values[idx] ?? 0;
  });

  const tonalWheezeRatio = featureMap.tonal_wheeze_ratio ?? 0;
  const crackleImpulseRate = featureMap.crackle_impulse_rate ?? 0;
  const bandSnrDb = featureMap.band_snr_100_2000_db ?? 0;
  const contactStability = featureMap.contact_stability_score ?? 0;

  const summary = `Across ${total} clips of 3 seconds, ${validCount} were good, ${transportCount} were lost while sending, and ${acqCount} were bad recordings. The alert score is ${analysis.trace.srStatistic.toFixed(2)} and the alert level is ${analysis.trace.srThreshold.toFixed(1)} (${analysis.trace.status}).`;

  const bullets = [
    `Whistle-like tone strength is ${tonalWheezeRatio.toFixed(2)}x normal (${
      tonalWheezeRatio > 4.2
        ? 'possible wheeze sound found'
        : 'quiet breathing range'
    }).`,
    `Short popping sounds happened ${crackleImpulseRate.toFixed(1)} times a second (${
      crackleImpulseRate > 5.0
        ? 'some crackle sounds found'
        : 'no strong crackles found'
    }).`,
    `Sound clarity score is ${bandSnrDb.toFixed(1)} and chest contact score is ${(contactStability * 100).toFixed(0)}%.`,
    `How unusual today is: ${analysis.trace.predictiveSurprise.toFixed(2)}. Effect of bad recording: ${analysis.trace.censoringEvidenceTerm.toFixed(2)}.`,
  ];

  const features = analysis.featureVector21D.labels.map((label, idx) => ({
    label,
    value: analysis.featureVector21D.values[idx] ?? 0,
  }));

  const jsonPayload = {
    protocol: 'PulmoScan-Demo-Local-Summary',
    note: 'Only summary numbers are saved. Raw sound stays on your phone.',
    demoData: analysis.isSynthetic,
    sessionTitle: analysis.title,
    status: analysis.trace.status,
    alertScore: analysis.trace.srStatistic,
    alertLevel: analysis.trace.srThreshold,
    howUnusualToday: analysis.trace.predictiveSurprise,
    badRecordingEffect: analysis.trace.censoringEvidenceTerm,
    soundType: analysis.classifier,
    summaryValues: featureMap,
  };

  return {
    summary,
    bullets,
    contributingWindows: analysis.trace.contributingWindows,
    features,
    jsonPayload,
  };
}
