import { stepHbQcsr } from '../detector/hbQcsr';
import { stepPopulationDetector } from '../detector/population';
import { stepZScoreDetector } from '../detector/zscore';
import {
  BenchmarkRow,
  BenchmarkSimulationResult,
  DailyDetectorPoint,
  PAPER_CONSTANTS,
  PhoneStatus,
  ScenarioId,
  SessionRecord,
} from '../types/pulmoscan';
import { createRng } from './rng';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function simulateSubject180Days(params: {
  scenario: ScenarioId;
  seed: number;
  subjectId: number;
  informativeCensoring: boolean;
  tempering: number;
}): BenchmarkSimulationResult {
  const { scenario, seed, subjectId, informativeCensoring, tempering } = params;
  const rngSeed = seed * 104729 + subjectId * 7919 + scenario.length * 997;
  const rng = createRng(rngSeed);

  const changePointDay = 108 + (seed % 5) * 4;
  const personalMean = 0.36 + (subjectId % 7) * 0.055;
  const personalScale = 0.17 + (subjectId % 3) * 0.02;

  const hbThreshold = 6.5;
  const zThreshold = 2.45;
  const popThreshold = 2.25;

  let prevSr = 0.3;
  let prevZ = 0;

  const trajectory: DailyDetectorPoint[] = [];

  let preHb = 0;
  let preZ = 0;
  let prePop = 0;
  let postHb = 0;
  let postZ = 0;
  let postPop = 0;
  let firstPostHb: number | null = null;
  let firstPostZ: number | null = null;
  let firstPostPop: number | null = null;

  const shift =
    scenario === 'weak-prodrome'
      ? 0.34
      : scenario === 'strong-prodrome'
        ? 0.68
        : 0.52;

  for (let day = 1; day <= PAPER_CONSTANTS.COHORT_DAYS; day++) {
    let latentSeverity = 0;
    if (day >= changePointDay) {
      const e = day - changePointDay;
      if (scenario === 'strong-prodrome') {
        latentSeverity = Math.min(1, e / 14);
      } else if (scenario === 'weak-prodrome') {
        latentSeverity = Math.min(0.54, (e / 32) * 0.54);
      } else {
        latentSeverity = Math.min(0.76, e / 20);
      }
    }

    const pTransport = 0.06;
    const pAcqBase = scenario === 'informative-censoring' ? 0.08 : 0.04;
    const pAcq =
      scenario === 'informative-censoring' && informativeCensoring
        ? pAcqBase + latentSeverity * 0.24
        : pAcqBase;

    const u = rng.next();
    let censoredType: 'none' | 'transport' | 'acquisition' = 'none';
    if (u < pTransport) censoredType = 'transport';
    else if (u < pTransport + pAcq) censoredType = 'acquisition';

    const obs =
      censoredType === 'none'
        ? personalMean +
          latentSeverity * shift +
          rng.studentT(6, 0, personalScale)
        : null;

    prevSr = stepHbQcsr({
      prevSr,
      observation: obs,
      censoredType,
      personalMean,
      personalScale,
      tempering,
      informativeCensoring,
    });

    prevZ = stepZScoreDetector({
      prevZ,
      observation: obs,
      censoredType,
      personalMean,
      personalScale,
    });

    const pop = stepPopulationDetector({
      observation: obs,
      censoredType,
    });

    const hbAlert = prevSr >= hbThreshold;
    const zAlert = prevZ >= zThreshold;
    const popAlert = pop >= popThreshold;

    if (day < changePointDay) {
      if (hbAlert) preHb++;
      if (zAlert) preZ++;
      if (popAlert) prePop++;
    } else {
      if (hbAlert) {
        postHb++;
        if (firstPostHb === null) firstPostHb = day;
      }
      if (zAlert) {
        postZ++;
        if (firstPostZ === null) firstPostZ = day;
      }
      if (popAlert) {
        postPop++;
        if (firstPostPop === null) firstPostPop = day;
      }
    }

    trajectory.push({
      day,
      hbQcsr: round2(prevSr),
      zScore: round2(prevZ),
      population: round2(pop),
      hbAlert,
      zAlert,
      popAlert,
      censoredType,
      latentSeverity: round3(latentSeverity),
    });
  }

  const preDays = Math.max(1, changePointDay - 1);
  const postDays = Math.max(1, PAPER_CONSTANTS.COHORT_DAYS - changePointDay + 1);

  const table: BenchmarkRow[] = [
    {
      detector: 'Personal alert',
      falseAlertsPer30Days: round2((preHb / preDays) * 30),
      detectionDelayDays:
        firstPostHb !== null ? firstPostHb - changePointDay : null,
      sensitivity: round2(postHb / postDays),
      notes: 'Learns your own normal range first.',
    },
    {
      detector: 'Simple average',
      falseAlertsPer30Days: round2((preZ / preDays) * 30),
      detectionDelayDays:
        firstPostZ !== null ? firstPostZ - changePointDay : null,
      sensitivity: round2(postZ / postDays),
      notes: 'Checks only basic day-to-day ups and downs.',
    },
    {
      detector: 'Fixed cutoff',
      falseAlertsPer30Days: round2((prePop / preDays) * 30),
      detectionDelayDays:
        firstPostPop !== null ? firstPostPop - changePointDay : null,
      sensitivity: round2(postPop / postDays),
      notes: 'Uses one cutoff for everyone.',
    },
  ];

  return {
    scenario,
    seed,
    subjectId,
    informativeCensoring,
    tempering,
    changePointDay,
    hbThreshold,
    zThreshold,
    popThreshold,
    trajectory,
    table,
  };
}

