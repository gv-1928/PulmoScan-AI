import { z } from 'zod';

export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  WINDOW_DURATION_SEC: 3.0,
  WINDOW_STEP_SEC: 1.5, // 50% overlap
  MAX_SESSION_SEC: 120.0,
  N_FFT: 512,
  HOP_LENGTH: 256,
  MEL_BANDS: 64,
} as const;

export const BLE_CONFIG = {
  DEVICE_NAME: 'PulmoScan-AI',
  SERVICE_UUID: '12345678-1234-1234-1234-1234567890ab',
  RESULT_CHAR_UUID: '12345678-1234-1234-1234-1234567890ac',
  REPORT_CHAR_UUID: '12345678-1234-1234-1234-1234567890ad',
  PROTOCOL_VERSION: 2,
  DEFAULT_MTU: 185,
  ALLOWED_MTUS: [23, 185, 512] as const,
  PACKET_PACING_MS: 25,
} as const;

export type AcousticClass = 'Normal' | 'Wheeze' | 'Crackle';
export type PatternStatus = 'Stable' | 'EarlyWatch' | 'ElevatedPattern' | 'AcutePattern';
export type ScreeningResultStatus = PatternStatus | 'REPEAT_RECORDING';

export type TransportType = 'wifi' | 'ble';

export interface WindowQuality {
  index: number;
  startTime: number;
  endTime: number;
  isValid: boolean;
  discardReason?: string;
  peak: number;
  clipping: number;
  noiseFloor: number;
  contactStability: number;
}

export interface AcousticEvent {
  type: 'wheeze' | 'crackle';
  time: number;
  duration?: number;
  frequencyRange?: [number, number];
}

export interface AudioMeasurements {
  qualityScore: number; // 0 or 1
  validWindows: number;
  totalWindows: number;
  usableAudioRatio: number;
  respiratoryRate: number | null; // breaths/min
  respiratoryRateReason?: string;
  breathIntervalVariability?: number; // ms
  wheezeBurden: number; // 0 - 1
  wheezeCount: number;
  wheezeMeanDuration: number; // s
  crackleBurden: number; // 0 - 1
  crackleCount: number;
  crackleRatePerBreath: number;
  localClass: AcousticClass;
  confidence: number;
  bothFlag: boolean;
  windows: WindowQuality[];
  events: AcousticEvent[];
  waveformSample?: number[]; // downsampled for display
  spectrogramOverview?: {
    melBands: number;
    frames: number;
    grid: number[][]; // normalized 0..1
  };
}

export const ReportSchema = z.object({
  summary: z.string().describe('≤ 60 words, plain language, no jargon'),
  audio_review: z.object({
    agreement: z.enum(['consistent', 'differs', 'uncertain']),
    note: z.string().describe('≤ 30 words'),
  }),
  key_observations: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      meaning: z.string().describe('≤ 20 words'),
    })
  ),
  possible_conditions: z.array(
    z.object({
      name: z.string(),
      why_considered: z.string().describe('tie to a specific measurement'),
      strength: z.enum(['more consistent', 'possible', 'less likely']),
    })
  ),
  red_flags: z.array(z.string().describe('symptoms that should prompt urgent medical care')),
  next_steps: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type ReportPayload = z.infer<typeof ReportSchema>;

export interface DecisionTrace {
  A: number;
  conf: number;
  D: number;
  slope: number;
  persist: number;
  g: number;
  baselineStatus: 'Not Established' | 'Building' | 'Established';
  nValid: number;
  acuteOverride: boolean;
  explanation: string;
}

export interface SessionRecord {
  id: string;
  timestamp: string; // ISO
  transport: TransportType;
  quality: 0 | 1;
  status: ScreeningResultStatus;
  localClass: AcousticClass;
  confidence: number;
  measurements: AudioMeasurements;
  report: ReportPayload;
  trace: DecisionTrace;
  isDemoData?: boolean;
}

// Packet format for BLE chunking:
// Header: [seq (uint16), total (uint16)] -> 4 bytes
// Payload: up to (MTU - 3 - 4) bytes
// CRC trailer: final packet has seq == total, containing CRC16 in 2 bytes.

export interface BlePacket {
  seq: number;
  total: number;
  data: string; // hex encoded
  isCrc?: boolean;
}

// CRC-16-CCITT implementation
export function calculateCrc16(data: string): number {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(data);
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

export function chunkPayload(jsonStr: string, mtu: number = BLE_CONFIG.DEFAULT_MTU): BlePacket[] {
  const maxPayloadPerPacket = Math.max(16, mtu - 3 - 4); // 3 bytes ATT header, 4 bytes sequence header
  const totalChunks = Math.ceil(jsonStr.length / maxPayloadPerPacket);
  const packets: BlePacket[] = [];

  for (let seq = 1; seq <= totalChunks; seq++) {
    const start = (seq - 1) * maxPayloadPerPacket;
    const end = Math.min(start + maxPayloadPerPacket, jsonStr.length);
    const chunkStr = jsonStr.substring(start, end);
    packets.push({
      seq,
      total: totalChunks + 1, // total includes CRC packet
      data: chunkStr,
    });
  }

  // Final CRC packet
  const crc = calculateCrc16(jsonStr);
  packets.push({
    seq: totalChunks + 1,
    total: totalChunks + 1,
    data: crc.toString(16).padStart(4, '0'),
    isCrc: true,
  });

  return packets;
}

export function reassemblePackets(packets: BlePacket[]): { success: boolean; data?: string; error?: string } {
  if (packets.length === 0) return { success: false, error: 'No packets provided' };
  
  // Sort packets by sequence
  const sorted = [...packets].sort((a, b) => a.seq - b.seq);
  const total = sorted[0].total;
  
  // Check for missing sequence numbers
  for (let i = 1; i <= total; i++) {
    if (!sorted.find(p => p.seq === i)) {
      return { success: false, error: `Missing packet ${i} of ${total}` };
    }
  }

  const dataPackets = sorted.filter(p => p.seq < total);
  const crcPacket = sorted.find(p => p.seq === total);

  if (!crcPacket) {
    return { success: false, error: 'Missing CRC trailer packet' };
  }

  const combinedString = dataPackets.map(p => p.data).join('');
  const computedCrc = calculateCrc16(combinedString).toString(16).padStart(4, '0');
  const expectedCrc = crcPacket.data.toLowerCase();

  if (computedCrc !== expectedCrc) {
    return {
      success: false,
      error: `CRC mismatch: expected ${expectedCrc}, computed ${computedCrc}`,
    };
  }

  return { success: true, data: combinedString };
}
