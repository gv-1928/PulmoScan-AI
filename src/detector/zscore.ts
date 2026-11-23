function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function stepZScoreDetector(params: {
  prevZ: number;
  observation: number | null;
  censoredType: 'none' | 'transport' | 'acquisition';
  personalMean: number;
  personalScale: number;
}): number {
  const { prevZ, observation, censoredType, personalMean, personalScale } =
    params;

  if (censoredType === 'transport' || observation === null) {
    return prevZ * 0.85;
  }

  let z = (observation - personalMean) / Math.max(0.08, personalScale);
  if (censoredType === 'acquisition') {
    z = Math.max(z, 1.35);
  }
  return clamp(0.55 * prevZ + 0.45 * z, -2, 8);
}
