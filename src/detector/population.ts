function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function stepPopulationDetector(params: {
  observation: number | null;
  censoredType: 'none' | 'transport' | 'acquisition';
}): number {
  const { observation, censoredType } = params;
  const popMean = 0.42;
  const popStd = 0.22;

  if (censoredType === 'transport' || observation === null) {
    return 0;
  }

  const adjusted =
    censoredType === 'acquisition' ? observation + 0.45 : observation;
  return clamp((adjusted - popMean) / popStd, -1.5, 8);
}
