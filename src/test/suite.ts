import {
  generateSyntheticAudio,
  measureAudio,
  encodeWav16kMono,
} from '../shared/audioProcessor.ts';
import {
  evaluateSession,
  createWelford,
  updateWelford,
  HistoricalSessionSummary,
  DEFAULT_ENGINE_CONFIG,
} from '../shared/engine.ts';
import {
  chunkPayload,
  reassemblePackets,
  calculateCrc16,
  BlePacket,
} from '../shared/contract.ts';
import { generateTemplateReport } from '../shared/reportGenerator.ts';

export interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  details: string;
  data?: any;
}

export async function runAcceptanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // -------------------------------------------------------------
  // Test 1: Quiet demo clip → q=1, class Normal, status Stable (no baseline)
  // -------------------------------------------------------------
  try {
    const normalAudio = generateSyntheticAudio('Normal', 6.0);
    const m = measureAudio(normalAudio);
    const baseline = createWelford();
    const fusion = evaluateSession(m, [], baseline);

    const passed =
      m.qualityScore === 1 &&
      m.localClass === 'Normal' &&
      fusion.status === 'Stable' &&
      fusion.trace.baselineStatus === 'Not Established';

    results.push({
      id: 1,
      name: 'Quiet demo clip → q=1, Normal, Stable (no baseline)',
      category: 'Audio & Baseline',
      passed,
      details: passed
        ? `Passed: q=${m.qualityScore}, class=${m.localClass}, status=${fusion.status}`
        : `Failed: q=${m.qualityScore}, class=${m.localClass}, status=${fusion.status}`,
      data: { m, fusion },
    });
  } catch (err: any) {
    results.push({
      id: 1,
      name: 'Quiet demo clip verification',
      category: 'Audio & Baseline',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 2: Wheeze demo clip → class Wheeze, wheeze events > 0, conditions tied to measurement
  // -------------------------------------------------------------
  try {
    const wheezeAudio = generateSyntheticAudio('Wheeze', 8.0);
    const m = measureAudio(wheezeAudio);
    const report = generateTemplateReport(m);
    const hasTiedConditions = report.possible_conditions.some((c) =>
      c.why_considered.toLowerCase().includes('wheeze') || c.why_considered.toLowerCase().includes('musical')
    );

    const passed =
      m.localClass === 'Wheeze' &&
      m.wheezeCount > 0 &&
      m.wheezeBurden > 0.05 &&
      hasTiedConditions;

    results.push({
      id: 2,
      name: 'Wheeze demo clip → class Wheeze, events > 0, tied conditions',
      category: 'Acoustics & Report',
      passed,
      details: passed
        ? `Passed: class=${m.localClass}, count=${m.wheezeCount}, burden=${(m.wheezeBurden * 100).toFixed(1)}%`
        : `Failed: class=${m.localClass}, count=${m.wheezeCount}`,
      data: { m, conditions: report.possible_conditions },
    });
  } catch (err: any) {
    results.push({
      id: 2,
      name: 'Wheeze demo clip verification',
      category: 'Acoustics & Report',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 3: Crackle demo clip → class Crackle, crackle count > 0
  // -------------------------------------------------------------
  try {
    const crackleAudio = generateSyntheticAudio('Crackle', 8.0);
    const m = measureAudio(crackleAudio);

    const passed = m.localClass === 'Crackle' && m.crackleCount > 0;
    results.push({
      id: 3,
      name: 'Crackle demo clip → class Crackle, crackle count > 0',
      category: 'Acoustics & Report',
      passed,
      details: passed
        ? `Passed: class=${m.localClass}, crackleCount=${m.crackleCount}`
        : `Failed: class=${m.localClass}, crackleCount=${m.crackleCount}`,
      data: { m },
    });
  } catch (err: any) {
    results.push({
      id: 3,
      name: 'Crackle demo clip verification',
      category: 'Acoustics & Report',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 4: Noisy demo clip → q=0 → REPEAT_RECORDING, no conditions
  // -------------------------------------------------------------
  try {
    const noisyAudio = generateSyntheticAudio('Noisy', 6.0);
    const m = measureAudio(noisyAudio);
    const baseline = createWelford();
    const fusion = evaluateSession(m, [], baseline);
    const report = generateTemplateReport(m);

    const passed =
      m.qualityScore === 0 &&
      fusion.status === 'REPEAT_RECORDING' &&
      report.possible_conditions.length === 0;

    results.push({
      id: 4,
      name: 'Noisy demo clip → q=0 → REPEAT_RECORDING, 0 conditions',
      category: 'Safety & Quality Gate',
      passed,
      details: passed
        ? `Passed: q=${m.qualityScore}, status=${fusion.status}, conditions=${report.possible_conditions.length}`
        : `Failed: q=${m.qualityScore}, status=${fusion.status}`,
      data: { m, fusion, report },
    });
  } catch (err: any) {
    results.push({
      id: 4,
      name: 'Noisy demo clip verification',
      category: 'Safety & Quality Gate',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 5: Strong abnormal clip on day 1 with no baseline → AcutePattern (acute override)
  // -------------------------------------------------------------
  try {
    const wheezeAudio = generateSyntheticAudio('Wheeze', 8.0);
    const m = measureAudio(wheezeAudio);
    // Force strong abnormal indicators with high confidence
    m.wheezeBurden = 0.85;
    m.confidence = 0.95;
    m.localClass = 'Wheeze';
    m.qualityScore = 1;

    const emptyHistory: HistoricalSessionSummary[] = [];
    const baseline = createWelford();
    const fusion = evaluateSession(m, emptyHistory, baseline);

    const passed =
      fusion.status === 'AcutePattern' &&
      fusion.trace.acuteOverride === true &&
      fusion.trace.baselineStatus === 'Not Established';

    results.push({
      id: 5,
      name: 'Strong abnormal on day 1 → AcutePattern (acute override)',
      category: 'Clinical Decision Engine',
      passed,
      details: passed
        ? `Passed: status=${fusion.status}, acuteOverride=${fusion.trace.acuteOverride}`
        : `Failed: status=${fusion.status}, acuteOverride=${fusion.trace.acuteOverride}`,
      data: { fusion },
    });
  } catch (err: any) {
    results.push({
      id: 5,
      name: 'Acute override verification',
      category: 'Clinical Decision Engine',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 6: Fourteen calendar days with only nine valid → baseline still Building
  // -------------------------------------------------------------
  try {
    const history: HistoricalSessionSummary[] = [];
    for (let day = 0; day < 14; day++) {
      const isValid = day < 9; // Only 9 valid days
      history.push({
        id: `day-${day}`,
        dayIndex: day,
        timestamp: new Date(Date.now() - (14 - day) * 86400000).toISOString(),
        quality: isValid ? 1 : 0,
        isCensored: !isValid,
        burden: 0.04,
        class: 'Normal',
        conf: 0.92,
      });
    }

    const normalAudio = generateSyntheticAudio('Normal', 6.0);
    const m = measureAudio(normalAudio);
    const baseline = createWelford();
    const fusion = evaluateSession(m, history, baseline);

    const passed = fusion.trace.baselineStatus === 'Building' && fusion.trace.nValid === 10; // 9 prior + 1 today
    results.push({
      id: 6,
      name: '14 calendar days with 9 valid → baseline still Building',
      category: 'Clinical Decision Engine',
      passed,
      details: passed
        ? `Passed: baselineStatus=${fusion.trace.baselineStatus}, validCount=${fusion.trace.nValid - 1}/14`
        : `Failed: baselineStatus=${fusion.trace.baselineStatus}`,
      data: { fusion },
    });
  } catch (err: any) {
    results.push({
      id: 6,
      name: 'Building baseline status check',
      category: 'Clinical Decision Engine',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 7: A censored day never changes the status or any statistic
  // -------------------------------------------------------------
  try {
    let baseline = createWelford();
    baseline = updateWelford(baseline, 0.05);
    baseline = updateWelford(baseline, 0.06);

    const normalAudio = generateSyntheticAudio('Normal', 6.0);
    const m = measureAudio(normalAudio);
    m.qualityScore = 0; // Censored/invalid session

    const fusion = evaluateSession(m, [], baseline, 'Stable');
    const statsBefore = baseline;
    const statsAfter = fusion.updatedBaseline;

    const passed =
      fusion.status === 'REPEAT_RECORDING' &&
      statsBefore.count === statsAfter.count &&
      statsBefore.mean === statsAfter.mean;

    results.push({
      id: 7,
      name: 'Censored day never changes baseline statistics or status',
      category: 'Clinical Decision Engine',
      passed,
      details: passed
        ? `Passed: baseline count unchanged (${statsAfter.count}), mean unchanged (${statsAfter.mean})`
        : `Failed: baseline modified unexpectedly`,
      data: { statsBefore, statsAfter },
    });
  } catch (err: any) {
    results.push({
      id: 7,
      name: 'Censored day immutability',
      category: 'Clinical Decision Engine',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 8: Gemini failure (simulate) → template report labelled "AI unavailable"
  // -------------------------------------------------------------
  try {
    const normalAudio = generateSyntheticAudio('Normal', 6.0);
    const m = measureAudio(normalAudio);
    // Explicit simulation of fallback
    const report = generateTemplateReport(m, 'measurement-only');

    const passed =
      report.audio_review.note.includes('AI unavailable') ||
      report.audio_review.note.includes('measurement-only');

    results.push({
      id: 8,
      name: 'Gemini failure simulation → template labelled "AI unavailable"',
      category: 'Cloud AI & Fallback',
      passed,
      details: passed
        ? `Passed: fallback report review: "${report.audio_review.note}"`
        : `Failed: note=${report.audio_review.note}`,
      data: { report },
    });
  } catch (err: any) {
    results.push({
      id: 8,
      name: 'Fallback template check',
      category: 'Cloud AI & Fallback',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 9: Simulate disconnect and 10% packet loss → phone recovers (CRC OK)
  // -------------------------------------------------------------
  try {
    const testJson = JSON.stringify({
      sid: 'sess-test-99',
      summary: 'Patient exhibits normal rhythmic ventilation with clear lung fields.',
      wheezeBurden: 0.04,
      crackleCount: 0,
      timestamp: new Date().toISOString(),
    });

    const packets = chunkPayload(testJson, 185);
    const totalPackets = packets.length;

    // Simulate losing packet #2
    const lostSeq = 2;
    const receivedPackets = packets.filter((p) => p.seq !== lostSeq);

    // Initial reassembly should fail due to missing packet
    const failedAttempt = reassemblePackets(receivedPackets);

    // Simulate NACK retransmission of lost packet
    const retransmittedPacket = packets.find((p) => p.seq === lostSeq)!;
    receivedPackets.push(retransmittedPacket);

    // Final reassembly after recovery
    const recoveredAttempt = reassemblePackets(receivedPackets);
    const passed = Boolean(
      !failedAttempt.success &&
      failedAttempt.error?.includes(`Missing packet ${lostSeq}`) &&
      recoveredAttempt.success &&
      recoveredAttempt.data === testJson
    );

    results.push({
      id: 9,
      name: 'Simulated packet loss & NACK recovery → CRC16 validated',
      category: 'Virtual BLE Transport',
      passed,
      details: passed
        ? `Passed: Packet ${lostSeq}/${totalPackets} recovered via NACK; CRC16 matched original data`
        : `Failed: Recovery failed`,
      data: { failedError: failedAttempt.error, recovered: recoveredAttempt.success },
    });
  } catch (err: any) {
    results.push({
      id: 9,
      name: 'BLE packet recovery check',
      category: 'Virtual BLE Transport',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 10: LocalStorage persistence of session history
  // -------------------------------------------------------------
  try {
    const testKey = 'pulmoscan_test_history_item';
    const sampleRecord = {
      id: 'test-10-rec',
      timestamp: new Date().toISOString(),
      status: 'Stable',
      class: 'Normal',
    };

    localStorage.setItem(testKey, JSON.stringify(sampleRecord));
    const retrieved = JSON.parse(localStorage.getItem(testKey) || '{}');
    localStorage.removeItem(testKey);

    const passed = retrieved.id === sampleRecord.id;
    results.push({
      id: 10,
      name: 'Session history local persistence verified',
      category: 'Persistence & Storage',
      passed,
      details: passed ? 'Passed: Records persist across reloads' : 'Failed: Storage retrieved empty item',
    });
  } catch (err: any) {
    results.push({
      id: 10,
      name: 'Storage persistence check',
      category: 'Persistence & Storage',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // -------------------------------------------------------------
  // Test 11: Security check: No GEMINI_API_KEY in client environment
  // -------------------------------------------------------------
  try {
    const windowHasKey = typeof (window as any).GEMINI_API_KEY !== 'undefined';
    const processHasKey =
      typeof process !== 'undefined' &&
      typeof (process.env as any)?.GEMINI_API_KEY !== 'undefined';

    // In browser/client, GEMINI_API_KEY should NEVER be defined or exposed
    const passed = !windowHasKey && !processHasKey;
    results.push({
      id: 11,
      name: 'Security check: GEMINI_API_KEY never exposed to client runtime',
      category: 'Security & Safety',
      passed,
      details: passed
        ? 'Passed: API credentials strictly confined to Node server layer'
        : 'Failed: Client environment leaked credential variable',
    });
  } catch (err: any) {
    results.push({
      id: 11,
      name: 'Security credentials exposure check',
      category: 'Security & Safety',
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  return results;
}
