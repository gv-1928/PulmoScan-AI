import { BreathPhaseSpan, PAPER_CONSTANTS, PresetId } from '../types/pulmoscan';
import { createRng } from './rng';

export interface GeneratedAudioSource {
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
  breathPhases: BreathPhaseSpan[];
  title: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getPresetTitle(presetId: PresetId, breathsPerMin: number): string {
  const bpm = Math.max(10, Math.min(28, Math.round(breathsPerMin)));
  switch (presetId) {
    case 'normal':
      return `Normal breathing (${bpm}/min)`;
    case 'wheeze':
      return `Wheeze sound (${bpm}/min)`;
    case 'crackle':
      return `Crackle sound (${bpm}/min)`;
    case 'noisy':
      return `Noisy / Bad contact (${bpm}/min)`;
    case 'custom':
      return 'Your sound file';
    case 'live-ble':
      return 'Live Bluetooth sensor';
    case 'live-wifi':
      return 'Live Wi-Fi stream';
  }
}

export function generatePresetAudio(
  presetId: PresetId,
  seedBase = 42,
  bpm = 15,
): GeneratedAudioSource {
  const sampleRate = PAPER_CONSTANTS.SAMPLE_RATE_HZ;
  const durationSec = 12;
  const totalSamples = sampleRate * durationSec;
  const clampedBpm = Math.max(10, Math.min(28, Math.round(bpm)));
  const seed = seedBase + presetId.length * 131 + clampedBpm * 17;
  const rng = createRng(seed);

  const cycle = 60 / clampedBpm;
  const inhale = 0.40 * cycle;
  const pause = 0.06 * cycle;
  const exhaleStart = inhale + pause;
  const exhale = 0.46 * cycle;

  const breathPhases: BreathPhaseSpan[] = [];
  for (let cStart = 0; cStart < durationSec; cStart += cycle) {
    const inStart = Math.min(durationSec, cStart);
    const inEnd = Math.min(durationSec, cStart + inhale);
    if (inEnd > inStart + 0.01) {
      breathPhases.push({
        startSec: round2(inStart),
        endSec: round2(inEnd),
        phase: 'inhale',
      });
    }
    const exStart = Math.min(durationSec, cStart + exhaleStart);
    const exEnd = Math.min(durationSec, cStart + exhaleStart + exhale);
    if (exEnd > exStart + 0.01) {
      breathPhases.push({
        startSec: round2(exStart),
        endSec: round2(exEnd),
        phase: 'exhale',
      });
    }
  }

  const samples = new Float32Array(totalSamples);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let crackleDecay = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const pos = t % cycle;

    const w = rng.gaussian(0, 1);
    b0 = 0.96 * b0 + 0.08 * w;
    b1 = 0.88 * b1 + 0.22 * b0;
    b2 = 0.72 * b2 + 0.35 * b1;

    let env = 0.03;
    let inInhale = false;
    let inExhale = false;
    let exRatio = 0;

    if (pos < inhale) {
      inInhale = true;
      env = Math.max(env, 0.24 * Math.sin((Math.PI * pos) / inhale));
    } else if (pos >= exhaleStart && pos < exhaleStart + exhale) {
      inExhale = true;
      exRatio = (pos - exhaleStart) / exhale;
      env = Math.max(env, 0.19 * Math.sin(Math.PI * exRatio));
    }

    let sig = b2 * env * 1.15;

    const heartPos = t % 0.88;
    if (heartPos < 0.05) {
      sig += 0.035 * Math.sin(2 * Math.PI * 65 * heartPos) * Math.exp(-55 * heartPos);
    }

    if (presetId === 'wheeze' && inExhale) {
      const drift = 1 + 0.03 * Math.sin(2 * Math.PI * 1.8 * t);
      sig +=
        0.34 *
        Math.sin(Math.PI * exRatio) *
        (0.65 * Math.sin(2 * Math.PI * 390 * drift * t) +
          0.35 * Math.sin(2 * Math.PI * 780 * drift * t) +
          0.25 * Math.sin(2 * Math.PI * 525 * t));
    }

    if (presetId === 'crackle') {
      if (inInhale && rng.next() < 0.0028) {
        crackleDecay = 0.65 + rng.range(0, 0.3);
      }
      if (inInhale && crackleDecay > 0.005) {
        sig += 0.52 * crackleDecay * Math.sin(2 * Math.PI * 1150 * t);
        crackleDecay *= 0.91;
      }
    }

    if (presetId === 'noisy') {
      sig += rng.gaussian(0, 0.26);
      if (t > 2.2 && t < 5.6) {
        sig += 0.85 * Math.sin(2 * Math.PI * 145 * t) + rng.gaussian(0, 0.45);
      }
      if (t > 7.4 && t < 10.6) {
        sig *= 0.015;
      }
    }

    if (sig > 1) sig = 1;
    else if (sig < -1) sig = -1;
    samples[i] = sig;
  }

  return {
    samples,
    sampleRate,
    durationSec,
    breathPhases,
    title: getPresetTitle(presetId, clampedBpm),
  };
}

export function buildEstimatedBreathPhases(durationSec: number): BreathPhaseSpan[] {
  const spans: BreathPhaseSpan[] = [];
  let isInhale = true;
  for (let t = 0; t < durationSec; t += 2.0) {
    const end = Math.min(durationSec, t + 1.65);
    if (end > t + 0.05) {
      spans.push({
        startSec: round2(t),
        endSec: round2(end),
        phase: isInhale ? 'inhale' : 'exhale',
      });
    }
    isInhale = !isInhale;
  }
  return spans;
}

export async function decodeAndResampleArrayBuffer(
  buffer: ArrayBuffer,
  fileName = 'Your sound file',
): Promise<GeneratedAudioSource> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is unavailable in this browser.');
  }
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const targetRate = PAPER_CONSTANTS.SAMPLE_RATE_HZ;
    const clippedDuration = Math.min(PAPER_CONSTANTS.MAX_DURATION_SEC, decoded.duration);
    const targetDuration = Math.max(3, clippedDuration);
    const renderFrames = Math.max(1, Math.ceil(clippedDuration * targetRate));
    const offline = new OfflineAudioContext(1, renderFrames, targetRate);

    const monoBuffer = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const outMono = monoBuffer.getChannelData(0);
    const numChannels = decoded.numberOfChannels;
    for (let ch = 0; ch < numChannels; ch++) {
      const chData = decoded.getChannelData(ch);
      for (let i = 0; i < decoded.length; i++) {
        outMono[i] += chData[i] / numChannels;
      }
    }

    const srcNode = offline.createBufferSource();
    srcNode.buffer = monoBuffer;
    srcNode.connect(offline.destination);
    srcNode.start(0);
    const rendered = await offline.startRendering();
    const rawRendered = rendered.getChannelData(0);

    const finalLength = Math.max(targetRate * 3, Math.min(targetRate * 120, Math.round(targetDuration * targetRate)));
    const samples = new Float32Array(finalLength);
    samples.set(rawRendered.subarray(0, Math.min(rawRendered.length, finalLength)));

    const durationSec = round2(finalLength / targetRate);
    return {
      samples,
      sampleRate: targetRate,
      durationSec,
      breathPhases: buildEstimatedBreathPhases(durationSec),
      title: fileName || 'Your sound file',
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function decodeAndResampleAudioFile(file: File): Promise<GeneratedAudioSource> {
  const buf = await file.arrayBuffer();
  return decodeAndResampleArrayBuffer(buf, file.name);
}
