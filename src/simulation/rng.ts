export interface DeterministicRng {
  next: () => number;
  range: (min: number, max: number) => number;
  gaussian: (mean?: number, std?: number) => number;
  studentT: (df: number, loc?: number, scale?: number) => number;
}

export function createRng(seed: number): DeterministicRng {
  let state = (seed >>> 0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => {
    return min + (max - min) * next();
  };

  const gaussian = (mean = 0, std = 1): number => {
    const u1 = Math.max(1e-12, next());
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  };

  const studentT = (df: number, loc = 0, scale = 1): number => {
    const z = gaussian(0, 1);
    const k = Math.max(1, Math.round(df));
    let chi2 = 0;
    for (let i = 0; i < k; i++) {
      const g = gaussian(0, 1);
      chi2 += g * g;
    }
    const tVal = z / Math.sqrt(Math.max(1e-12, chi2 / k));
    return loc + scale * tVal;
  };

  return { next, range, gaussian, studentT };
}
