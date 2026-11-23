import {
  AcousticClass,
  PatternStatus,
  ScreeningResultStatus,
  AudioMeasurements,
  DecisionTrace,
} from './contract.ts';

export interface EngineConfig {
  A_HIGH: number; // Abnormality threshold for acute override (unvalidated)
  C_HIGH: number; // Confidence threshold for acute override (unvalidated)
  RHO_MIN: number; // Minimum valid window ratio for session quality (unvalidated)
  Z_MILD: number; // Z-score threshold for consecutive persistence (unvalidated)
  ETA_LOW: number; // Threshold for EarlyWatch (unvalidated)
  ETA_HIGH: number; // Threshold for ElevatedPattern (unvalidated)
  SIGMA_FLOOR: number; // Minimum standard deviation floor to avoid division by zero (unvalidated)
  W_D: number; // Weight for z-score deviation in g (0.55)
  W_SLOPE: number; // Weight for 7-day slope in g (1.65)
  W_PERSIST: number; // Weight for persistence in g (0.85)
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  A_HIGH: 0.70,
  C_HIGH: 0.75,
  RHO_MIN: 0.60,
  Z_MILD: 1.0,
  ETA_LOW: 1.2,
  ETA_HIGH: 2.4,
  SIGMA_FLOOR: 0.05,
  W_D: 0.55,
  W_SLOPE: 1.65,
  W_PERSIST: 0.85,
};

export interface WelfordAccumulator {
  count: number;
  mean: number;
  M2: number; // sum of squared differences
}

export function createWelford(): WelfordAccumulator {
  return { count: 0, mean: 0, M2: 0 };
}

export function updateWelford(acc: WelfordAccumulator, newValue: number): WelfordAccumulator {
  const count = acc.count + 1;
  const delta = newValue - acc.mean;
  const mean = acc.mean + delta / count;
  const delta2 = newValue - mean;
  const M2 = acc.M2 + delta * delta2;
  return { count, mean, M2 };
}

export function getWelfordStats(acc: WelfordAccumulator): { mean: number; variance: number; stdDev: number } {
  if (acc.count < 2) {
    return { mean: acc.mean, variance: 0, stdDev: 0 };
  }
  const variance = acc.M2 / (acc.count - 1);
  return { mean: acc.mean, variance, stdDev: Math.sqrt(Math.max(0, variance)) };
}

export interface HistoricalSessionSummary {
  id: string;
  dayIndex: number; // 0 to N
  timestamp: string;
  quality: 0 | 1;
  isCensored?: boolean; // e.g. user coughing excessively or flagged invalid
  burden: number; // wheezeBurden + crackleBurden
  class: AcousticClass;
  conf: number;
}

export interface FusionResult {
  status: ScreeningResultStatus;
  trace: DecisionTrace;
  updatedBaseline: WelfordAccumulator;
}

/**
 * Pure evaluation engine for PulmoScan screening logic.
 */
