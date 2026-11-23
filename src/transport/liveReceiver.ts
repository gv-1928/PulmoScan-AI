import { buildEstimatedBreathPhases } from '../simulation/audioPresets';
import {
  BleLinkResult,
  BlePacket,
  BreathPhaseSpan,
  LinkMode,
  PAPER_CONSTANTS,
  WindowTransportStat,
} from '../types/pulmoscan';

export type LivePacketFormat = 'auto' | 'pulmoscan-244' | 'raw-pcm16';

export interface LiveCaptureFinal {
  samples: Float32Array;
  breathPhases: BreathPhaseSpan[];
  durationSec: number;
  title: string;
  bleResult: BleLinkResult;
  deviceName: string;
  batteryPct: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export class LivePacketAccumulator {
  private readonly format: LivePacketFormat;
  private readonly linkMode: LinkMode;
  private readonly deviceName: string;
  private readonly batteryPct: number | null;

  private packets: BlePacket[] = [];
  private sampleChunks: Float32Array[] = [];
  private totalSamples = 0;
  private receivedCount = 0;
  private lostCount = 0;
  private maxGapMs = 0;
  private lastSeq: number | null = null;
  private lastMtu: number = PAPER_CONSTANTS.BLE_PACKET_BYTES;

  constructor(options: {
    format: LivePacketFormat;
    linkMode: LinkMode;
    deviceName: string;
    batteryPct: number | null;
  }) {
    this.format = options.format;
    this.linkMode = options.linkMode;
    this.deviceName = options.deviceName;
    this.batteryPct = options.batteryPct;
  }

  get receivedPackets(): number {
    return this.receivedCount;
  }

  get lostPackets(): number {
    return this.lostCount;
  }

  get bufferedSeconds(): number {
    return this.totalSamples / PAPER_CONSTANTS.SAMPLE_RATE_HZ;
  }

  ingestPacket(buffer: ArrayBuffer): { rms: number; bufferedSec: number } {
    const view = new DataView(buffer);
    const byteLength = buffer.byteLength;
    if (byteLength < 2) {
      return { rms: 0, bufferedSec: this.bufferedSeconds };
    }

    const usePulmoHeader =
      this.format === 'pulmoscan-244'
        ? byteLength >= 10
        : this.format === 'auto' &&
          (byteLength === 244 ||
            (byteLength >= 10 &&
              view.getUint8(0) === 1 &&
              (byteLength - 8) % 2 === 0));

    let version = 1;
    let flags = this.linkMode === 'BLE' ? 0x01 : 0x02;
    let seq = this.packets.length & 0xffff;
    let sampleOffsetBytes = 0;

    if (usePulmoHeader) {
      version = view.getUint8(0);
      flags = view.getUint8(1);
      seq = view.getUint16(2, true);
      sampleOffsetBytes = 8;
      this.lastMtu = byteLength;
    } else {
      this.lastMtu = Math.max(byteLength + 8, PAPER_CONSTANTS.BLE_PACKET_BYTES);
    }

    const pcmBytes = byteLength - sampleOffsetBytes;
    const payloadSamples = Math.floor(pcmBytes / 2);
    if (payloadSamples <= 0) {
      return { rms: 0, bufferedSec: this.bufferedSeconds };
    }

    const packetMs =
      (payloadSamples / PAPER_CONSTANTS.SAMPLE_RATE_HZ) * 1000;

    // Detect missed sequence numbers
    if (usePulmoHeader && this.lastSeq !== null) {
      const delta = (seq - this.lastSeq + 65536) & 0xffff;
      if (delta >= 2 && delta <= 499) {
        const missed = delta - 1;
        const silence = new Float32Array(missed * payloadSamples);
        this.sampleChunks.push(silence);
        for (let m = 0; m < missed; m++) {
          const missedSeq = (this.lastSeq + 1 + m) & 0xffff;
          const gapMs = round3((m + 1) * packetMs);
          if (gapMs > this.maxGapMs) this.maxGapMs = gapMs;
          this.packets.push({
            seq: missedSeq,
            version,
            flags: 0x04,
            sampleIndex: this.totalSamples,
            byteLength,
            payloadSamples,
            timestampMs: round3(
              (this.totalSamples / PAPER_CONSTANTS.SAMPLE_RATE_HZ) * 1000,
            ),
            lost: true,
            gapMsAfterPrev: gapMs,
          });
          this.totalSamples += payloadSamples;
          this.lostCount++;
        }
      }
    }
    this.lastSeq = seq;

    const pcm = new Float32Array(payloadSamples);
    let sq = 0;
    for (let i = 0; i < payloadSamples; i++) {
      const s = view.getInt16(sampleOffsetBytes + i * 2, true) / 32768;
      pcm[i] = s;
      sq += s * s;
    }
    const rms = Math.sqrt(sq / payloadSamples);

    this.packets.push({
      seq,
      version,
      flags,
      sampleIndex: this.totalSamples,
      byteLength,
      payloadSamples,
      timestampMs: round3(
        (this.totalSamples / PAPER_CONSTANTS.SAMPLE_RATE_HZ) * 1000,
      ),
      lost: false,
      gapMsAfterPrev: 0,
    });
    this.sampleChunks.push(pcm);
    this.totalSamples += payloadSamples;
    this.receivedCount++;

    return { rms, bufferedSec: this.bufferedSeconds };
  }

  finalize(): LiveCaptureFinal {
    const minSamples = PAPER_CONSTANTS.SAMPLE_RATE_HZ * 3;
    const maxSamples =
      PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.MAX_DURATION_SEC;
    const finalLen = Math.min(maxSamples, Math.max(minSamples, this.totalSamples));
    const samples = new Float32Array(finalLen);

    let offset = 0;
    for (const chunk of this.sampleChunks) {
      if (offset >= finalLen) break;
      const take = Math.min(chunk.length, finalLen - offset);
      samples.set(chunk.subarray(0, take), offset);
      offset += take;
    }

    const windowSamples =
      PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.WINDOW_SEC;
    const hopSamples = Math.round(
      PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.WINDOW_HOP_SEC,
    );
    const numWindows = Math.max(
      1,
      Math.floor((finalLen - windowSamples) / hopSamples) + 1,
    );

    const windowTransportStats: WindowTransportStat[] = [];
    for (let w = 0; w < numWindows; w++) {
      const wStart = w * hopSamples;
      const wEnd = wStart + windowSamples;
      let winTotal = 0;
      let winLost = 0;
      let winConsec = 0;
      let winMaxGap = 0;

      for (const pkt of this.packets) {
        const pEnd = pkt.sampleIndex + pkt.payloadSamples;
        if (pEnd <= wStart || pkt.sampleIndex >= wEnd) continue;
        winTotal++;
        const pktMs =
          (pkt.payloadSamples / PAPER_CONSTANTS.SAMPLE_RATE_HZ) * 1000;
        if (pkt.lost) {
          winLost++;
          winConsec++;
          const g = winConsec * pktMs;
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

    const sentCount = this.receivedCount + this.lostCount;
    const lossPct =
      sentCount > 0 ? round2((this.lostCount / sentCount) * 100) : 0;

    const bleResult: BleLinkResult = {
      packets: this.packets,
      reassembledSamples: samples,
      sentCount,
      receivedCount: this.receivedCount,
      lostCount: this.lostCount,
      lossPct,
      maxGapMs: round1(this.maxGapMs),
      mtuBytes: this.lastMtu,
      windowTransportStats,
    };

    const durationSec = round2(finalLen / PAPER_CONSTANTS.SAMPLE_RATE_HZ);
    const title =
      this.linkMode === 'BLE'
        ? `${this.deviceName} (Bluetooth)`
        : `${this.deviceName} stream`;

    return {
      samples,
      breathPhases: buildEstimatedBreathPhases(durationSec),
      durationSec,
      title,
      bleResult,
      deviceName: this.deviceName,
      batteryPct: this.batteryPct,
    };
  }
}

export function buildSingleBufferBleResult(
  samples: Float32Array,
  flag = 0x02,
): BleLinkResult {
  const samplesPerPacket = PAPER_CONSTANTS.BLE_SAMPLES_PER_PACKET;
  const packetMs = PAPER_CONSTANTS.BLE_PACKET_DURATION_MS;
  const totalPackets = Math.max(1, Math.ceil(samples.length / samplesPerPacket));

  const packets: BlePacket[] = new Array(totalPackets);
  const reassembledSamples = new Float32Array(samples);

  for (let i = 0; i < totalPackets; i++) {
    const sampleIndex = i * samplesPerPacket;
    const payloadSamples = Math.min(samplesPerPacket, samples.length - sampleIndex);
    packets[i] = {
      seq: i & 0xffff,
      version: 1,
      flags: flag,
      sampleIndex,
      byteLength: PAPER_CONSTANTS.BLE_PACKET_BYTES,
      payloadSamples,
      timestampMs: round3(i * packetMs),
      lost: false,
      gapMsAfterPrev: 0,
    };
  }

  const windowSamples =
    PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.WINDOW_SEC;
  const hopSamples = Math.round(
    PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.WINDOW_HOP_SEC,
  );
  const numWindows = Math.max(
    1,
    Math.floor((samples.length - windowSamples) / hopSamples) + 1,
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
    windowTransportStats.push({
      windowIndex: w,
      lossPct: 0,
      maxGapMs: 0,
      lostPackets: 0,
      totalPackets: Math.max(1, lastPkt - firstPkt + 1),
    });
  }

  return {
    packets,
    reassembledSamples,
    sentCount: totalPackets,
    receivedCount: totalPackets,
    lostCount: 0,
    lossPct: 0,
    maxGapMs: 0,
    mtuBytes: PAPER_CONSTANTS.BLE_PACKET_BYTES,
    windowTransportStats,
  };
}
