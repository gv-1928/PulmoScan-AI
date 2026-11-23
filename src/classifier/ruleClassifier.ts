import {
  ClassifierOutput,
  QualityState,
  WindowAnalysis,
} from '../types/pulmoscan';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function runRuleBasedClassifier(
  windows: WindowAnalysis[],
): ClassifierOutput {
  const validWindows = windows.filter(
    (w) => w.qualityState === QualityState.VALID,
  );
  const pool = validWindows.length > 0 ? validWindows : windows;

  if (pool.length === 0) {
    return {
      normal: 1,
      wheeze: 0,
      crackle: 0,
      validWindowCount: validWindows.length,
      totalWindowCount: windows.length,
      label: 'CNN Classification',
    };
  }

  let normalSum = 0;
  let wheezeSum = 0;
  let crackleSum = 0;
  for (const w of pool) {
    normalSum += w.normalProb;
    wheezeSum += w.wheezeProb;
    crackleSum += w.crackleProb;
  }

  const normalAvg = normalSum / pool.length;
  const wheezeAvg = wheezeSum / pool.length;
  const crackleAvg = crackleSum / pool.length;
  const total = normalAvg + wheezeAvg + crackleAvg || 1;

  return {
    normal: round3(normalAvg / total),
    wheeze: round3(wheezeAvg / total),
    crackle: round3(crackleAvg / total),
    validWindowCount: validWindows.length,
    totalWindowCount: windows.length,
    label: 'CNN Classification',
  };
}
