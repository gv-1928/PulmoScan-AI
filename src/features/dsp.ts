import {
  DspPipelineOutput,
  PAPER_CONSTANTS,
  WindowMetric,
} from '../types/pulmoscan';

const N_FFT = PAPER_CONSTANTS.N_FFT;
const FFT_HOP = PAPER_CONSTANTS.FFT_HOP;
const MEL_BANDS = PAPER_CONSTANTS.MEL_BANDS;
const SAMPLE_RATE = PAPER_CONSTANTS.SAMPLE_RATE_HZ;
const N_BINS = N_FFT / 2 + 1;

export const FEATURE_VECTOR_21D_LABELS: string[] = [
  'mel_low_mean',
  'mel_mid_mean',
  'mel_high_mean',
  'mel_low_std',
  'mel_mid_std',
  'mel_high_std',
  'spectral_centroid_hz',
  'spectral_bandwidth_hz',
  'spectral_flatness',
  'spectral_rolloff_85_hz',
  'tonal_wheeze_ratio',
  'wheeze_peak_persistence',
  'crackle_kurtosis',
  'crackle_impulse_rate',
  'zcr_mean',
  'zcr_std',
  'rms_mean',
  'rms_dynamic_range_db',
  'band_snr_100_2000_db',
  'inhale_exhale_ratio',
  'contact_stability_score',
];

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Precompute Hann window
const HANN_WINDOW = new Float32Array(N_FFT);
for (let i = 0; i < N_FFT; i++) {
  HANN_WINDOW[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N_FFT - 1)));
}

// Precompute bit-reversal table and twiddle factors for radix-2 512-pt FFT
const LOG2_N = 9;
const BIT_REV = new Uint16Array(N_FFT);
for (let i = 0; i < N_FFT; i++) {
  let r = 0;
  let x = i;
  for (let b = 0; b < LOG2_N; b++) {
    r = (r << 1) | (x & 1);
    x >>= 1;
  }
  BIT_REV[i] = r;
}

const TWIDDLE_COS = new Float32Array(N_FFT / 2);
const TWIDDLE_SIN = new Float32Array(N_FFT / 2);
for (let i = 0; i < N_FFT / 2; i++) {
  const angle = (-2 * Math.PI * i) / N_FFT;
  TWIDDLE_COS[i] = Math.cos(angle);
  TWIDDLE_SIN[i] = Math.sin(angle);
}

// Precompute 64 triangular mel filterbank weights over 257 bins (50 Hz to 8000 Hz)
function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}
function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

const MEL_BANK: Float32Array[] = (() => {
  const lowMel = hzToMel(50);
  const highMel = hzToMel(8000);
  const melPoints = new Float64Array(MEL_BANDS + 2);
  for (let i = 0; i < MEL_BANDS + 2; i++) {
    melPoints[i] = lowMel + ((highMel - lowMel) * i) / (MEL_BANDS + 1);
  }
  const binPoints = new Float64Array(MEL_BANDS + 2);
  for (let i = 0; i < MEL_BANDS + 2; i++) {
    const hz = melToHz(melPoints[i]);
    binPoints[i] = ((N_FFT + 1) * hz) / SAMPLE_RATE;
  }
  const bank: Float32Array[] = [];
  for (let m = 0; m < MEL_BANDS; m++) {
    const weights = new Float32Array(N_BINS);
    const left = binPoints[m];
    const center = binPoints[m + 1];
    const right = binPoints[m + 2];
    for (let k = 0; k < N_BINS; k++) {
      if (k >= left && k <= center && center > left) {
        weights[k] = (k - left) / (center - left);
      } else if (k > center && k <= right && right > center) {
        weights[k] = (right - k) / (right - center);
      }
    }
    bank.push(weights);
  }
  return bank;
})();

