import {
  ContributingWindow,
  ExplanationTrace,
  PhoneStatus,
  QualityState,
  WindowAnalysis,
} from '../types/pulmoscan';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function studentTLogDensity(
  x: number,
  loc: number,
  scale: number,
  dof: number,
): number {
  const s = Math.max(1e-4, scale);
  const z = (x - loc) / s;
  return -0.5 * (dof + 1) * Math.log(1 + (z * z) / dof) - Math.log(s);
}

export function stepHbQcsr(params: {
  prevSr: number;
  observation: number | null;
  censoredType: 'none' | 'transport' | 'acquisition';
  personalMean: number;
  personalScale: number;
  tempering: number;
  informativeCensoring: boolean;
}): number {
  const {
    prevSr,
    observation,
    censoredType,
    personalMean,
    personalScale,
    tempering,
    informativeCensoring,
  } = params;

  if (censoredType === 'transport') {
    return prevSr;
  }

  if (censoredType === 'acquisition' || observation === null) {
    const rawEta = informativeCensoring ? 0.52 : 0;
    const tempered = tempering * rawEta;
    return clamp((0.65 + 0.85 * prevSr) * Math.exp(tempered - 0.14), 0.1, 40);
  }

  const altMean = personalMean + 1.65 * personalScale;
  const logH0 = studentTLogDensity(observation, personalMean, personalScale, 6);
  const logH1 = studentTLogDensity(
    observation,
    altMean,
    1.12 * personalScale,
    6,
  );
  const surprise = clamp(logH1 - logH0, -0.85, 2.6);
  return clamp((1 + prevSr) * Math.exp(0.62 * surprise - 0.28), 0.08, 40);
}

export function evaluateSessionHbQcsr(
  windows: WindowAnalysis[],
  _validBaselineDays: number,
  tempering = 0.35,
): ExplanationTrace {
  const baselineMean = 0.38;
  const baselineScale = 0.24;
  const studentTDof = 6;
  const srThreshold = 6.5;

  const validWindows = windows.filter(
    (w) => w.qualityState === QualityState.VALID,
  );
  const transportWindows = windows.filter(
    (w) => w.qualityState === QualityState.TRANSPORT_CENSORED,
  );
  const acqWindows = windows.filter(
    (w) => w.qualityState === QualityState.ACQUISITION_CENSORED,
  );

  // MAR rule: if no valid windows and only transport-censored windows exist, pool transport windows
  const pool =
    validWindows.length > 0
      ? validWindows
      : acqWindows.length === 0 && transportWindows.length > 0
        ? transportWindows
        : [];

  let acousticMean = baselineMean;
  let predictiveSurprise = 0;

  if (pool.length > 0) {
    let sum = 0;
    for (const w of pool) sum += w.acousticAnomalyScore;
    acousticMean = sum / pool.length;

    const altMean = baselineMean + 1.65 * baselineScale;
    const logH0 = studentTLogDensity(
      acousticMean,
      baselineMean,
      baselineScale,
      studentTDof,
    );
    const logH1 = studentTLogDensity(
      acousticMean,
      altMean,
      1.12 * baselineScale,
      studentTDof,
    );
    predictiveSurprise = round3(logH1 - logH0);
  }

  const totalCount = windows.length;
  const acqFraction = totalCount > 0 ? acqWindows.length / totalCount : 0;
  const censoringEvidenceTerm =
    acqFraction > 0.25 ? round3(tempering * acqFraction * 1.4) : 0;

  const srStatistic = round2(
    clamp(
      Math.exp(
        Math.max(-1.6, 0.72 * predictiveSurprise + censoringEvidenceTerm),
      ),
      0.18,
      18,
    ),
  );

  let status: PhoneStatus;
  if (
    validWindows.length === 0 &&
    (acqWindows.length > 0 || transportWindows.length > 0)
  ) {
    status = PhoneStatus.CENSORED_TODAY;
  } else if (srStatistic >= srThreshold) {
    status = PhoneStatus.ELEVATED;
  } else if (srStatistic >= srThreshold * 0.48) {
    status = PhoneStatus.EARLY_WATCH;
  } else {
    status = PhoneStatus.STABLE;
  }

  const contributingWindows: ContributingWindow[] = windows
    .map((w) => {
      let contribution = 0;
      if (w.qualityState === QualityState.VALID) {
        contribution = round3(
          Math.max(0, (w.acousticAnomalyScore - 0.38) * 0.85),
        );
      } else if (w.qualityState === QualityState.ACQUISITION_CENSORED) {
        contribution = round3(tempering * 0.35);
      }
      return {
        index: w.index,
        startSec: w.startSec,
        endSec: w.endSec,
        qualityState: w.qualityState,
        contribution,
        reason: w.reason,
      };
    })
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 6);

  return {
    baselineMean,
    baselineScale,
    studentTDof,
    predictiveSurprise,
    censoringEvidenceTerm,
    temperingLambda: tempering,
    srStatistic,
    srThreshold,
    status,
    contributingWindows,
  };
}