export function generate30DayDeteriorationSessions(seed = 7): SessionRecord[] {
  const rng = createRng(seed * 4099);
  const baseMs = Date.parse('2026-10-24T08:00:00Z');
  const sessions: SessionRecord[] = [];
  let validDays = 0;

  for (let d = 1; d <= 30; d++) {
    const isDay6 = d === 6;
    const isDay19 = d === 19;
    const skipped = isDay6 || isDay19;

    if (!skipped) {
      validDays++;
    }

    let status: PhoneStatus;
    let srStatistic: number;
    let dominantClass: 'Normal' | 'Wheeze' | 'Crackle' = 'Normal';

    if (validDays < 14) {
      status = skipped ? PhoneStatus.CENSORED_TODAY : PhoneStatus.CALIBRATING;
      srStatistic = 0.28 + rng.range(0, 0.25);
    } else if (skipped) {
      status = PhoneStatus.CENSORED_TODAY;
      srStatistic = 1.1;
    } else if (d < 21) {
      status = PhoneStatus.STABLE;
      srStatistic = 0.42 + rng.range(0, 0.4);
    } else if (d < 25) {
      status = PhoneStatus.EARLY_WATCH;
      srStatistic = 3.2 + (d - 20) * 0.65;
      dominantClass = 'Wheeze';
    } else {
      status = PhoneStatus.ELEVATED;
      srStatistic = 6.8 + (d - 24) * 1.1;
      dominantClass = 'Wheeze';
    }

    const timestampIso = new Date(
      baseMs + (d - 1) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const record: SessionRecord = {
      id: `demo-day-${d}`,
      dayIndex: d,
      timestampIso,
      label: `Day ${d} recording`,
      presetId: d >= 21 ? 'wheeze' : 'normal',
      status,
      srStatistic: round2(srStatistic),
      validWindows: skipped ? 1 : 7,
      transportCensoredWindows: isDay6 ? 6 : 0,
      acquisitionCensoredWindows: isDay19 ? 6 : 0,
      dominantClass,
      isSynthetic: true,
    };

    if (isDay6) {
      record.censoredReason = 'Lost while sending over Bluetooth';
    } else if (isDay19) {
      record.censoredReason = 'Bad recording (loose chest contact)';
    }

    sessions.push(record);
  }

  return sessions;
}
