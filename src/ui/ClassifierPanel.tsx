import React from 'react';
import { motion } from 'framer-motion';
import { ClassifierOutput, QualityState, WindowAnalysis } from '../types/pulmoscan';
import { getDominantClass } from '../features/pipeline';
import { AnimatedNumber } from './shared';

interface ClassifierPanelProps {
  classifier: ClassifierOutput;
  windows: WindowAnalysis[];
}

export const ClassifierPanel: React.FC<ClassifierPanelProps> = ({
  classifier,
  windows,
}) => {
  const dominant = getDominantClass(classifier);

  const classes: Array<{
    key: 'Normal' | 'Wheeze' | 'Crackle';
    prob: number;
    color: string;
    trackColor: string;
  }> = [
    {
      key: 'Normal',
      prob: classifier.normal,
      color: '#34D399',
      trackColor: 'rgba(52, 211, 153, 0.14)',
    },
    {
      key: 'Wheeze',
      prob: classifier.wheeze,
      color: '#FBBF24',
      trackColor: 'rgba(251, 191, 36, 0.14)',
    },
    {
      key: 'Crackle',
      prob: classifier.crackle,
      color: '#FB7185',
      trackColor: 'rgba(251, 113, 133, 0.14)',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[#E8F3F1]">
            3. CNN Classification
          </h2>
          <p className="text-xs text-[#8AA3A0] mt-0.5">
            Demo version. Final model runs on the phone.
          </p>
        </div>
        <div className="font-mono text-xs text-[#2DD4BF]">
          Based on {classifier.validWindowCount} of {classifier.totalWindowCount}{' '}
          good clips
        </div>
      </div>

      {/* Three animated gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {classes.map((item) => {
          const isDominant = dominant === item.key;
          const pct = item.prob * 100;
          const radius = 34;
          const circ = 2 * Math.PI * radius;
          const dashOffset = circ * (1 - Math.max(0, Math.min(1, item.prob)));

          return (
            <div
              key={item.key}
              className={`clinical-glass rounded-2xl p-4 flex items-center gap-4 transition-all ${
                isDominant
                  ? 'border-[#2DD4BF]/50 shadow-[0_0_24px_rgba(45,212,191,0.16)]'
                  : ''
              }`}
            >
              <svg
                width="84"
                height="84"
                viewBox="0 0 84 84"
                className="shrink-0"
                aria-hidden="true"
              >
                <circle
                  cx="42"
                  cy="42"
                  r={radius}
                  fill="none"
                  stroke={item.trackColor}
                  strokeWidth="7"
                />
                <motion.circle
                  cx="42"
                  cy="42"
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  initial={{ strokeDashoffset: circ }}
                  animate={{ strokeDashoffset: dashOffset }}
                  transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                  transform="rotate(-90 42 42)"
                />
              </svg>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#E8F3F1]">
                    {item.key}
                  </span>
                  {isDominant && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#2DD4BF]/20 text-[#2DD4BF] border border-[#2DD4BF]/35">
                      TOP
                    </span>
                  )}
                </div>
                <div
                  className="text-2xl font-bold mt-1"
                  style={{ color: item.color }}
                >
                  <AnimatedNumber value={pct} decimals={1} suffix="%" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-clip stacked horizontal bars */}
      <div className="instrument-panel rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs text-[#8AA3A0]">
          <span>Per-clip breakdown</span>
          <span className="font-mono">Normal / Wheeze / Crackle</span>
        </div>

        <div className="space-y-2">
          {windows.map((w) => {
            const isValid = w.qualityState === QualityState.VALID;
            const isLost = w.qualityState === QualityState.TRANSPORT_CENSORED;
            const marker = isValid ? 'G' : isLost ? 'L' : 'B';

            return (
              <div
                key={w.index}
                className={`flex items-center gap-3 text-xs ${
                  isValid ? '' : 'opacity-55'
                }`}
              >
                <div className="w-24 shrink-0 font-mono text-[#E8F3F1] flex items-center gap-1.5">
                  <span>Clip {w.index + 1}</span>
                  <span
                    className={`px-1 rounded text-[10px] border ${
                      isValid
                        ? 'bg-[#34D399]/15 text-[#34D399] border-[#34D399]/35'
                        : isLost
                          ? 'pattern-lost text-[#CBD5E1] border-[#94A3B8]/35'
                          : 'pattern-bad text-[#FB7185] border-[#F43F5E]/40'
                    }`}
                  >
                    [{marker}]
                  </span>
                </div>

                <div
                  className={`flex-1 h-4 rounded-lg overflow-hidden flex border border-[#94E2D5]/12 ${
                    !isValid ? (isLost ? 'pattern-lost' : 'pattern-bad') : 'bg-[#08141B]'
                  }`}
                >
                  <div
                    style={{ width: `${w.normalProb * 100}%` }}
                    className="bg-[#34D399]/80 h-full transition-all duration-300"
                    title={`Normal ${(w.normalProb * 100).toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${w.wheezeProb * 100}%` }}
                    className="bg-[#FBBF24]/85 h-full transition-all duration-300"
                    title={`Wheeze ${(w.wheezeProb * 100).toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${w.crackleProb * 100}%` }}
                    className="bg-[#FB7185]/85 h-full transition-all duration-300"
                    title={`Crackle ${(w.crackleProb * 100).toFixed(1)}%`}
                  />
                </div>

                <div className="w-28 shrink-0 text-right font-mono text-[11px] text-[#8AA3A0]">
                  {isValid
                    ? `${(w.normalProb * 100).toFixed(0)} / ${(w.wheezeProb * 100).toFixed(0)} / ${(w.crackleProb * 100).toFixed(0)}%`
                    : 'not used'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
