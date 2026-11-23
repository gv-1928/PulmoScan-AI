import React, { useState } from 'react';
import {
  SessionRecord,
  ScreeningResultStatus,
} from '../shared/contract.ts';
import {
  CheckCircle2,
  AlertCircle,
  Eye,
  TrendingUp,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Share2,
  Printer,
  ChevronDown,
  ChevronUp,
  Activity,
  Wind,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Volume2,
  Mic,
  Maximize2,
} from 'lucide-react';
import { ClinicalPdfReportModal } from '../components/ClinicalPdfReportModal.tsx';

interface ReportViewProps {
  session: SessionRecord;
  onClose?: () => void;
  onRecordAgain?: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  session,
  onClose,
  onRecordAgain,
}) => {
  const [showTraceSheet, setShowTraceSheet] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [expandedCondition, setExpandedCondition] = useState<number | null>(0);
  const [showLimitations, setShowLimitations] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const { status, measurements, report, trace, timestamp, isDemoData } = session;
  const isRepeat = status === 'REPEAT_RECORDING' || measurements.qualityScore === 0;

  // Status Styling Configuration
  const getStatusBadge = (st: ScreeningResultStatus) => {
    switch (st) {
      case 'Stable':
        return {
          label: 'Stable Pattern',
          color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          ringColor: '#059669',
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
        };
      case 'EarlyWatch':
        return {
          label: 'Early Watch',
          color: 'text-amber-700 bg-amber-50 border-amber-200',
          ringColor: '#d97706',
          icon: <Eye className="w-6 h-6 text-amber-600" />,
        };
      case 'ElevatedPattern':
        return {
          label: 'Elevated Pattern',
          color: 'text-orange-700 bg-orange-50 border-orange-200',
          ringColor: '#ea580c',
          icon: <TrendingUp className="w-6 h-6 text-orange-600" />,
        };
      case 'AcutePattern':
        return {
          label: 'Acute Pattern',
          color: 'text-rose-700 bg-rose-50 border-rose-200',
          ringColor: '#e11d48',
          icon: <AlertCircle className="w-6 h-6 text-rose-600" />,
        };
      case 'REPEAT_RECORDING':
      default:
        return {
          label: 'Repeat Recording',
          color: 'text-slate-700 bg-slate-100 border-slate-300',
          ringColor: '#64748b',
          icon: <RotateCcw className="w-6 h-6 text-slate-600" />,
        };
    }
  };

  const statusInfo = getStatusBadge(status);
  const qualityLabel =
    measurements.usableAudioRatio >= 0.8
      ? 'Good'
      : measurements.usableAudioRatio >= 0.5
      ? 'Fair'
      : 'Poor';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="pb-24 pt-3 max-w-lg mx-auto px-4 space-y-5 print:p-0 print:m-0 print:max-w-none text-slate-900">
      {/* Demo watermark if applicable */}
      {isDemoData && (
        <div className="bg-amber-100/80 border border-amber-300 text-amber-800 text-[11px] font-bold px-3 py-1 rounded-full text-center tracking-wider uppercase">
          DEMO DATA — SYNTHETIC RECORDING
        </div>
      )}

      {/* 1. Header Hero Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs text-center relative overflow-hidden">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-3">
          <span>{new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <span className="font-medium text-slate-500">Quality: <strong className={qualityLabel === 'Good' ? 'text-teal-600' : 'text-slate-700'}>{qualityLabel}</strong></span>
        </div>

        {/* Circular Hero Ring */}
        <div className="relative w-28 h-28 mx-auto flex items-center justify-center my-2">
          <svg className="w-full h-full -rotate-90">
            <circle cx="56" cy="56" r="48" className="stroke-slate-100" strokeWidth="8" fill="transparent" />
            <circle
              cx="56"
              cy="56"
              r="48"
              stroke={statusInfo.ringColor}
              strokeWidth="8"
              strokeDasharray={2 * Math.PI * 48}
              strokeDashoffset={isRepeat ? 2 * Math.PI * 48 * 0.5 : 0}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {statusInfo.icon}
          </div>
        </div>

        <h2 className="text-xl font-extrabold text-slate-900 mt-2">{statusInfo.label}</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          {isRepeat
            ? 'Acoustic clarity did not meet quality thresholds'
            : trace.explanation || 'Screening assessment based on acoustic features and baseline comparison'}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setShowTraceSheet(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-full transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            How this was decided
          </button>
        </div>
      </div>

      {/* IF REPEAT_RECORDING: Show Friendly Re-Record Guide (NO conditions) */}
      {isRepeat ? (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">How to Record Again</h3>
              <p className="text-xs text-slate-500">Follow these 3 quick tips for clean acoustic capture</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-slate-800 block">Firm skin contact</span>
                <span className="text-slate-500">Hold the sensor firmly against bare chest or back without sliding or adjusting fingers during recording.</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-slate-800 block">Minimize background sound</span>
                <span className="text-slate-500">Ensure the room is quiet. Turn off televisions, fans, or air conditioners that create low-frequency hums.</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-slate-800 block">Breathe through open mouth</span>
                <span className="text-slate-500">Take steady, deep breaths through a relaxed open mouth without humming or speaking.</span>
              </div>
            </div>
          </div>

          {onRecordAgain && (
            <button
              onClick={onRecordAgain}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2"
            >
              <Mic className="w-4 h-4" />
              Start New Recording
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 2. Plain-Language Summary */}
          <div className="bg-teal-50/70 border border-teal-100 rounded-3xl p-5 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase text-teal-800">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                Plain-Language Summary
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-100/80 text-teal-800">
                AI second look: {report.audio_review.agreement}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-800 leading-relaxed">
              {report.summary}
            </p>
            {report.audio_review.note && (
              <p className="text-xs text-teal-900/80 italic border-t border-teal-200/50 pt-2">
                &ldquo;{report.audio_review.note}&rdquo;
              </p>
            )}
          </div>

          {/* 3. Sound Map (Spectrogram & Waveform) */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-teal-600" />
                Acoustic Sound Map
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">16 kHz Log-Mel</span>
            </div>

            {/* Spectrogram Grid */}
            {measurements.spectrogramOverview?.grid ? (
              <div className="h-28 bg-slate-950 rounded-2xl overflow-hidden relative p-1.5 flex flex-col justify-between">
                <div className="grid grid-cols-60 gap-px h-full w-full">
                  {measurements.spectrogramOverview.grid.map((band, bIdx) => (
                    <div key={bIdx} className="flex flex-row w-full h-[3px]">
                      {band.map((val, cIdx) => (
                        <div
                          key={cIdx}
                          className="flex-1"
                          style={{
                            backgroundColor:
                              val > 0.65
                                ? '#f43f5e'
                                : val > 0.4
                                ? '#f59e0b'
                                : val > 0.15
                                ? '#0d9488'
                                : '#020617',
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Event Markers Overlay */}
                <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                  {measurements.events.slice(0, 8).map((ev, i) => (
                    <div
                      key={i}
                      className="absolute bottom-2 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-tighter shadow-sm pointer-events-auto cursor-pointer"
                      style={{
                        left: `${Math.min(85, (ev.time / 12) * 85 + 5)}%`,
                        backgroundColor: ev.type === 'wheeze' ? '#f59e0b' : '#38bdf8',
                        color: '#0f172a',
                      }}
                      onClick={() => setSelectedEvent(ev)}
                    >
                      {ev.type === 'wheeze' ? 'W' : 'C'}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-20 bg-slate-100 rounded-xl flex items-center justify-center text-xs text-slate-400">
                Spectrogram data not attached
              </div>
            )}

            {/* Sound Map Legend */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  Wheeze tone (W)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                  Crackle click (C)
                </span>
              </div>
              <span>Click markers for event details</span>
            </div>

            {selectedEvent && (
              <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between">
                <span>
                  <strong>{selectedEvent.type.toUpperCase()} event</strong> at {selectedEvent.time.toFixed(1)}s (duration: {(selectedEvent.duration * 1000).toFixed(0)}ms)
                </span>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* 4. Key Measurement Tiles with Range Bars */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Key Respiratory Metrics</h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Tile: Breathing Rate */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-1.5">
                <span className="text-[11px] text-slate-500 font-semibold block">Breathing Rate</span>
                <div className="text-lg font-extrabold text-slate-800">
                  {measurements.respiratoryRate ? `${measurements.respiratoryRate} bpm` : 'Variable'}
                </div>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                  <div
                    className="bg-teal-600 h-full rounded-full"
                    style={{
                      width: `${Math.min(100, ((measurements.respiratoryRate || 16) / 35) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 block">Normal rest: 12–20 bpm</span>
              </div>

              {/* Tile: Acoustic Class */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-1.5">
                <span className="text-[11px] text-slate-500 font-semibold block">Acoustic Finding</span>
                <div className="text-lg font-extrabold text-slate-800">
                  {measurements.localClass}
                </div>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full"
                    style={{ width: `${measurements.confidence * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 block font-mono">
                  {(measurements.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>

              {/* Tile: Wheeze Burden */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-1.5">
                <span className="text-[11px] text-slate-500 font-semibold block">Wheeze Burden</span>
                <div className="text-lg font-extrabold text-amber-700">
                  {(measurements.wheezeBurden * 100).toFixed(1)}%
                </div>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, measurements.wheezeBurden * 250)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 block">
                  {measurements.wheezeCount} musical events detected
                </span>
              </div>

              {/* Tile: Crackle Burden */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-1.5">
                <span className="text-[11px] text-slate-500 font-semibold block">Crackle Count</span>
                <div className="text-lg font-extrabold text-sky-700">
                  {measurements.crackleCount}
                </div>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, measurements.crackleCount * 10)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 block">
                  {measurements.crackleRatePerBreath} per breath
                </span>
              </div>
            </div>
          </div>

          {/* 5. Possible Associated Conditions */}
          {report.possible_conditions.length > 0 && (
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Possible Associated Conditions</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Not a diagnosis — for clinical correlation and physician discussion
                </p>
              </div>

              <div className="space-y-2 pt-1">
                {report.possible_conditions.map((cond, idx) => {
                  const isExp = expandedCondition === idx;
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded-2xl overflow-hidden transition"
                    >
                      <button
                        onClick={() => setExpandedCondition(isExp ? null : idx)}
                        className="w-full p-3.5 text-left flex items-center justify-between hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">{cond.name}</span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              cond.strength === 'more consistent'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {cond.strength}
                          </span>
                        </div>
                        {isExp ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>

                      {isExp && (
                        <div className="px-3.5 pb-3.5 pt-1 text-xs text-slate-600 bg-slate-50/50 border-t border-slate-100">
                          <span className="font-semibold text-slate-700 block mb-0.5">
                            Why considered:
                          </span>
                          {cond.why_considered}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. Red Flags Card (Urgent Medical Care) */}
          {report.red_flags.length > 0 && (
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-3xl p-5 space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Watch for Red Flags — Seek Urgent Care</span>
              </div>
              <ul className="space-y-1.5 text-xs text-rose-950 font-medium">
                {report.red_flags.map((rf, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-rose-500 mt-0.5">•</span>
                    <span>{rf}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 7. Next Steps */}
          {report.next_steps.length > 0 && (
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                Recommended Next Steps
              </h3>
              <div className="space-y-2">
                {report.next_steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Limitations (collapsible) */}
          <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white">
            <button
              onClick={() => setShowLimitations(!showLimitations)}
              className="w-full p-4 text-left flex items-center justify-between text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <span>Screening Limitations & Prototype Scope</span>
              {showLimitations ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>
            {showLimitations && (
              <div className="p-4 pt-1 text-xs text-slate-500 space-y-1.5 bg-slate-50 border-t border-slate-100">
                {report.limitations.map((lim, i) => (
                  <p key={i}>• {lim}</p>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Action Buttons: Export PDF & Print */}
      <div className="flex items-center gap-3 pt-2 print:hidden">
        <button
          onClick={() => setShowPdfModal(true)}
          className="flex-1 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-100 shadow-2xs flex items-center justify-center gap-2 transition"
        >
          <Printer className="w-4 h-4 text-teal-600" />
          Export Clinical PDF
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold shadow-2xs transition"
          >
            Done
          </button>
        )}
      </div>

      {/* Clinical PDF Report Modal */}
      <ClinicalPdfReportModal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        session={session}
      />

      {/* 8. "How this was decided" Bottom Sheet / Modal */}
      {showTraceSheet && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                Screening Logic Trace
              </h3>
              <button
                onClick={() => setShowTraceSheet(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              The classification and status shown come from local mathematical measurements and
              longitudinal baseline tracking.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-2 font-mono text-xs text-slate-700">
              <div className="flex justify-between">
                <span>Baseline Status:</span>
                <strong className="text-slate-900">{trace.baselineStatus} ({trace.nValid}/14 valid days)</strong>
              </div>
              <div className="flex justify-between">
                <span>Abnormality Score (A):</span>
                <span>{(trace.A * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Confidence (conf):</span>
                <span>{(trace.conf * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Acute Override:</span>
                <span className={trace.acuteOverride ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                  {trace.acuteOverride ? 'TRIGGERED (Day 1 alert)' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Z-Score Deviation (D):</span>
                <span>{trace.D.toFixed(2)} σ</span>
              </div>
              <div className="flex justify-between">
                <span>7-Day Burden Slope:</span>
                <span>{trace.slope.toFixed(3)}</span>
              </div>
              <div className="flex justify-between">
                <span>Persistence Days:</span>
                <span>{trace.persist}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-teal-800">
                <span>Fused Score (g):</span>
                <span>{trace.g.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-teal-50 p-3 rounded-2xl border border-teal-100">
              <strong>Evaluation Trace:</strong> {trace.explanation}
            </div>

            <button
              onClick={() => setShowTraceSheet(false)}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold transition"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
