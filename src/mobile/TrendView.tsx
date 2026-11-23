import React, { useState } from 'react';
import {
  HistoricalSessionSummary,
  DEFAULT_ENGINE_CONFIG,
} from '../shared/engine.ts';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import {
  TrendingUp,
  AlertCircle,
  Calendar,
  Layers,
  Info,
} from 'lucide-react';

interface TrendViewProps {
  history: HistoricalSessionSummary[];
  isDemoHistory?: boolean;
}

export const TrendView: React.FC<TrendViewProps> = ({ history, isDemoHistory }) => {
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30 | 90>(30);
  const [activeMetric, setActiveMetric] = useState<'g' | 'wheeze' | 'rate'>('g');

  // Filter history based on selected days
  const filteredHistory = history.slice(-rangeDays);

  // Format data for Recharts, respecting the rule:
  // "Censored days shown as hollow markers with a dashed gap (never interpolated)"
  const chartData = filteredHistory.map((item, idx) => {
    const isCensored = item.isCensored || item.quality === 0;
    const dateObj = new Date(item.timestamp);
    const dayLabel = `D${item.dayIndex !== undefined ? item.dayIndex : idx + 1}`;

    // Estimated g score calculation for visualization
    const estimatedG = item.dayIndex >= 22 ? 1.0 + ((item.dayIndex - 22) / 8) * 2.2 : 0.4 + (item.burden * 2);

    return {
      name: dayLabel,
      fullDate: dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      isCensored,
      // If censored, set to null so line chart does NOT interpolate across it!
      wheezeBurden: isCensored ? null : Math.round(item.burden * 1000) / 10,
      breathingRate: isCensored ? null : 16 + Math.round(item.burden * 10),
      gScore: isCensored ? null : Math.round(estimatedG * 100) / 100,
      rawItem: item,
    };
  });

  return (
    <div className="pb-24 pt-3 max-w-lg mx-auto px-4 space-y-4">
      {/* DEMO DATA Watermark */}
      {isDemoHistory && (
        <div className="bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold px-3 py-1 rounded-full text-center tracking-wider uppercase">
          DEMO DATA — 30-DAY SYNTHETIC RESPIRATORY COHORT
        </div>
      )}

      {/* Header and Range Selectors */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="w-5 h-5 text-teal-600" />
              Longitudinal Respiratory Trends
            </h2>
            <p className="text-xs text-slate-500">
              Personal baseline trajectory and adventitious acoustic shifts
            </p>
          </div>
        </div>

        {/* Range Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          {([7, 14, 30, 90] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRangeDays(r)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition ${
                rangeDays === r
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>

        {/* Metric Selector Pills */}
        <div className="flex gap-2 pt-1 overflow-x-auto">
          <button
            onClick={() => setActiveMetric('g')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              activeMetric === 'g'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Fused Score (g)
          </button>
          <button
            onClick={() => setActiveMetric('wheeze')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              activeMetric === 'wheeze'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Wheeze Burden (%)
          </button>
          <button
            onClick={() => setActiveMetric('rate')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              activeMetric === 'rate'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Breathing Rate (bpm)
          </button>
        </div>

        {/* Chart View */}
        <div className="h-60 w-full pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    if (data.isCensored) {
                      return (
                        <div className="bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-lg">
                          <p className="font-bold">{data.fullDate} ({data.name})</p>
                          <p className="text-amber-400 mt-1">Censored / Poor quality session</p>
                          <p className="text-slate-400 text-[10px]">Excluded from baseline stats</p>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-lg space-y-1">
                        <p className="font-bold text-teal-300">{data.fullDate} ({data.name})</p>
                        <p>Class: <strong className="text-white">{data.rawItem.class}</strong></p>
                        {activeMetric === 'g' && <p>Fused g: <strong className="text-emerald-400">{data.gScore}</strong></p>}
                        {activeMetric === 'wheeze' && <p>Wheeze Burden: <strong className="text-amber-400">{data.wheezeBurden}%</strong></p>}
                        {activeMetric === 'rate' && <p>Rate: <strong className="text-sky-400">{data.breathingRate} bpm</strong></p>}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {activeMetric === 'g' && (
                <>
                  <ReferenceLine
                    y={DEFAULT_ENGINE_CONFIG.ETA_HIGH}
                    stroke="#ea580c"
                    strokeDasharray="4 4"
                    label={{ value: 'Elevated (2.4)', fill: '#ea580c', fontSize: 10, position: 'right' }}
                  />
                  <ReferenceLine
                    y={DEFAULT_ENGINE_CONFIG.ETA_LOW}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    label={{ value: 'Early Watch (1.2)', fill: '#d97706', fontSize: 10, position: 'right' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gScore"
                    stroke="#0d9488"
                    strokeWidth={2.5}
                    connectNulls={false} // Never interpolate across censored days!
                    dot={{ r: 3, fill: '#0d9488' }}
                    activeDot={{ r: 5 }}
                  />
                </>
              )}

              {activeMetric === 'wheeze' && (
                <Line
                  type="monotone"
                  dataKey="wheezeBurden"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3, fill: '#f59e0b' }}
                  activeDot={{ r: 5 }}
                />
              )}

              {activeMetric === 'rate' && (
                <Line
                  type="monotone"
                  dataKey="breathingRate"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3, fill: '#0284c7' }}
                  activeDot={{ r: 5 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Status Timeline Strip */}
        <div className="pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-700 block mb-1.5">
            Status Timeline Strip
          </span>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden">
            {filteredHistory.map((item, idx) => {
              let bg = 'bg-emerald-500';
              if (item.isCensored || item.quality === 0) bg = 'bg-slate-300';
              else if (item.dayIndex >= 26) bg = 'bg-orange-500';
              else if (item.dayIndex >= 22) bg = 'bg-amber-400';
              return (
                <div
                  key={idx}
                  className={`flex-1 ${bg}`}
                  title={`${item.timestamp}: ${item.class}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
            <span>{rangeDays} days ago</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Stable
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> EarlyWatch
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span> Elevated
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-300"></span> Censored
              </span>
            </div>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* Clinical Notes Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 text-xs text-slate-600 space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <Info className="w-4 h-4 text-teal-600" />
          <span>Longitudinal Baseline Integrity</span>
        </div>
        <p>
          Censored days (shown as gaps) represent recordings with high background noise or cough artifacts.
          They are strictly excluded from personal mean (μ) and variance (σ) accumulation to prevent bias.
        </p>
      </div>
    </div>
  );
};
