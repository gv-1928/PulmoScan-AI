import {
  BleLinkResult,
  DspPipelineOutput,
  PAPER_CONSTANTS,
  QualityState,
  WindowAnalysis,
} from '../types/pulmoscan';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function evaluateQualityGate(
  dsp: DspPipelineOutput,
  ble: BleLinkResult,
): WindowAnalysis[] {
  const count = Math.min(
    dsp.windowMetrics.length,
    ble.windowTransportStats.length,
  );
  const windows: WindowAnalysis[] = [];

  for (let i = 0; i < count; i++) {
    const metric = dsp.windowMetrics[i];
    const transport = ble.windowTransportStats[i];

    const startSec = round2(i * PAPER_CONSTANTS.WINDOW_HOP_SEC);
    const endSec = round2(startSec + PAPER_CONSTANTS.WINDOW_SEC);

    let qualityState = QualityState.VALID;
    let reason = 'Good chest contact and steady Bluetooth link';

    if (
      transport.lossPct > PAPER_CONSTANTS.TRANSPORT_LOSS_THRESHOLD_PCT ||
      transport.maxGapMs > PAPER_CONSTANTS.TRANSPORT_GAP_THRESHOLD_MS
    ) {
      qualityState = QualityState.TRANSPORT_CENSORED;
      if (transport.maxGapMs > PAPER_CONSTANTS.TRANSPORT_GAP_THRESHOLD_MS) {
        reason = `Lost while sending (${transport.maxGapMs.toFixed(1)} ms gap, ${transport.lossPct.toFixed(1)}% lost)`;
      } else {
        reason = `Lost while sending (${transport.lossPct.toFixed(1)}% missing)`;
      }
    } else {
      const acqReasons: string[] = [];
      if (metric.clipPct > 0.5) {
        acqReasons.push(`sound clipped (${metric.clipPct.toFixed(1)}%)`);
      }
      if (metric.rms < 0.012) {
        acqReasons.push('too quiet');
      }
      if (metric.noiseFloorDb > -23) {
        acqReasons.push('too much room noise');
      }
      if (metric.contactScore < 0.58) {
        acqReasons.push(`loose chest contact (${Math.round(metric.contactScore * 100)}%)`);
      }
      if (acqReasons.length > 0) {
        qualityState = QualityState.ACQUISITION_CENSORED;
        reason = `Bad recording: ${acqReasons.join(', ')}`;
      }
    }

    const wheezeRaw = Math.max(0, (metric.tonalWheezeRatio - 2.4) * 0.24);
    const crackleRaw = Math.max(0, (metric.crackleBurstDensity - 2.8) * 0.14);
    const normalRaw = 0.85;
    const sum = wheezeRaw + crackleRaw + normalRaw;

    const wheezeProb = round3(wheezeRaw / sum);
    const crackleProb = round3(crackleRaw / sum);
    const normalProb = round3(normalRaw / sum);

    const acousticAnomalyScore = round3(
      Math.min(
        4.5,
        wheezeProb * 3.1 +
          crackleProb * 2.6 +
          Math.max(0, 1 - normalProb) * 1.4,
      ),
    );

    windows.push({
      index: i,
      startSec,
      endSec,
      qualityState,
      reason,
      lossPct: round2(transport.lossPct),
      maxGapMs: round1(transport.maxGapMs),
      clipPct: round2(metric.clipPct),
      noiseFloorDb: round1(metric.noiseFloorDb),
      contactScore: round2(metric.contactScore),
      rms: round4(metric.rms),
      wheezeProb,
      crackleProb,
      normalProb,
      acousticAnomalyScore,
    });
  }

  return windows;
}
