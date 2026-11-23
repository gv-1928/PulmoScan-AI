import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { simulateSubject180Days } from '../simulation/longitudinalSim';
import { ScenarioId } from '../types/pulmoscan';

interface DetectorBenchmarkPanelProps {
  tempering: number;
  onChangeTempering: (val: number) => void;
}

export const DetectorBenchmarkPanel: React.FC<DetectorBenchmarkPanelProps> = ({
  tempering,
  onChangeTempering,
}) => {
  const [scenario, setScenario] = useState<ScenarioId>('strong-prodrome');
  const [seed, setSeed] = useState<number>(1);
  const [subjectId, setSubjectId] = useState<number>(1);
  const [informativeCensoring, setInformativeCensoring] = useState<boolean>(true);

  const sim = useMemo(
    () =>
      simulateSubject180Days({
        scenario,
        seed,
        subjectId,
        informativeCensoring,
        tempering,
      }),
    [informativeCensoring, scenario, seed, subjectId, tempering],
  );

  const handleReset = () => {
    setScenario('strong-prodrome');
    setSeed(1);
    setSubjectId(1);
    setInformativeCensoring(true);
    onChangeTempering(0.35);
  };

  // Scale each series by (5 / its own threshold) so every alert level reads 5.0
  const scaled = useMemo(() => {
    const hbFactor = 5 / sim.hbThreshold;
    const zFactor = 5 / sim.zThreshold;
    const popFactor = 5 / sim.popThreshold;

    let maxY = 8;
    const pts = sim.trajectory.map((pt) => {
      const hb = pt.hbQcsr * hbFactor;
      const z = pt.zScore * zFactor;
      const pop = pt.population * popFactor;
      if (hb > maxY) maxY = hb;
      return { day: pt.day, hb, z, pop };
    });

    const roundedPeak = Math.max(10, Math.ceil(maxY * 100) / 100);
    return { pts, maxY: roundedPeak };
  }, [sim]);

  const chartW = 720;
  const chartH = 260;
  const padL = 46;
  const padR = 16;
  const padT = 22;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const toX = (day: number) => padL + ((day - 1) / 179) * plotW;
  const toY = (val: number) =>
    padT + plotH - Math.max(0, Math.min(1, val / scaled.maxY)) * plotH;

  const buildPath = (key: 'hb' | 'z' | 'pop') =>
    scaled.pts
      .map(
        (p, idx) =>
          `${idx === 0 ? 'M' : 'L'}${toX(p.day).toFixed(1)},${toY(p[key]).toFixed(1)}`,
      )
      .join(' ');

  const hbPath = useMemo(() => buildPath('hb'), [scaled]);
  const zPath = useMemo(() => buildPath('z'), [scaled]);
  const popPath = useMemo(() => buildPath('pop'), [scaled]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let v = 0; v <= scaled.maxY; v += 8) {
      ticks.push(v);
    }
    if (ticks[ticks.length - 1] < scaled.maxY - 2) {
      ticks.push(Number(scaled.maxY.toFixed(2)));
    }
    return ticks;
  }, [scaled.maxY]);

  const xTicks = useMemo(() => {
    const days = [2, 8, 15, 22, 29, 36, 43, 50, 57, 64, 71, 78, 85, 92, 99, 106, 113, 120, 127, 134, 141, 148, 155, 162, 169, 176, 180];
    return days.filter((_, i) => i % 2 === 0 || i === days.length - 1);
  }, []);

  const changeX = toX(sim.changePointDay);
  const alertY = toY(5.0);

  const countPreAlerts = (key: 'hbAlert' | 'zAlert' | 'popAlert') => {
    let n = 0;
    for (const pt of sim.trajectory) {
      if (pt.day < sim.changePointDay && pt[key]) n++;
    }
    return `${n} days`;
  };

  const firstPostAlert = (key: 'hbAlert' | 'zAlert' | 'popAlert') => {
    const found = sim.trajectory.find(
      (pt) => pt.day >= sim.changePointDay && pt[key],
    );
    return found ? `Day ${found.day}` : 'None';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[#E8F3F1]">
              5. Abnormality Detection
            </h2>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#FB7185]/14 text-[#FB7185] border border-[#FB7185]/35">
              Demo data
            </span>
          </div>
          <p className="text-sm text-[#8AA3A0] mt-0.5">
            Detects unusual and persistent changes in breathing patterns over 6
            months of demo data. Alert level is scaled to 5.0.
          </p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/25 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset demo</span>
        </button>
      </div>

      {/* Controls */}
      <div className="clinical-glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
          <span>Scenario</span>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as ScenarioId)}
            className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 text-xs text-[#E8F3F1] min-h-[36px]"
          >
            <option value="strong-prodrome">Clear change</option>
            <option value="weak-prodrome">Slow change</option>
            <option value="informative-censoring">
              Bad clips rise with illness
            </option>
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
          <span>Demo run (1–5)</span>
          <select
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1] min-h-[36px]"
          >
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                Run {r}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
          <span>Demo person</span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1] min-h-[36px]"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
              <option key={id} value={id}>
                #{String(id).padStart(4, '0')}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setInformativeCensoring((v) => !v)}
          aria-pressed={informativeCensoring}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors min-h-[36px] ${
            informativeCensoring
              ? 'bg-[#2DD4BF]/18 border-[#2DD4BF]/45 text-[#2DD4BF]'
              : 'bg-[#040A0E] border-[#94E2D5]/20 text-[#8AA3A0]'
          }`}
          title="Quality Checking"
        >
          Count bad clips: {informativeCensoring ? 'On' : 'Off'}
        </button>

        <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
          <span>Bad clip weight</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tempering}
            onChange={(e) => onChangeTempering(Number(e.target.value))}
            className="w-24"
          />
          <span className="font-mono text-xs text-[#2DD4BF] min-w-[36px]">
            {tempering.toFixed(2)}
          </span>
        </label>
      </div>

      {/* Chart */}
      <div className="instrument-panel rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-mono font-semibold text-[#E8F3F1]">
            Change starts: Day {sim.changePointDay}
          </span>
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
            <span className="inline-flex items-center gap-1.5 text-[#2DD4BF]">
              <span className="w-4 h-0.5 bg-[#2DD4BF]" aria-hidden="true" />
              Personal alert (peak)
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
              <span
                className="w-4 h-0.5 border-t border-dashed border-[#94A3B8]"
                aria-hidden="true"
              />
              Simple average (peak)
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#8AA3A0]">
              <span
                className="w-4 h-0.5 border-t border-dotted border-[#8AA3A0]"
                aria-hidden="true"
              />
              Fixed cutoff (peak)
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full h-auto block"
          aria-label={`180-day detector trajectory chart with change point at Day ${sim.changePointDay} and threshold scaled to 5.0`}
        >
          {/* Grid lines & Y ticks */}
          {yTicks.map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={chartW - padR}
                  y2={y}
                  stroke="rgba(148, 226, 213, 0.08)"
                />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#8AA3A0"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* X ticks */}
          {xTicks.map((d) => (
            <text
              key={d}
              x={toX(d)}
              y={chartH - 10}
              textAnchor="middle"
              fill="#8AA3A0"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              D{d}
            </text>
          ))}

          {/* Alert level 5.0 horizontal dotted coral line */}
          <line
            x1={padL}
            y1={alertY}
            x2={chartW - padR}
            y2={alertY}
            stroke="#FB7185"
            strokeWidth="1.25"
            strokeDasharray="3 4"
          />
          <text
            x={chartW - padR - 4}
            y={alertY - 5}
            textAnchor="end"
            fill="#FB7185"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
          >
            Alert level 5.0
          </text>

          {/* Change vertical dashed coral line */}
          <motion.line
            key={`change-${sim.changePointDay}`}
            initial={{ y2: padT }}
            animate={{ y2: padT + plotH }}
            transition={{ duration: 0.35 }}
            x1={changeX}
            y1={padT}
            x2={changeX}
            stroke="#FB7185"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text
            x={changeX + 5}
            y={padT + 11}
            fill="#FB7185"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
          >
            Change
          </text>

          {/* Fixed cutoff */}
          <motion.path
            key={`pop-${scenario}-${seed}-${subjectId}`}
            d={popPath}
            fill="none"
            stroke="#8AA3A0"
            strokeWidth="1.3"
            strokeDasharray="2 3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45 }}
          />

          {/* Simple average */}
          <motion.path
            key={`z-${scenario}-${seed}-${subjectId}`}
            d={zPath}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1.6"
            strokeDasharray="6 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45 }}
          />

          {/* Personal alert */}
          <motion.path
            key={`hb-${scenario}-${seed}-${subjectId}-${informativeCensoring}-${tempering}`}
            d={hbPath}
            fill="none"
            stroke="#2DD4BF"
            strokeWidth="2.4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.55 }}
          />
        </svg>
      </div>

      {/* Live numbers table */}
      <div className="clinical-glass rounded-2xl p-4 space-y-2.5 overflow-x-auto">
        <div className="text-xs font-semibold text-[#E8F3F1]">
          Live numbers from this chart (Demo data)
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#94E2D5]/15 text-[#8AA3A0] font-mono">
              <th className="py-2 pr-3">Method</th>
              <th className="py-2 px-3">Early alerts before change</th>
              <th className="py-2 px-3">First alert after change</th>
              <th className="py-2 pl-3">How it works</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#2DD4BF]/10 border-b border-[#2DD4BF]/25 text-[#E8F3F1]">
              <td className="py-2.5 pr-3 font-semibold text-[#2DD4BF]">
                Personal alert
              </td>
              <td className="py-2.5 px-3 font-mono">
                {countPreAlerts('hbAlert')}
              </td>
              <td className="py-2.5 px-3 font-mono">
                {firstPostAlert('hbAlert')}
              </td>
              <td className="py-2.5 pl-3 text-[#E8F3F1]">
                Learns your own normal range first.
              </td>
            </tr>
            <tr className="border-b border-[#94E2D5]/10 text-[#E8F3F1]">
              <td className="py-2.5 pr-3 font-medium">Simple average</td>
              <td className="py-2.5 px-3 font-mono">
                {countPreAlerts('zAlert')}
              </td>
              <td className="py-2.5 px-3 font-mono">
                {firstPostAlert('zAlert')}
              </td>
              <td className="py-2.5 pl-3 text-[#8AA3A0]">
                Checks only basic day-to-day ups and downs.
              </td>
            </tr>
            <tr className="text-[#E8F3F1]">
              <td className="py-2.5 pr-3 font-medium">Fixed cutoff</td>
              <td className="py-2.5 px-3 font-mono">
                {countPreAlerts('popAlert')}
              </td>
              <td className="py-2.5 px-3 font-mono">
                {firstPostAlert('popAlert')}
              </td>
              <td className="py-2.5 pl-3 text-[#8AA3A0]">
                Uses one cutoff for everyone.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
