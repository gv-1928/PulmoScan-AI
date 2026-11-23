import { createRng } from '../simulation/rng';
import {
  BleLinkConfig,
  BleLinkResult,
  BlePacket,
  PAPER_CONSTANTS,
  WindowTransportStat,
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

export function simulateBleLink(
  rawSamples: Float32Array,
  config: BleLinkConfig,
): BleLinkResult {
  const mtuBytes = config.mtuBytes;
  const audioBytes = Math.max(20, mtuBytes - PAPER_CONSTANTS.BLE_HEADER_BYTES);
  const samplesPerPacket = Math.floor(audioBytes / 2);
  const packetMs = (samplesPerPacket / PAPER_CONSTANTS.SAMPLE_RATE_HZ) * 1000;
  const totalPackets = Math.max(1, Math.ceil(rawSamples.length / samplesPerPacket));

  const rngSeed =
    config.seed * 7919 + Math.round(config.packetLossPct * 100) + mtuBytes;
  const rng = createRng(rngSeed);
  const lossRate = Math.max(0, Math.min(0.2, config.packetLossPct / 100));

  const disconnectStart = Math.floor(totalPackets * 0.42);
  const disconnectLen = Math.max(4, Math.round(140 / packetMs));

  const packets: BlePacket[] = new Array(totalPackets);
  const reassembledSamples = new Float32Array(rawSamples.length);

  let inBurst = false;
  let consecutiveLost = 0;
  let lostCount = 0;
  let receivedCount = 0;
  let maxGapMs = 0;

  for (let i = 0; i < totalPackets; i++) {
    let lost = false;
    if (config.burstMode) {
      if (inBurst) {
        inBurst = rng.next() < 0.72;
      } else {
        inBurst = rng.next() < lossRate * 0.28;
      }
      lost = inBurst;
    } else {
      lost = rng.next() < lossRate;
    }

    if (
      config.disconnectEvent &&
      i >= disconnectStart &&
      i < disconnectStart + disconnectLen
    ) {
      lost = true;
    }

    if (lost) {
      consecutiveLost++;
      lostCount++;
    } else {
      consecutiveLost = 0;
      receivedCount++;
    }

    const gapMsAfterPrev = lost ? round3(consecutiveLost * packetMs) : 0;
    if (gapMsAfterPrev > maxGapMs) {
      maxGapMs = gapMsAfterPrev;
    }

    const sampleIndex = i * samplesPerPacket;
    const endIdx = Math.min(rawSamples.length, sampleIndex + samplesPerPacket);
    const payloadSamples = Math.max(0, endIdx - sampleIndex);

    if (lost) {
      for (let s = sampleIndex; s < endIdx; s++) {
        reassembledSamples[s] = 0;
      }
    } else {
      for (let s = sampleIndex; s < endIdx; s++) {
        const clamped = Math.max(-1, Math.min(1, rawSamples[s]));
        reassembledSamples[s] = Math.round(clamped * 32767) / 32767;
      }
    }

    const flags = lost
      ? 0x04
      : config.linkMode === 'WIFI_DEV'
        ? 0x02
        : 0x01;

    packets[i] = {
      seq: i & 0xffff,
      version: 1,
      flags,
      sampleIndex,
      byteLength: mtuBytes,
      payloadSamples,
      timestampMs: round3(i * packetMs),
      lost,
      gapMsAfterPrev,
    };
  }

  const windowSamples =
    PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.WINDOW_SEC;
  const hopSamples = Math.round(
    PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.WINDOW_HOP_SEC,
  );
  const numWindows = Math.max(
    1,
    Math.floor((rawSamples.length - windowSamples) / hopSamples) + 1,
  );

  const windowTransportStats: WindowTransportStat[] = [];
  for (let w = 0; w < numWindows; w++) {
    const wStart = w * hopSamples;
    const wEnd = wStart + windowSamples;
    const firstPkt = Math.floor(wStart / samplesPerPacket);
    const lastPkt = Math.min(
      totalPackets - 1,
      Math.floor(Math.max(wStart, wEnd - 1) / samplesPerPacket),
    );

    let winTotal = 0;
    let winLost = 0;
    let winConsec = 0;
    let winMaxGap = 0;

    for (let p = firstPkt; p <= lastPkt; p++) {
      winTotal++;
      if (packets[p].lost) {
        winLost++;
        winConsec++;
        const g = winConsec * packetMs;
        if (g > winMaxGap) winMaxGap = g;
      } else {
        winConsec = 0;
      }
    }

    windowTransportStats.push({
      windowIndex: w,
      lossPct: winTotal > 0 ? round2((winLost / winTotal) * 100) : 0,
      maxGapMs: round1(winMaxGap),
      lostPackets: winLost,
      totalPackets: winTotal,
    });
  }

  return {
    packets,
    reassembledSamples,
    sentCount: totalPackets,
    receivedCount,
    lostCount,
    lossPct: totalPackets > 0 ? round2((lostCount / totalPackets) * 100) : 0,
    maxGapMs: round1(maxGapMs),
    mtuBytes,
    windowTransportStats,
  };
}