function computePowerSpectrum(
  samples: Float32Array,
  startIdx: number,
  re: Float32Array,
  im: Float32Array,
  powerOut: Float32Array,
): void {
  for (let i = 0; i < N_FFT; i++) {
    const rev = BIT_REV[i];
    const sample = startIdx + rev < samples.length ? samples[startIdx + rev] : 0;
    re[i] = sample * HANN_WINDOW[rev];
    im[i] = 0;
  }

  for (let size = 2; size <= N_FFT; size <<= 1) {
    const half = size >> 1;
    const step = N_FFT / size;
    for (let i = 0; i < N_FFT; i += size) {
      for (let j = 0; j < half; j++) {
        const tIdx = j * step;
        const wr = TWIDDLE_COS[tIdx];
        const wi = TWIDDLE_SIN[tIdx];
        const evenIdx = i + j;
        const oddIdx = evenIdx + half;
        const oRe = re[oddIdx];
        const oIm = im[oddIdx];
        const tRe = wr * oRe - wi * oIm;
        const tIm = wr * oIm + wi * oRe;
        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] += tRe;
        im[evenIdx] += tIm;
      }
    }
  }

  for (let k = 0; k < N_BINS; k++) {
    powerOut[k] = re[k] * re[k] + im[k] * im[k];
  }
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function std(arr: number[], avg?: number): number {
  if (arr.length === 0) return 0;
  const m = avg ?? mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / arr.length);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function runDspPipeline(samples: Float32Array): DspPipelineOutput {
  const t0 = performance.now();
  const len = samples.length;
  const totalFrames = Math.max(1, Math.floor((len - N_FFT) / FFT_HOP) + 1);
  const stride = totalFrames > 600 ? Math.ceil(totalFrames / 600) : 1;

  const re = new Float32Array(N_FFT);
  const im = new Float32Array(N_FFT);
  const power = new Float32Array(N_BINS);

  const melSpectrogram: number[][] = [];
  const melTimesSec: number[] = [];

  const melLowSeries: number[] = [];
  const melMidSeries: number[] = [];
  const melHighSeries: number[] = [];
  const zcrSeries: number[] = [];
  const centroidSeries: number[] = [];
  const flatnessSeries: number[] = [];
  const rolloffSeries: number[] = [];
  const tonalRatioSeries: number[] = [];
  let tonalPersistCount = 0;

  const freqPerBin = SAMPLE_RATE / N_FFT;

  for (let f = 0; f < totalFrames; f++) {
    const startIdx = f * FFT_HOP;
    computePowerSpectrum(samples, startIdx, re, im, power);

    // Zero-crossing rate on frame
    let zc = 0;
    const frameEnd = Math.min(len, startIdx + N_FFT);
    for (let i = startIdx + 1; i < frameEnd; i++) {
      if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
        zc++;
      }
    }
    const frameCount = Math.max(1, frameEnd - startIdx - 1);
    zcrSeries.push(zc / frameCount);

    // 64 mel bands
    const logMelRow = new Array<number>(MEL_BANDS);
    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    for (let m = 0; m < MEL_BANDS; m++) {
      const weights = MEL_BANK[m];
      let energy = 0;
      for (let k = 0; k < N_BINS; k++) {
        if (weights[k] > 0) energy += power[k] * weights[k];
      }
      const val = Math.log10(energy + 1e-10);
      logMelRow[m] = val;
      if (m <= 20) lowSum += val;
      else if (m <= 42) midSum += val;
      else highSum += val;
    }
    melLowSeries.push(lowSum / 21);
    melMidSeries.push(midSum / 22);
    melHighSeries.push(highSum / 21);

    if (f % stride === 0) {
      melSpectrogram.push(logMelRow);
      melTimesSec.push(round3((f * FFT_HOP) / SAMPLE_RATE));
    }

    // Spectral centroid, flatness, 85% rolloff
    let totalPower = 0;
    let weightedFreq = 0;
    let logPowerSum = 0;
    for (let k = 1; k < N_BINS; k++) {
      const p = power[k];
      totalPower += p;
      weightedFreq += p * (k * freqPerBin);
      logPowerSum += Math.log(Math.max(1e-12, p));
    }
    const centroid = totalPower > 1e-12 ? weightedFreq / totalPower : 0;
    centroidSeries.push(centroid);

    const arithMean = totalPower / (N_BINS - 1);
    const geomMean = Math.exp(logPowerSum / (N_BINS - 1));
    const flatness = arithMean > 1e-12 ? Math.min(1, geomMean / arithMean) : 0;
    flatnessSeries.push(flatness);

    let rolloffHz = 4000;
    if (totalPower > 1e-12) {
      const target = 0.85 * totalPower;
      let cum = 0;
      for (let k = 1; k < N_BINS; k++) {
        cum += power[k];
        if (cum >= target) {
          rolloffHz = k * freqPerBin;
          break;
        }
      }
    }
    rolloffSeries.push(rolloffHz);

    // Wheeze-band tonal ratio over bins 9..35
    let binMax = 0;
    let binSum = 0;
    for (let k = 9; k <= 35; k++) {
      const p = power[k];
      if (p > binMax) binMax = p;
      binSum += p;
    }
    const binAvg = binSum / (35 - 9 + 1);
    const tonalRatio = binAvg > 1e-12 ? Math.min(25, binMax / binAvg) : 0;
    tonalRatioSeries.push(tonalRatio);
    if (tonalRatio > 6.5) tonalPersistCount++;
  }

  // Per 3-second window metrics (hop 1.5 s)
  const windowSamples = SAMPLE_RATE * PAPER_CONSTANTS.WINDOW_SEC; // 48000
  const hopSamples = Math.round(SAMPLE_RATE * PAPER_CONSTANTS.WINDOW_HOP_SEC); // 24000
  const numWindows = Math.max(1, Math.floor((len - windowSamples) / hopSamples) + 1);
  const microFrameLen = Math.round(SAMPLE_RATE * 0.025); // 400 samples (25 ms)

  const windowMetrics: WindowMetric[] = [];
  const winKurtosisList: number[] = [];
  const winImpulseRateList: number[] = [];
  const winBandSnrList: number[] = [];
  const winRmsList: number[] = [];
  const winContactList: number[] = [];
  const winDynamicDbList: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    const wStart = w * hopSamples;
    const wEnd = Math.min(len, wStart + windowSamples);
    const wCount = Math.max(1, wEnd - wStart);

    let sum = 0;
    let sumSq = 0;
    let clipCount = 0;
    for (let i = wStart; i < wEnd; i++) {
      const x = samples[i];
      sum += x;
      sumSq += x * x;
      if (Math.abs(x) >= 0.96) clipCount++;
    }
    const wMean = sum / wCount;
    const rms = Math.sqrt(sumSq / wCount);
    const clipPct = (clipCount / wCount) * 100;

    // 25 ms micro-frame RMS values
    const microRms: number[] = [];
    for (let mStart = wStart; mStart + microFrameLen <= wEnd; mStart += microFrameLen) {
      let mSq = 0;
      for (let j = 0; j < microFrameLen; j++) {
        const s = samples[mStart + j];
        mSq += s * s;
      }
      microRms.push(Math.sqrt(mSq / microFrameLen));
    }
    if (microRms.length === 0) {
      microRms.push(rms);
    }
    microRms.sort((a, b) => a - b);
    const p10 = Math.max(1e-7, percentile(microRms, 0.1));
    const p90 = Math.max(p10, percentile(microRms, 0.9));
    const noiseFloorDb = 20 * Math.log10(p10);
    const dynamicRatio = p90 / p10;
    winDynamicDbList.push(20 * Math.log10(dynamicRatio));

    // Variance, kurtosis, and diff impulse rate
    let varSum = 0;
    let m4Sum = 0;
    for (let i = wStart; i < wEnd; i++) {
      const d = samples[i] - wMean;
      const d2 = d * d;
      varSum += d2;
      m4Sum += d2 * d2;
    }
    const variance = varSum / wCount;
    const sigma = Math.sqrt(variance);
    const kurtosis = variance > 1e-12 ? m4Sum / wCount / (variance * variance) : 3;

    let diffEnergy = 0;
    let impulseCount = 0;
    const impulseThreshold = 5.8 * Math.max(1e-6, sigma);
    for (let i = wStart + 1; i < wEnd; i++) {
      const diff = Math.abs(samples[i] - samples[i - 1]);
      diffEnergy += diff;
      if (diff > impulseThreshold) {
        impulseCount++;
      }
    }
    const winDurationSec = wCount / SAMPLE_RATE;
    const impulseRate = impulseCount / Math.max(0.1, winDurationSec);

    // Mid-window FFT for tonalWheezeRatio and bandSnrDb
    const midIdx = Math.max(0, Math.min(len - N_FFT, Math.floor((wStart + wEnd) / 2 - N_FFT / 2)));
    computePowerSpectrum(samples, midIdx, re, im, power);

    let binMax = 0;
    let binSum = 0;
    for (let k = 9; k <= 35; k++) {
      const p = power[k];
      if (p > binMax) binMax = p;
      binSum += p;
    }
    const tonalWheezeRatio = binSum > 1e-12 ? Math.min(25, binMax / (binSum / (35 - 9 + 1))) : 0;

    let inBandPower = 0;
    let outBandPower = 0;
    for (let k = 1; k < N_BINS; k++) {
      const hz = k * freqPerBin;
      if (hz >= 100 && hz <= 2000) inBandPower += power[k];
      else if (hz > 2500) outBandPower += power[k];
    }
    const bandSnrDb =
      10 * Math.log10(Math.max(1e-12, inBandPower) / Math.max(1e-12, outBandPower * 0.65));

    let contactScore = 0.92;
    if (clipPct > 0.3) {
      contactScore -= Math.min(0.45, clipPct * 0.15);
    }
    if (noiseFloorDb > -24) {
      contactScore -= Math.min(0.45, (noiseFloorDb + 24) * 0.04);
    }
    if (rms < 0.012) {
      contactScore -= 0.48;
    }
    if (diffEnergy / wCount > 0.12 && kurtosis > 12) {
      contactScore -= 0.28;
    }
    if (dynamicRatio < 1.35 && rms > 0.08) {
      contactScore -= 0.30;
    }
    contactScore = Math.max(0.05, Math.min(0.99, contactScore));

    windowMetrics.push({
      rms: round4(rms),
      clipPct: Math.round(clipPct * 100) / 100,
      noiseFloorDb: Math.round(noiseFloorDb * 10) / 10,
      contactScore: Math.round(contactScore * 100) / 100,
      tonalWheezeRatio: round3(tonalWheezeRatio),
      crackleBurstDensity: round3(impulseRate),
      bandSnrDb: Math.round(bandSnrDb * 10) / 10,
    });

    winKurtosisList.push(kurtosis);
    winImpulseRateList.push(impulseRate);
    winBandSnrList.push(bandSnrDb);
    winRmsList.push(rms);
    winContactList.push(contactScore);
  }

  // Compute global 21-D feature vector
  const melLowMean = mean(melLowSeries);
  const melMidMean = mean(melMidSeries);
  const melHighMean = mean(melHighSeries);
  const melLowStd = std(melLowSeries, melLowMean);
  const melMidStd = std(melMidSeries, melMidMean);
  const melHighStd = std(melHighSeries, melHighMean);
  const centroidMean = mean(centroidSeries);
  const bandwidthHz = centroidMean * 0.42;
  const flatnessMean = mean(flatnessSeries);
  const rolloffMean = mean(rolloffSeries);
  const tonalMean = mean(tonalRatioSeries);
  const wheezePersistence = tonalPersistCount / Math.max(1, totalFrames);
  const crackleKurtosis = mean(winKurtosisList);
  const crackleImpulseRate = mean(winImpulseRateList);
  const zcrMean = mean(zcrSeries);
  const zcrStd = std(zcrSeries, zcrMean);
  const rmsMean = mean(winRmsList);
  const rmsDynamicDb = mean(winDynamicDbList);
  const bandSnrMean = mean(winBandSnrList);

  // Estimate inhale/exhale energy ratio over odd vs even half-cycles (2s spans)
  let evenEnergy = 0;
  let oddEnergy = 0;
  const halfCycleSamples = SAMPLE_RATE * 2;
  for (let idx = 0, span = 0; idx < len; idx += halfCycleSamples, span++) {
    const end = Math.min(len, idx + halfCycleSamples);
    let e = 0;
    for (let j = idx; j < end; j++) e += samples[j] * samples[j];
    if (span % 2 === 0) evenEnergy += e;
    else oddEnergy += e;
  }
  const inhaleExhaleRatio = Math.min(
    4,
    Math.max(0.25, Math.sqrt(Math.max(1e-9, evenEnergy) / Math.max(1e-9, oddEnergy))),
  );
  const contactMean = mean(winContactList);

  const values = [
    round3(melLowMean),
    round3(melMidMean),
    round3(melHighMean),
    round3(melLowStd),
    round3(melMidStd),
    round3(melHighStd),
    round3(centroidMean),
    round3(bandwidthHz),
    round3(flatnessMean),
    round3(rolloffMean),
    round3(tonalMean),
    round3(wheezePersistence),
    round3(crackleKurtosis),
    round3(crackleImpulseRate),
    round4(zcrMean),
    round4(zcrStd),
    round4(rmsMean),
    round3(rmsDynamicDb),
    round3(bandSnrMean),
    round3(inhaleExhaleRatio),
    round3(contactMean),
  ];

  const dspTimeMs = Math.round((performance.now() - t0) * 10) / 10;

  return {
    melSpectrogram,
    melTimesSec,
    featureVector21D: {
      values,
      labels: FEATURE_VECTOR_21D_LABELS,
    },
    windowMetrics,
    dspTimeMs,
  };
}
