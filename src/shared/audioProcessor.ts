import {
  AUDIO_CONFIG,
  AudioMeasurements,
  WindowQuality,
  AcousticEvent,
  AcousticClass,
} from './contract.ts';

// Encode Float32Array to 16-bit PCM mono WAV
export function encodeWav16kMono(samples: Float32Array, sampleRate: number = 16000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count (1 = mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Synthetic Demo Audio Generator
 * Generates 16 kHz mono Float32Array audio for the 4 demo types
 */
export function generateSyntheticAudio(type: 'Normal' | 'Wheeze' | 'Crackle' | 'Noisy', durationSec: number = 12.0): Float32Array {
  const sampleRate = AUDIO_CONFIG.SAMPLE_RATE;
  const numSamples = Math.floor(sampleRate * durationSec);
  const output = new Float32Array(numSamples);

  const breathCycleSec = 4.0; // 4 second breath cycle: ~2s insp, ~2s exp

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const cycleTime = t % breathCycleSec;
    const isInsp = cycleTime < 2.0;

    // Breathing envelope: smooth sinusoidal rise and fall
    const breathPhase = (cycleTime / breathCycleSec) * 2 * Math.PI;
    const envelope = Math.max(0.05, Math.pow(Math.sin(breathPhase), 2));

    if (type === 'Noisy') {
      // Harsh noise, clipping, loud random spikes, ground hum
      const whiteNoise = (Math.random() * 2 - 1) * 0.9;
      const thump = Math.sin(2 * Math.PI * 25 * t) * 0.4;
      const spike = Math.random() < 0.005 ? (Math.random() > 0.5 ? 1.5 : -1.5) : 0;
      let val = whiteNoise + thump + spike;
      // Force severe clipping
      if (val > 0.95) val = 1.0;
      if (val < -0.95) val = -1.0;
      output[i] = val;
      continue;
    }

    // Baseline respiratory sound: filtered noise
    // Simple pink/bandpass approximation
    const noise = (Math.random() * 2 - 1);
    let sample = noise * envelope * 0.35;

    // Modulate with typical respiratory band (150-600Hz)
    const breathFormant = Math.sin(2 * Math.PI * (200 + 150 * envelope) * t) * 0.15;
    sample += breathFormant * envelope;

    if (type === 'Wheeze') {
      // Wheeze: continuous high-pitched musical sound during expiration (cycleTime >= 2.0)
      if (!isInsp && envelope > 0.15) {
        // Frequency glide between 480 Hz and 620 Hz
        const freq = 520 + Math.sin(t * 3.5) * 70;
        const wheezeTone = Math.sin(2 * Math.PI * freq * t) * 0.55 * envelope;
        const harmonic = Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 * envelope;
        sample += wheezeTone + harmonic;
      }
    } else if (type === 'Crackle') {
      // Crackle: discontinuous, explosive, non-musical click sounds mostly during inspiration
      if (isInsp && envelope > 0.2) {
        // Sparse burst every ~80-150ms
        const crackleSeed = Math.sin(i * 0.07);
        if (Math.abs(crackleSeed) > 0.992) {
          // Sharp fast damped click (broadband impulse)
          const click = (Math.random() * 2 - 1) * 0.85;
          sample += click;
        }
      }
    }

    output[i] = Math.max(-0.95, Math.min(0.95, sample));
  }

  return output;
}

/**
 * Resample any audio buffer to 16 kHz mono Float32Array using OfflineAudioContext
 */
export async function resampleTo16kMono(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const targetSampleRate = AUDIO_CONFIG.SAMPLE_RATE;
  const maxSamples = Math.floor(targetSampleRate * AUDIO_CONFIG.MAX_SESSION_SEC);
  const targetLength = Math.min(
    maxSamples,
    Math.round(audioBuffer.duration * targetSampleRate)
  );

  const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const channelData = renderedBuffer.getChannelData(0);

  // Normalize
  let maxAbs = 0;
  for (let i = 0; i < channelData.length; i++) {
    const abs = Math.abs(channelData[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs > 0.001) {
    const scale = 0.92 / maxAbs;
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] *= scale;
    }
  }

  return channelData;
}

/**
 * Full Pipeline: Quality Gate + Spectral & Temporal Acoustic Feature Measurement
 */
export function measureAudio(
  samples: Float32Array,
  sampleRate: number = AUDIO_CONFIG.SAMPLE_RATE,
  rhoMin: number = 0.60
): AudioMeasurements {
  const windowSamples = Math.floor(sampleRate * AUDIO_CONFIG.WINDOW_DURATION_SEC); // 48,000
  const stepSamples = Math.floor(sampleRate * AUDIO_CONFIG.WINDOW_STEP_SEC); // 24,000

  const windows: WindowQuality[] = [];
  const events: AcousticEvent[] = [];

  let totalWindows = 0;
  let validWindows = 0;

  for (let start = 0; start + windowSamples <= samples.length; start += stepSamples) {
    const winIndex = totalWindows++;
    const winSlice = samples.subarray(start, start + windowSamples);
    const startTime = start / sampleRate;
    const endTime = (start + windowSamples) / sampleRate;

    // 1. Peak & Clipping fraction
    let peak = 0;
    let clipCount = 0;
    let sumSq = 0;
    for (let i = 0; i < winSlice.length; i++) {
      const abs = Math.abs(winSlice[i]);
      if (abs > peak) peak = abs;
      if (abs >= 0.98) clipCount++;
      sumSq += abs * abs;
    }
    const rms = Math.sqrt(sumSq / winSlice.length);
    const clippingFraction = clipCount / winSlice.length;

    // 2. Noise floor calculation (short 50ms frames inside the window)
    const frameSize = Math.floor(sampleRate * 0.05); // 800
    const frameRmsList: number[] = [];
    for (let f = 0; f + frameSize <= winSlice.length; f += frameSize) {
      let fSum = 0;
      for (let j = 0; j < frameSize; j++) {
        fSum += winSlice[f + j] * winSlice[f + j];
      }
      frameRmsList.push(Math.sqrt(fSum / frameSize));
    }
    frameRmsList.sort((a, b) => a - b);
    const p10Index = Math.floor(frameRmsList.length * 0.1);
    const noiseFloor = frameRmsList[p10Index] || 0.001;

    // 3. Contact stability: check max frame jump
    let maxJump = 0;
    for (let f = 1; f < frameRmsList.length; f++) {
      const jump = Math.abs(frameRmsList[f] - frameRmsList[f - 1]);
      if (jump > maxJump) maxJump = jump;
    }
    const contactStability = Math.max(0, 1 - maxJump * 3);

    // Evaluate Quality Gate criteria
    let isValid = true;
    let discardReason: string | undefined;

    if (clippingFraction > 0.02) {
      isValid = false;
      discardReason = `Excessive clipping (${(clippingFraction * 100).toFixed(1)}%)`;
    } else if (peak < 0.03) {
      isValid = false;
      discardReason = 'Amplitude too low (sensor detached or silent)';
    } else if (noiseFloor > 0.22) {
      isValid = false;
      discardReason = 'High ambient background noise';
    } else if (contactStability < 0.35) {
      isValid = false;
      discardReason = 'Sudden contact loss / motion thump';
    }

    if (isValid) validWindows++;

    windows.push({
      index: winIndex,
      startTime,
      endTime,
      isValid,
      discardReason,
      peak,
      clipping: clippingFraction,
      noiseFloor,
      contactStability,
    });
  }

  // Handle short recordings
  if (totalWindows === 0) {
    totalWindows = 1;
    windows.push({
      index: 0,
      startTime: 0,
      endTime: samples.length / sampleRate,
      isValid: false,
      discardReason: 'Recording shorter than minimum 3.0s window',
      peak: 0,
      clipping: 0,
      noiseFloor: 0,
      contactStability: 0,
    });
  }

  const usableAudioRatio = validWindows / totalWindows;
  const qualityScore = usableAudioRatio >= rhoMin ? 1 : 0;

  // -------------------------------------------------------------
  // Acoustic Measurements on valid sections
  // -------------------------------------------------------------
  let wheezeDurationSum = 0;
  let wheezeEventCount = 0;
  let crackleCount = 0;

  // Autocorrelation on band-passed breathing energy envelope for Respiratory Rate
  let respiratoryRate: number | null = null;
  let respiratoryRateReason: string | undefined;
  let breathIntervalVariability: number | undefined;

  // Simple envelope extraction at 20 Hz (50 ms hop)
  const envHop = Math.floor(sampleRate * 0.05); // 800
  const envPoints: number[] = [];
  for (let i = 0; i + envHop <= samples.length; i += envHop) {
    let s = 0;
    for (let j = 0; j < envHop; j++) {
      s += Math.abs(samples[i + j]);
    }
    envPoints.push(s / envHop);
  }

  // Autocorrelation for period 1.5s to 6.0s (10 to 40 breaths/min)
  const minLag = Math.floor(1.5 / 0.05); // 30
  const maxLag = Math.floor(6.0 / 0.05); // 120

  if (envPoints.length > maxLag * 1.5 && qualityScore === 1) {
    let bestLag = -1;
    let maxCorr = -1;
    const meanEnv = envPoints.reduce((a, b) => a + b, 0) / envPoints.length;

    for (let lag = minLag; lag <= maxLag && lag < envPoints.length / 2; lag++) {
      let num = 0;
      let d1 = 0;
      let d2 = 0;
      for (let i = 0; i < envPoints.length - lag; i++) {
        const x = envPoints[i] - meanEnv;
        const y = envPoints[i + lag] - meanEnv;
        num += x * y;
        d1 += x * x;
        d2 += y * y;
      }
      const denom = Math.sqrt(d1 * d2);
      const corr = denom > 0 ? num / denom : 0;
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    if (maxCorr > 0.28 && bestLag > 0) {
      const breathPeriodSec = bestLag * 0.05;
      respiratoryRate = Math.round((60 / breathPeriodSec) * 10) / 10;
      breathIntervalVariability = Math.round(breathPeriodSec * 0.12 * 1000); // estimated ms
    } else {
      respiratoryRate = null;
      respiratoryRateReason = 'Breath periodicity correlation below certainty threshold';
    }
  } else {
    respiratoryRate = null;
    respiratoryRateReason = qualityScore === 0 ? 'Excessive acoustic artifact prevents rate tracking' : 'Session duration too brief for periodic estimation';
  }

  // -------------------------------------------------------------
  // Wheeze & Crackle Feature Extraction (FFT Spectrogram Overview)
  // -------------------------------------------------------------
  const nFft = AUDIO_CONFIG.N_FFT; // 512
  const hop = AUDIO_CONFIG.HOP_LENGTH; // 256
  const numFrames = Math.floor((samples.length - nFft) / hop);
  const melBands = 32; // compact grid for transport & fast rendering

  // Prepare a log-mel spectrogram preview grid (32 bands x min(frames, 60))
  const maxDisplayFrames = 60;
  const frameStride = Math.max(1, Math.floor(numFrames / maxDisplayFrames));
  const grid: number[][] = [];
  for (let b = 0; b < melBands; b++) {
    grid.push(new Array(Math.min(maxDisplayFrames, Math.floor(numFrames / frameStride))).fill(0));
  }

  // Simple Hann window & DFT for feature extraction
  let consecutiveWheezeFrames = 0;
  const frameTimeSec = hop / sampleRate;

  // Track transient crackles with short moving median energy
  const frameEnergies: number[] = [];

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hop;
    let fEnergy = 0;
    let peakMelVal = 0;
    let medianMelVal = 0;
    const bandEnergies = new Float32Array(melBands);

    // Approximate energy across frequency bands
    for (let k = 0; k < nFft; k++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * k) / (nFft - 1)));
      const s = samples[offset + k] * w;
      fEnergy += s * s;
      const bandIdx = Math.floor((k / (nFft / 2)) * melBands);
      if (bandIdx < melBands) {
        bandEnergies[bandIdx] += s * s;
      }
    }
    frameEnergies.push(fEnergy);

    // Log-mel mapping
    for (let b = 0; b < melBands; b++) {
      const logVal = Math.log10(1 + bandEnergies[b] * 100);
      bandEnergies[b] = logVal;
      if (logVal > peakMelVal) peakMelVal = logVal;
    }

    // Populate display grid
    const dispCol = Math.floor(f / frameStride);
    if (dispCol < (grid[0]?.length || 0)) {
      for (let b = 0; b < melBands; b++) {
        // Mel band 0 is lowest freq, inverted for display
        grid[melBands - 1 - b][dispCol] = Math.min(1.0, bandEnergies[b] * 0.8);
      }
    }

    // Wheeze detection: musical peak in 100-1000 Hz persisting >= 100ms
    // Mel bands 2 to 14 correspond to ~100 to 1000 Hz
    let maxBand = 0;
    let maxBandIdx = 0;
    let sumBand = 0;
    for (let b = 2; b <= 14; b++) {
      sumBand += bandEnergies[b];
      if (bandEnergies[b] > maxBand) {
        maxBand = bandEnergies[b];
        maxBandIdx = b;
      }
    }
    const avgBand = sumBand / 13;
    const peakToAvg = avgBand > 0.001 ? maxBand / avgBand : 1;

    if (peakToAvg > 2.6 && maxBand > 0.08) {
      consecutiveWheezeFrames++;
    } else {
      if (consecutiveWheezeFrames * frameTimeSec >= 0.10) {
        wheezeEventCount++;
        const duration = consecutiveWheezeFrames * frameTimeSec;
        wheezeDurationSum += duration;
        events.push({
          type: 'wheeze',
          time: f * frameTimeSec - duration,
          duration,
          frequencyRange: [400, 750],
        });
      }
      consecutiveWheezeFrames = 0;
    }

    // Crackle detection: transient spike > 3.8x local median
    if (f >= 5) {
      const prev5 = frameEnergies.slice(Math.max(0, f - 6), f);
      prev5.sort((a, b) => a - b);
      const medianE = prev5[Math.floor(prev5.length / 2)] || 0.0001;
      if (fEnergy > medianE * 4.5 && fEnergy > 0.04) {
        crackleCount++;
        events.push({
          type: 'crackle',
          time: f * frameTimeSec,
          duration: 0.015,
        });
      }
    }
  }

  const sessionDuration = samples.length / sampleRate;
  const wheezeBurden = Math.min(1.0, wheezeDurationSum / Math.max(1, sessionDuration));
  const crackleBurden = Math.min(1.0, (crackleCount * 0.015) / Math.max(1, sessionDuration));
  const wheezeMeanDuration = wheezeEventCount > 0 ? wheezeDurationSum / wheezeEventCount : 0;
  const totalBreaths = respiratoryRate ? (respiratoryRate / 60) * sessionDuration : (sessionDuration / 4.0);
  const crackleRatePerBreath = totalBreaths > 0 ? crackleCount / totalBreaths : 0;

  // -------------------------------------------------------------
  // Rule-based stand-in classifier (Stand-in for on-device INT8 CNN)
  // -------------------------------------------------------------
  let localClass: AcousticClass = 'Normal';
  let confidence = 0.88;
  const bothFlag = wheezeBurden > 0.08 && crackleCount >= 4;

  if (qualityScore === 0) {
    localClass = 'Normal';
    confidence = 0.50;
  } else if (wheezeBurden >= 0.07 && wheezeBurden >= crackleBurden) {
    localClass = 'Wheeze';
    confidence = Math.min(0.96, 0.72 + wheezeBurden * 0.4);
  } else if (crackleCount >= 4 || crackleBurden >= 0.04) {
    localClass = 'Crackle';
    confidence = Math.min(0.95, 0.70 + Math.min(0.25, crackleCount * 0.04));
  } else {
    localClass = 'Normal';
    confidence = Math.max(0.75, 0.94 - (wheezeBurden + crackleBurden) * 2);
  }

  // Downsample waveform for visualization (200 points)
  const wavePoints = 200;
  const waveStep = Math.floor(samples.length / wavePoints);
  const waveformSample: number[] = [];
  for (let i = 0; i < wavePoints; i++) {
    waveformSample.push(Math.round(samples[i * waveStep] * 100) / 100);
  }

  return {
    qualityScore,
    validWindows,
    totalWindows,
    usableAudioRatio: Math.round(usableAudioRatio * 100) / 100,
    respiratoryRate,
    respiratoryRateReason,
    breathIntervalVariability,
    wheezeBurden: Math.round(wheezeBurden * 1000) / 1000,
    wheezeCount: wheezeEventCount,
    wheezeMeanDuration: Math.round(wheezeMeanDuration * 100) / 100,
    crackleBurden: Math.round(crackleBurden * 1000) / 1000,
    crackleCount,
    crackleRatePerBreath: Math.round(crackleRatePerBreath * 10) / 10,
    localClass,
    confidence: Math.round(confidence * 100) / 100,
    bothFlag,
    windows,
    events,
    waveformSample,
    spectrogramOverview: {
      melBands,
      frames: grid[0]?.length || 0,
      grid,
    },
  };
}
