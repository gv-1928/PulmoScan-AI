import React, { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Wind,
  Volume2,
  Maximize2,
  Sparkles,
} from 'lucide-react';

export type RespiratoryPatternType = 'Normal' | 'Wheeze' | 'Crackle' | 'Tachypnea';

interface RespiratoryWaveformVisualizerProps {
  externalPattern?: 'Normal' | 'Wheeze' | 'Crackle' | 'Noisy';
  onPatternChange?: (pattern: RespiratoryPatternType) => void;
  compact?: boolean;
}

interface WaveformPoint {
  timeSec: number;
  timeLabel: string;
  flow: number; // L/s: Positive = Insp, Negative = Exp
  volume: number; // mL (Tidal volume)
  acousticEnergy: number; // 0..1 Normalized
  phase: 'Insp' | 'Exp' | 'Pause';
}

export const RespiratoryWaveformVisualizer: React.FC<RespiratoryWaveformVisualizerProps> = ({
  externalPattern = 'Normal',
  onPatternChange,
  compact = false,
}) => {
  const [pattern, setPattern] = useState<RespiratoryPatternType>(() => {
    if (externalPattern === 'Wheeze') return 'Wheeze';
    if (externalPattern === 'Crackle') return 'Crackle';
    return 'Normal';
  });

  const [isLive, setIsLive] = useState<boolean>(true);
  const [bpm, setBpm] = useState<number>(14);
  const [activePhase, setActivePhase] = useState<'Inspiration' | 'Expiration' | 'Pause'>('Inspiration');
  const [currentFlow, setCurrentFlow] = useState<number>(0);
  const [currentVolume, setCurrentVolume] = useState<number>(0);
  const [currentEnergy, setCurrentEnergy] = useState<number>(0);
  const [showSecondaryMetrics, setShowSecondaryMetrics] = useState<boolean>(true);

  // Sync with external pattern changes (e.g. from generated demo clips)
  useEffect(() => {
    if (externalPattern === 'Wheeze') {
      setPattern('Wheeze');
      setBpm(16);
    } else if (externalPattern === 'Crackle') {
      setPattern('Crackle');
      setBpm(17);
    } else if (externalPattern === 'Noisy') {
      setPattern('Tachypnea');
      setBpm(26);
    } else {
      setPattern('Normal');
      setBpm(14);
    }
  }, [externalPattern]);

  // Buffer of points for the rolling display window (e.g. 100 points, 10 seconds)
  const windowDurationSec = 8.0;
  const sampleRateHz = 20; // 20 data points per second
  const maxPoints = Math.round(windowDurationSec * sampleRateHz); // 160 points

  const [dataPoints, setDataPoints] = useState<WaveformPoint[]>(() => {
    const pts: WaveformPoint[] = [];
    for (let i = 0; i < maxPoints; i++) {
      const t = (i / sampleRateHz);
      pts.push({
        timeSec: Math.round(t * 10) / 10,
        timeLabel: `${t.toFixed(1)}s`,
        flow: 0,
        volume: 0,
        acousticEnergy: 0.05,
        phase: 'Pause',
      });
    }
    return pts;
  });

  const timeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(performance.now());

  // Mathematical respiratory wave generation function
  const computeSample = (t: number, selectedPattern: RespiratoryPatternType, currentBpm: number) => {
    const cycleDurationSec = 60 / currentBpm; // e.g. 14 bpm -> ~4.28s
    const tInCycle = t % cycleDurationSec;
    const progress = tInCycle / cycleDurationSec;

    // Standard I:E ratio ~ 1:2 (Insp: 33%, Exp: 55%, Pause: 12%)
    const inspFraction = selectedPattern === 'Wheeze' ? 0.30 : 0.35;
    const expFraction = selectedPattern === 'Wheeze' ? 0.60 : 0.52; // Wheeze has prolonged expiration
    const pauseFraction = 1.0 - (inspFraction + expFraction);

    let flow = 0; // L/s
    let volume = 0; // mL
    let acousticEnergy = 0.04;
    let phase: 'Insp' | 'Exp' | 'Pause' = 'Pause';

    if (progress < inspFraction) {
      // INSPIRATION (Positive flow limb)
      phase = 'Insp';
      const inspProgress = progress / inspFraction; // 0..1
      // Smooth sinusoidal inhalation peak
      const baseFlow = Math.sin(inspProgress * Math.PI) * 0.75;
      flow = baseFlow;
      volume = Math.round(baseFlow * 450 * inspProgress);
      acousticEnergy = 0.15 + baseFlow * 0.25;

      if (selectedPattern === 'Crackle') {
        // Discontinuous click spikes during mid-to-late inspiration (inspProgress between 0.4 and 0.9)
        if (inspProgress > 0.35 && inspProgress < 0.95) {
          const crackleJitter = Math.sin(t * 85);
          if (Math.abs(crackleJitter) > 0.92) {
            flow += (Math.random() - 0.5) * 0.38;
            acousticEnergy += 0.55;
          }
        }
      }
    } else if (progress < inspFraction + expFraction) {
      // EXPIRATION (Negative flow limb)
      phase = 'Exp';
      const expProgress = (progress - inspFraction) / expFraction; // 0..1
      // Asymmetric expiration: fast passive recoil then tapering tail
      const baseFlow = -Math.sin(Math.pow(expProgress, 0.7) * Math.PI) * 0.62;
      flow = baseFlow;
      volume = Math.max(0, Math.round(500 * (1 - expProgress)));
      acousticEnergy = 0.12 + Math.abs(baseFlow) * 0.3;

      if (selectedPattern === 'Wheeze') {
        // Sustained musical frequency oscillation rippling over expiratory flow
        const wheezeRipple = Math.sin(t * 32) * 0.14 * Math.sin(expProgress * Math.PI);
        flow += wheezeRipple;
        acousticEnergy = 0.45 + Math.abs(wheezeRipple) * 2.8;
      }
    } else {
      // END-EXPIRATORY PAUSE
      phase = 'Pause';
      flow = 0;
      volume = 0;
      acousticEnergy = 0.03;
    }

    if (selectedPattern === 'Tachypnea') {
      // Rapid shallow with slightly irregular amplitude
      flow *= 1.15;
      acousticEnergy *= 1.25;
    }

    return {
      flow: Math.round(flow * 100) / 100,
      volume: Math.max(0, volume),
      acousticEnergy: Math.min(1.0, Math.round(acousticEnergy * 100) / 100),
      phase,
    };
  };

  // Real-time animation loop
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      timeRef.current += 1 / sampleRateHz;
      const t = timeRef.current;

      const sample = computeSample(t, pattern, bpm);
      const newPoint: WaveformPoint = {
        timeSec: Math.round(t * 10) / 10,
        timeLabel: `${(t % 60).toFixed(1)}s`,
        flow: sample.flow,
        volume: sample.volume,
        acousticEnergy: sample.acousticEnergy,
        phase: sample.phase,
      };

      setCurrentFlow(sample.flow);
      setCurrentVolume(sample.volume);
      setCurrentEnergy(sample.acousticEnergy);
      setActivePhase(
        sample.phase === 'Insp'
          ? 'Inspiration'
          : sample.phase === 'Exp'
          ? 'Expiration'
          : 'Pause'
      );

      setDataPoints((prev) => {
        const next = [...prev.slice(1), newPoint];
        return next;
      });
    }, 1000 / sampleRateHz);

    return () => clearInterval(interval);
  }, [isLive, pattern, bpm]);

  const handleSelectPattern = (newPattern: RespiratoryPatternType) => {
    setPattern(newPattern);
    if (newPattern === 'Normal') setBpm(14);
    if (newPattern === 'Wheeze') setBpm(16);
    if (newPattern === 'Crackle') setBpm(18);
    if (newPattern === 'Tachypnea') setBpm(28);
    if (onPatternChange) onPatternChange(newPattern);
  };

  return (
    <div className="bg-slate-950 text-slate-100 rounded-3xl p-5 border border-slate-800 shadow-xl space-y-4">
      {/* Top Header: Monitor Identity & Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                Real-Time Respiratory Waveform
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30 font-semibold">
                Recharts Monitor
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Simulated airflow dynamics, tidal excursion, and acoustic tremor signatures
            </p>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
              isLive
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
            }`}
          >
            {isLive ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Live Active</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Frozen</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowSecondaryMetrics(!showSecondaryMetrics)}
            className={`text-xs px-2.5 py-1.5 rounded-xl border transition ${
              showSecondaryMetrics
                ? 'bg-slate-800 text-teal-300 border-slate-700'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle Acoustic Energy & Tidal Volume Curves"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Numeric Biometric Readouts Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Metric 1: Current Airflow */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800/90 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
            Airflow Rate
          </span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-mono font-extrabold ${
                currentFlow > 0.05
                  ? 'text-teal-400'
                  : currentFlow < -0.05
                  ? 'text-sky-400'
                  : 'text-slate-400'
              }`}
            >
              {currentFlow > 0 ? `+${currentFlow.toFixed(2)}` : currentFlow.toFixed(2)}
            </span>
            <span className="text-[10px] font-mono text-slate-400">L/s</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {activePhase === 'Inspiration'
              ? 'Inspiratory inflow'
              : activePhase === 'Expiration'
              ? 'Expiratory recoil'
              : 'End-exp pause'}
          </span>
        </div>

        {/* Metric 2: Respiratory Phase Pill */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800/90 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
            Breath Phase
          </span>
          <div className="flex items-center gap-1.5 pt-0.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                activePhase === 'Inspiration'
                  ? 'bg-teal-400 animate-pulse'
                  : activePhase === 'Expiration'
                  ? 'bg-amber-400'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-sm font-bold font-mono text-white uppercase tracking-tight">
              {activePhase}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            I:E Ratio: {pattern === 'Wheeze' ? '1:2.8' : '1:2.0'}
          </span>
        </div>

        {/* Metric 3: Target Rate */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800/90 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
            Frequency Rate
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-extrabold text-emerald-400">{bpm}</span>
            <span className="text-[10px] font-mono text-slate-400">bpm</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Period: {(60 / bpm).toFixed(1)}s</span>
        </div>

        {/* Metric 4: Acoustic Burden / Energy */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800/90 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
            Acoustic Envelope
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xl font-mono font-extrabold ${
                currentEnergy > 0.4 ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              {(currentEnergy * 100).toFixed(0)}%
            </span>
            <span className="text-[10px] font-mono text-slate-400">rms</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {pattern === 'Wheeze'
              ? 'Musical ripple'
              : pattern === 'Crackle'
              ? 'Click bursts'
              : 'Vesicular baseline'}
          </span>
        </div>
      </div>

      {/* Main Recharts Waveform Chart */}
      <div className="bg-slate-900/70 rounded-2xl p-3 border border-slate-800 relative overflow-hidden">
        {/* Oscilloscope Grid background */}
        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataPoints} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
              <defs>
                {/* Gradient for Inspiratory positive airflow */}
                <linearGradient id="flowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0.05} />
                </linearGradient>

                {/* Gradient for Acoustic Energy Overlay */}
                <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="2 2" stroke="#1e293b" vertical={false} />

              <XAxis
                dataKey="timeLabel"
                tick={{ fontSize: 9, fill: '#64748b' }}
                stroke="#334155"
                interval={Math.round(sampleRateHz * 1.5)}
              />
              <YAxis
                domain={[-0.85, 0.95]}
                tick={{ fontSize: 9, fill: '#64748b' }}
                stroke="#334155"
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d: WaveformPoint = payload[0].payload;
                    return (
                      <div className="bg-slate-950/95 border border-slate-700 text-white text-[11px] p-2.5 rounded-xl shadow-2xl font-mono space-y-1">
                        <div className="font-bold text-teal-400">
                          Timeline: {d.timeSec.toFixed(1)}s ({d.phase})
                        </div>
                        <div className="text-slate-200">
                          Airflow:{' '}
                          <strong className={d.flow >= 0 ? 'text-teal-300' : 'text-sky-300'}>
                            {d.flow > 0 ? `+${d.flow}` : d.flow} L/s
                          </strong>
                        </div>
                        <div className="text-slate-300">
                          Tidal Vol: <strong className="text-emerald-400">{d.volume} mL</strong>
                        </div>
                        <div className="text-slate-300">
                          Acoustic Energy:{' '}
                          <strong className="text-amber-400">
                            {(d.acousticEnergy * 100).toFixed(0)}%
                          </strong>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Baseline zero reference line */}
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />

              {/* Secondary Metric: Acoustic Energy Area */}
              {showSecondaryMetrics && (
                <Area
                  type="monotone"
                  dataKey="acousticEnergy"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  fill="url(#energyGradient)"
                  isAnimationActive={false}
                  name="Acoustic Energy"
                />
              )}

              {/* Primary Airflow Waveform Area */}
              <Area
                type="monotone"
                dataKey="flow"
                stroke="#14b8a6"
                strokeWidth={2.5}
                fill="url(#flowGradient)"
                isAnimationActive={false}
                name="Respiratory Flow"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Oscilloscope Legend */}
        <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-800/80 font-mono">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-teal-400 rounded-full"></span>
              Airflow (L/s) [Inspiration &gt; 0, Expiration &lt; 0]
            </span>
            {showSecondaryMetrics && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1 bg-amber-400 rounded-full"></span>
                Acoustic Tremor Envelope
              </span>
            )}
          </div>
          <span className="text-slate-500">Continuous Rolling Buffer (8.0s)</span>
        </div>
      </div>

      {/* Pattern Selection & Speed Slider */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Pattern:
          </span>
          {(['Normal', 'Wheeze', 'Crackle', 'Tachypnea'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handleSelectPattern(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                pattern === p
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Rate Controller Slider */}
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
          <Wind className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-[11px] font-mono text-slate-300">Rate:</span>
          <input
            type="range"
            min={10}
            max={34}
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            className="w-24 accent-teal-500 cursor-pointer"
          />
          <span className="text-xs font-mono font-bold text-teal-300 w-10 text-right">{bpm} bpm</span>
        </div>
      </div>
    </div>
  );
};
