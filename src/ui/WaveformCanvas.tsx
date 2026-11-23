import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Play, Square } from 'lucide-react';
import { BreathPhaseSpan, PresetId } from '../types/pulmoscan';

interface WaveformCanvasProps {
  title: string;
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
  breathPhases: BreathPhaseSpan[];
  melSpectrogram: number[][];
  melTimesSec: number[];
  activePreset: PresetId;
  breathsPerMin: number;
  onSelectPreset: (preset: PresetId) => void;
  onChangeBpm: (bpm: number) => void;
  onPlaybackChange?: (state: {
    isPlaying: boolean;
    timeSec: number;
    rms: number;
  }) => void;
}

function getMelColor(norm: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, norm));
  if (t < 0.35) {
    const k = t / 0.35;
    return [
      Math.round(4 + k * 6),
      Math.round(10 + k * 42),
      Math.round(16 + k * 56),
    ];
  }
  if (t < 0.72) {
    const k = (t - 0.35) / 0.37;
    return [
      Math.round(10 + k * 35),
      Math.round(52 + k * 160),
      Math.round(72 + k * 119),
    ];
  }
  const k = (t - 0.72) / 0.28;
  return [
    Math.round(45 + k * 200),
    Math.round(212 + k * 40),
    Math.round(191 + k * 60),
  ];
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  title,
  samples,
  sampleRate,
  durationSec,
  breathPhases,
  melSpectrogram,
  melTimesSec,
  activePreset,
  breathsPerMin,
  onSelectPreset,
  onChangeBpm,
  onPlaybackChange,
}) => {
  const prefersReduced = useReducedMotion();
  const [viewMode, setViewMode] = useState<'wave' | 'mel'>('wave');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [revealProgress, setRevealProgress] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartCtxTimeRef = useRef(0);
  const playOffsetRef = useRef(0);
  const rafRef = useRef<number>(0);

  const stopPlayback = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      } catch {
        // ignore stop errors
      }
      sourceRef.current = null;
    }
    setIsPlaying(false);
    onPlaybackChange?.({ isPlaying: false, timeSec: playheadSec, rms: 0 });
  };

  useEffect(() => {
    stopPlayback();
    setPlayheadSec(0);
    playOffsetRef.current = 0;
    if (prefersReduced) {
      setRevealProgress(1);
      return;
    }
    setRevealProgress(0.05);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 420);
      setRevealProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, prefersReduced]);

  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => undefined);
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computeInstantRms = (timeSec: number): number => {
    const center = Math.floor(timeSec * sampleRate);
    const half = 400;
    const start = Math.max(0, center - half);
    const end = Math.min(samples.length, center + half);
    if (end <= start) return 0;
    let sq = 0;
    for (let i = start; i < end; i++) sq += samples[i] * samples[i];
    return Math.sqrt(sq / (end - start));
  };

  const togglePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx({ sampleRate });
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startOffset =
      playheadSec >= durationSec - 0.05 ? 0 : Math.max(0, playheadSec);
    playOffsetRef.current = startOffset;
    playStartCtxTimeRef.current = ctx.currentTime;

    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null;
        setIsPlaying(false);
        setPlayheadSec(0);
        onPlaybackChange?.({ isPlaying: false, timeSec: 0, rms: 0 });
      }
    };

    sourceRef.current = src;
    setIsPlaying(true);
    src.start(0, startOffset);

    const tick = () => {
      if (!sourceRef.current || !audioCtxRef.current) return;
      const elapsed =
        audioCtxRef.current.currentTime - playStartCtxTimeRef.current;
      const cur = Math.min(durationSec, playOffsetRef.current + elapsed);
      setPlayheadSec(cur);
      onPlaybackChange?.({
        isPlaying: true,
        timeSec: cur,
        rms: computeInstantRms(cur),
      });
      if (cur < durationSec) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleScrub = (nextSec: number) => {
    setPlayheadSec(nextSec);
    playOffsetRef.current = nextSec;
    if (isPlaying) {
      stopPlayback();
    } else {
      onPlaybackChange?.({ isPlaying: false, timeSec: nextSec, rms: 0 });
    }
  };

  // Precompute min/max bins per mel spectrogram
  const melStats = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const row of melSpectrogram) {
      for (const v of row) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min) || max <= min) {
      return { min: -8, max: 0 };
    }
    return { min, max };
  }, [melSpectrogram]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 720;
    const height = canvas.clientHeight || 220;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 38;
    const padR = 12;
    const padT = 14;
    const padB = 26;
    const plotW = Math.max(10, width - padL - padR);
    const plotH = Math.max(10, height - padT - padB);

    // Background fill
    ctx.fillStyle = '#040A0E';
    ctx.fillRect(0, 0, width, height);

    // Shaded inhale/exhale bands
    if (viewMode === 'wave') {
      for (const span of breathPhases) {
        const x1 = padL + (span.startSec / Math.max(0.1, durationSec)) * plotW;
        const x2 = padL + (span.endSec / Math.max(0.1, durationSec)) * plotW;
        ctx.fillStyle =
          span.phase === 'inhale'
            ? 'rgba(45, 212, 191, 0.08)'
            : 'rgba(139, 92, 246, 0.07)';
        ctx.fillRect(x1, padT, Math.max(1, x2 - x1), plotH);
      }
    }

    // Faint grid
    ctx.strokeStyle = 'rgba(148, 226, 213, 0.08)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = padT + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    if (viewMode === 'wave') {
      // Y-axis labels (-1.0 to 1.0)
      ctx.fillStyle = '#8AA3A0';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('1.0', padL - 6, padT + 4);
      ctx.fillText('0.0', padL - 6, padT + plotH / 2);
      ctx.fillText('-1.0', padL - 6, padT + plotH - 4);

      // Draw waveform envelope
      const drawCols = Math.floor(plotW * revealProgress);
      const midY = padT + plotH / 2;
      const ampH = plotH * 0.46;

      ctx.save();
      ctx.strokeStyle = '#5EEAD4';
      ctx.lineWidth = 1.25;
      ctx.shadowColor = 'rgba(45, 212, 191, 0.55)';
      ctx.shadowBlur = 6;
      ctx.beginPath();

      for (let x = 0; x < drawCols; x++) {
        const s0 = Math.floor((x / plotW) * samples.length);
        const s1 = Math.min(
          samples.length,
          Math.floor(((x + 1) / plotW) * samples.length) + 1,
        );
        let minV = 0;
        let maxV = 0;
        for (let i = s0; i < s1; i++) {
          const v = samples[i];
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        const px = padL + x;
        const yTop = midY - maxV * ampH;
        const yBot = midY - minV * ampH;
        ctx.moveTo(px, yTop);
        ctx.lineTo(px, Math.max(yTop + 0.8, yBot));
      }
      ctx.stroke();
      ctx.restore();
    } else {
      // 64-band log-mel spectrogram
      ctx.fillStyle = '#8AA3A0';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('8kHz', padL - 6, padT + 6);
      ctx.fillText('4k', padL - 6, padT + plotH / 2);
      ctx.fillText('50Hz', padL - 6, padT + plotH - 6);

      const cols = melSpectrogram.length;
      const revealCols = Math.max(1, Math.floor(cols * revealProgress));
      const bands = melSpectrogram[0]?.length || 64;
      const colW = plotW / Math.max(1, cols);
      const bandH = plotH / Math.max(1, bands);
      const range = Math.max(0.5, melStats.max - melStats.min);

      for (let c = 0; c < revealCols; c++) {
        const row = melSpectrogram[c];
        const x = padL + c * colW;
        for (let b = 0; b < bands; b++) {
          const norm = (row[b] - melStats.min) / range;
          const [r, g, bl] = getMelColor(norm);
          ctx.fillStyle = `rgb(${r},${g},${bl})`;
          const y = padT + plotH - (b + 1) * bandH;
          ctx.fillRect(x, y, Math.ceil(colW), Math.ceil(bandH));
        }
      }
    }

    // X-axis time ticks (0.0s ... durationSec)
    ctx.fillStyle = '#8AA3A0';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tickCount = 6;
    for (let t = 0; t <= tickCount; t++) {
      const frac = t / tickCount;
      const sec = frac * durationSec;
      const x = padL + frac * plotW;
      ctx.fillText(`${sec.toFixed(1)}s`, x, padT + plotH + 6);
    }

    // Glowing coral playhead
    const phFrac = Math.max(0, Math.min(1, playheadSec / Math.max(0.1, durationSec)));
    const phX = padL + phFrac * plotW;
    ctx.save();
    ctx.strokeStyle = '#FB7185';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(251, 113, 133, 0.85)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(phX, padT);
    ctx.lineTo(phX, padT + plotH);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, [
    breathPhases,
    durationSec,
    melSpectrogram,
    melStats,
    melTimesSec,
    playheadSec,
    revealProgress,
    samples,
    viewMode,
  ]);

  const patternSelectValue =
    activePreset === 'wheeze' ||
    activePreset === 'crackle' ||
    activePreset === 'noisy'
      ? activePreset
      : 'normal';

  return (
    <div className="instrument-panel rounded-2xl p-4 space-y-3">
      {/* Top control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
            <span>Pattern</span>
            <select
              value={patternSelectValue}
              onChange={(e) => onSelectPreset(e.target.value as PresetId)}
              className="px-2.5 py-1.5 rounded-xl bg-[#08141B] border border-[#94E2D5]/20 text-xs text-[#E8F3F1] min-h-[36px]"
            >
              <option value="normal">Normal</option>
              <option value="wheeze">Wheeze</option>
              <option value="crackle">Crackle</option>
              <option value="noisy">Noisy</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
            <span>Breaths / min</span>
            <input
              type="range"
              min={10}
              max={28}
              step={1}
              value={breathsPerMin}
              onChange={(e) => onChangeBpm(Number(e.target.value))}
              className="w-24 sm:w-28"
            />
            <span className="font-mono text-xs text-[#2DD4BF] min-w-[46px]">
              {breathsPerMin}/min
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-0.5 rounded-xl bg-[#08141B] border border-[#94E2D5]/15">
            <button
              type="button"
              onClick={() => setViewMode('wave')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors min-h-[32px] ${
                viewMode === 'wave'
                  ? 'bg-[#2DD4BF]/20 text-[#2DD4BF] border border-[#2DD4BF]/35'
                  : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
              }`}
            >
              Sound wave
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mel')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors min-h-[32px] ${
                viewMode === 'mel'
                  ? 'bg-[#2DD4BF]/20 text-[#2DD4BF] border border-[#2DD4BF]/35'
                  : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
              }`}
            >
              Sound map
            </button>
          </div>

          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] transition-colors min-h-[36px]"
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Play</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Title & Meta */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-[#E8F3F1]">{title}</span>
        <span className="font-mono text-[#8AA3A0]">
          {durationSec.toFixed(1)} seconds · Standard sound quality
        </span>
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-[#94E2D5]/12">
        <canvas
          ref={canvasRef}
          className="w-full h-[210px] block"
          aria-label={
            viewMode === 'wave'
              ? `Breathing sound waveform for ${title}`
              : `64-band log-mel spectrogram for ${title}`
          }
        />
      </div>

      {/* Legend & Scrub */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#8AA3A0]">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm bg-[#2DD4BF]/35 border border-[#2DD4BF]/60"
              aria-hidden="true"
            />
            <span>Inhale</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm bg-[#8B5CF6]/35 border border-[#8B5CF6]/60"
              aria-hidden="true"
            />
            <span>Exhale</span>
          </span>
          <span className="font-mono text-[#E8F3F1]">
            {playheadSec.toFixed(2)}s
          </span>
        </div>

        <label className="inline-flex items-center gap-2 flex-1 max-w-xs justify-end">
          <span>Scrub</span>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, durationSec)}
            step={0.05}
            value={playheadSec}
            onChange={(e) => handleScrub(Number(e.target.value))}
            className="flex-1 min-w-[100px]"
          />
        </label>
      </div>
    </div>
  );
};