export function evaluateSession(
  measurements: AudioMeasurements,
  history: HistoricalSessionSummary[],
  currentBaseline: WelfordAccumulator,
  previousStatus: PatternStatus = 'Stable',
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): FusionResult {
  const q = measurements.qualityScore;
  const conf = measurements.confidence;
  const todayBurden = Math.min(1.0, measurements.wheezeBurden + measurements.crackleBurden);

  // 1. Abnormality score A
  let A = 0;
  if (measurements.localClass === 'Normal') {
    A = Math.max(0, 1 - conf);
  } else {
    A = Math.min(1, Math.max(conf, todayBurden));
  }

  // Count valid prior sessions
  const validHistory = history.filter(h => h.quality === 1 && !h.isCensored);
  const nValid = validHistory.length;
  
  let baselineStatus: 'Not Established' | 'Building' | 'Established' = 'Not Established';
  if (nValid >= 14) {
    baselineStatus = 'Established';
  } else if (nValid > 0) {
    baselineStatus = 'Building';
  }

  // 2. Acute override check:
  // If q=1 and A >= A_HIGH and conf >= C_HIGH -> AcutePattern, even on day 1 with no baseline!
  if (q === 1 && A >= config.A_HIGH && conf >= config.C_HIGH) {
    // Update baseline if valid
    const newBaseline = updateWelford(currentBaseline, todayBurden);
    return {
      status: 'AcutePattern',
      updatedBaseline: newBaseline,
      trace: {
        A,
        conf,
        D: 0,
        slope: 0,
        persist: 0,
        g: 3.5,
        baselineStatus,
        nValid,
        acuteOverride: true,
        explanation: `Acute override triggered: high acoustic abnormality (${(A * 100).toFixed(0)}%) with high confidence (${(conf * 100).toFixed(0)}%).`,
      },
    };
  }

  // 3. Quality gate failure (q = 0)
  if (q === 0) {
    return {
      status: 'REPEAT_RECORDING',
      updatedBaseline: currentBaseline, // Do NOT update statistics!
      trace: {
        A,
        conf,
        D: 0,
        slope: 0,
        persist: 0,
        g: 0,
        baselineStatus,
        nValid,
        acuteOverride: false,
        explanation: 'Audio quality score was insufficient (q=0). Baseline was not altered. Please record again in quiet conditions.',
      },
    };
  }

  // Compute baseline stats
  const baselineStats = getWelfordStats(currentBaseline);
  const stdEffective = Math.max(baselineStats.stdDev, config.SIGMA_FLOOR);

  // 4. Longitudinal features if baseline is Established
  let D = 0;
  let slope = 0;
  let persist = 0;
  let g = 0;

  if (baselineStatus === 'Established') {
    // z-score D
    D = (todayBurden - baselineStats.mean) / stdEffective;

    // 7-day slope (linear regression over last 7 valid days)
    const recent7 = validHistory.slice(-7);
    if (recent7.length >= 3) {
      const n = recent7.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;
      recent7.forEach((item, idx) => {
        sumX += idx;
        sumY += item.burden;
        sumXY += idx * item.burden;
        sumX2 += idx * idx;
      });
      const denom = (n * sumX2 - sumX * sumX);
      if (denom !== 0) {
        slope = (n * sumXY - sumX * sumY) / denom;
      }
    }

    // Persistence: consecutive valid days above z_mild
    let consecutiveCount = 0;
    for (let i = validHistory.length - 1; i >= 0; i--) {
      const histZ = (validHistory[i].burden - baselineStats.mean) / stdEffective;
      if (histZ >= config.Z_MILD) {
        consecutiveCount++;
      } else {
        break;
      }
    }
    if (D >= config.Z_MILD) {
      consecutiveCount++;
    }
    persist = consecutiveCount;

    // 5. Multi-feature fusion: g = 0.55*D + 1.65*slope + 0.85*persist - todAdj
    const todAdj = 0; // standard midday
    g = config.W_D * D + config.W_SLOPE * slope + config.W_PERSIST * persist - todAdj;
  }

  // Update baseline with today's valid session
  const newBaseline = updateWelford(currentBaseline, todayBurden);

  // 6. Final Status Decision
  let finalStatus: PatternStatus = 'Stable';
  let explanation = '';

  if (baselineStatus !== 'Established') {
    // If no baseline established, default to Stable (unless step 2 acute override caught it)
    finalStatus = 'Stable';
    explanation = `Baseline is ${baselineStatus} (${nValid}/14 valid days). Longitudinal thresholds require 14 valid days. Classified as Stable based on standard screening.`;
  } else {
    if (g >= config.ETA_HIGH) {
      finalStatus = 'ElevatedPattern';
      explanation = `Fused longitudinal score g=${g.toFixed(2)} exceeds high threshold (${config.ETA_HIGH}). Significant upward deviation from established personal baseline.`;
    } else if (g >= config.ETA_LOW) {
      finalStatus = 'EarlyWatch';
      explanation = `Fused longitudinal score g=${g.toFixed(2)} exceeds early watch threshold (${config.ETA_LOW}). Mild upward deviation from personal baseline noted.`;
    } else {
      finalStatus = 'Stable';
      explanation = `Fused score g=${g.toFixed(2)} is within expected baseline bounds (< ${config.ETA_LOW}). Acoustic pattern is consistent with personal baseline.`;
    }
  }

  return {
    status: finalStatus,
    updatedBaseline: newBaseline,
    trace: {
      A,
      conf,
      D,
      slope,
      persist,
      g,
      baselineStatus,
      nValid: nValid + 1,
      acuteOverride: false,
      explanation,
    },
  };
}

/**
 * Generates 30 days of synthetic demo history as required by specification:
 * - Days 1-21: Stable breathing, slight normal acoustic variations
 * - Day 14: Baseline becomes Established
 * - Days 22-30: Rising wheeze burden trend
 * - Two censored days (e.g. Day 10, Day 18)
 * - One missing day (e.g. Day 5)
 */
export function generateDemoHistory(): HistoricalSessionSummary[] {
  const history: HistoricalSessionSummary[] = [];
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (let day = 0; day < 30; day++) {
    // Missing day: skip day 5
    if (day === 5) continue;

    const timestamp = new Date(now - (30 - day) * DAY_MS).toISOString();
    const isCensored = day === 10 || day === 18;

    let burden = 0.02 + (Math.sin(day * 0.5) * 0.015);
    let acousticClass: AcousticClass = 'Normal';
    let conf = 0.90 + Math.random() * 0.06;

    // Rising wheeze trend starting at day 22
    if (day >= 22) {
      const trendProgress = (day - 22) / 8; // 0 to 1
      burden = 0.10 + trendProgress * 0.42;
      acousticClass = 'Wheeze';
      conf = 0.82 + trendProgress * 0.12;
    }

    history.push({
      id: `demo-day-${day}`,
      dayIndex: day,
      timestamp,
      quality: isCensored ? 0 : 1,
      isCensored,
      burden: Math.max(0, Math.min(1, burden)),
      class: acousticClass,
      conf,
    });
  }

  return history;
}
