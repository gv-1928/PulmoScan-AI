import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, WifiOff } from 'lucide-react';
import { QualityState, WindowAnalysis } from '../types/pulmoscan';
import { getQualityWord } from './shared';

interface QualityTimelineProps {
  windows: WindowAnalysis[];
}

export const QualityTimeline: React.FC<QualityTimelineProps> = ({
  windows,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  useEffect(() => {
    if (windows.length === 0) return;
    const firstNonGood = windows.find(
      (w) => w.qualityState !== QualityState.VALID,
    );
    if (firstNonGood) {
      setSelectedIndex(firstNonGood.index);
    } else {
      setSelectedIndex(windows.length >= 5 ? 4 : 0);
    }
  }, [windows]);

  let goodCount = 0;
  let lostCount = 0;
  let badCount = 0;
  for (const w of windows) {
    if (w.qualityState === QualityState.VALID) goodCount++;
    else if (w.qualityState === QualityState.TRANSPORT_CENSORED) lostCount++;
    else badCount++;
  }

  const selected =
    windows.find((w) => w.index === selectedIndex) ?? windows[0] ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#E8F3F1]">
          2. Quality Checking
        </h2>
        <p className="text-sm text-[#8AA3A0] mt-0.5">
          Checks audio clarity, noise and packet loss across 3-second clips.
        </p>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#34D399]/12 border border-[#34D399]/30 text-[#34D399]">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Good: {goodCount}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#94A3B8]/12 border border-[#94A3B8]/30 text-[#94A3B8]">
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Lost while sending [L]: {lostCount}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185]">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Bad recording [B]: {badCount}</span>
        </span>
      </div>

      {/* Legend card */}
      <div className="clinical-glass rounded-xl p-3 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono px-1.5 py-0.5 rounded bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/40">
            [G]
          </span>
          <span className="text-[#E8F3F1]">Good (used for your score)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono px-1.5 py-0.5 rounded pattern-lost text-[#CBD5E1] border border-[#94A3B8]/40">
            [L]
          </span>
          <span className="text-[#8AA3A0]">
            Lost while sending (Bluetooth drop, safely ignored)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono px-1.5 py-0.5 rounded pattern-bad text-[#FB7185] border border-[#F43F5E]/40">
            [B]
          </span>
          <span className="text-[#8AA3A0]">
            Bad recording (noise, clipping, or loose contact)
          </span>
        </div>
      </div>

      {/* Clip chips */}
      <div className="flex flex-wrap gap-2">
        {windows.map((w, idx) => {
          const isSelected = selected?.index === w.index;
          const isValid = w.qualityState === QualityState.VALID;
          const isLost = w.qualityState === QualityState.TRANSPORT_CENSORED;
          const tag = isValid ? 'G' : isLost ? 'L' : 'B';
          const word = getQualityWord(w.qualityState);

          return (
            <motion.button
              key={w.index}
              type="button"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{
                opacity: 1,
                scale: isSelected ? [1, 1.04, 1] : 1,
              }}
              transition={{ delay: Math.min(0.2, idx * 0.02), duration: 0.2 }}
              onClick={() => setSelectedIndex(w.index)}
              aria-pressed={isSelected}
              className={`px-3 py-2 rounded-xl border text-left transition-all min-h-[44px] ${
                isValid
                  ? 'bg-[#34D399]/10 border-[#34D399]/30 text-[#E8F3F1]'
                  : isLost
                    ? 'pattern-lost border-[#94A3B8]/35 text-[#CBD5E1]'
                    : 'pattern-bad border-[#F43F5E]/40 text-[#FECDD3]'
              } ${
                isSelected
                  ? 'ring-2 ring-[#2DD4BF] shadow-[0_0_16px_rgba(45,212,191,0.3)]'
                  : 'hover:border-[#2DD4BF]/50'
              }`}
            >
              <div className="font-mono text-xs font-semibold">
                Clip {w.index + 1} [{tag}]
              </div>
              <div className="font-mono text-[11px] opacity-80">
                {word} · {w.startSec.toFixed(1)}-{w.endSec.toFixed(1)}s
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected clip detail panel */}
      {selected && (
        <div className="instrument-panel rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-sm font-semibold text-[#E8F3F1]">
              Clip #{selected.index + 1} ({selected.startSec.toFixed(1)}-
              {selected.endSec.toFixed(1)}s)
            </div>
            <div className="font-mono text-xs text-[#2DD4BF]">
              {selected.reason}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="bg-[#08141B] rounded-xl p-2.5 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0]">Lost Data %</div>
              <div className="font-mono text-sm font-semibold text-[#E8F3F1] mt-0.5">
                {selected.lossPct.toFixed(1)}%
              </div>
            </div>
            <div className="bg-[#08141B] rounded-xl p-2.5 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0]">Longest gap</div>
              <div className="font-mono text-sm font-semibold text-[#E8F3F1] mt-0.5">
                {selected.maxGapMs.toFixed(1)} ms
              </div>
            </div>
            <div className="bg-[#08141B] rounded-xl p-2.5 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0]">Noise floor</div>
              <div className="font-mono text-sm font-semibold text-[#E8F3F1] mt-0.5">
                {selected.noiseFloorDb.toFixed(1)} dB
              </div>
            </div>
            <div className="bg-[#08141B] rounded-xl p-2.5 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0]">Clip %</div>
              <div className="font-mono text-sm font-semibold text-[#E8F3F1] mt-0.5">
                {selected.clipPct.toFixed(2)}%
              </div>
            </div>
            <div className="bg-[#08141B] rounded-xl p-2.5 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0]">Contact score</div>
              <div className="font-mono text-sm font-semibold text-[#2DD4BF] mt-0.5">
                {(selected.contactScore * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-[#08141B] rounded-xl p-2.5 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0]">RMS</div>
              <div className="font-mono text-sm font-semibold text-[#E8F3F1] mt-0.5">
                {selected.rms.toFixed(4)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-mono text-[#8AA3A0]">
            <span>
              Normal:{' '}
              <strong className="text-[#34D399]">
                {(selected.normalProb * 100).toFixed(1)}%
              </strong>
            </span>
            <span>
              Wheeze:{' '}
              <strong className="text-[#FBBF24]">
                {(selected.wheezeProb * 100).toFixed(1)}%
              </strong>
            </span>
            <span>
              Crackle:{' '}
              <strong className="text-[#FB7185]">
                {(selected.crackleProb * 100).toFixed(1)}%
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
