import React from 'react';
import { SessionRecord } from '../shared/contract.ts';
import {
  Printer,
  Download,
  X,
  ShieldAlert,
  Activity,
  CheckCircle2,
  AlertCircle,
  Eye,
  TrendingUp,
  RotateCcw,
  Sparkles,
  FileText,
  User,
  Calendar,
} from 'lucide-react';

interface ClinicalPdfReportModalProps {
  session: SessionRecord;
  isOpen: boolean;
  onClose: () => void;
  participantContext?: { age?: string; height?: string; weight?: string };
}

export const ClinicalPdfReportModal: React.FC<ClinicalPdfReportModalProps> = ({
  session,
  isOpen,
  onClose,
  participantContext = { age: '42', height: '175', weight: '70' },
}) => {
  if (!isOpen) return null;

  const { measurements, report, trace, status, localClass, confidence, timestamp, id, transport } = session;

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'Stable':
        return { label: 'STABLE PATTERN', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
      case 'EarlyWatch':
        return { label: 'EARLY WATCH', color: 'bg-amber-100 text-amber-900 border-amber-300' };
      case 'ElevatedPattern':
        return { label: 'ELEVATED PATTERN', color: 'bg-orange-100 text-orange-900 border-orange-300' };
      case 'AcutePattern':
        return { label: 'ACUTE PATTERN', color: 'bg-rose-100 text-rose-900 border-rose-300' };
      default:
        return { label: 'REPEAT RECORDING', color: 'bg-slate-100 text-slate-900 border-slate-300' };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
      {/* Container - on print this renders full-page */}
      <div className="bg-white text-slate-950 w-full max-w-4xl min-h-screen sm:min-h-0 sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto printable-report">
        {/* Modal Top Control Bar (Hidden during print) */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between no-print border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">Clinical PDF Report Generator</h3>
              <p className="text-[11px] text-slate-400">Formatted for medical chart printing and archival</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              title="Close Report"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Document Body */}
        <div className="p-8 sm:p-12 space-y-6 text-slate-900 font-sans print:p-0">
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-extrabold bg-teal-700 text-white px-2 py-0.5 rounded tracking-widest uppercase">
                  PulmoScan AI
                </span>
                <span className="text-xs font-mono font-semibold text-slate-600">
                  CLINICAL AUSCULTATION REPORT
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">
                Respiratory Acoustic Screening Evaluation
              </h1>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Multi-window log-mel spectral decomposition & longitudinal baseline analysis
              </p>
            </div>

            <div className="text-right text-xs font-mono space-y-0.5 sm:border-l sm:border-slate-200 sm:pl-4">
              <div><strong className="text-slate-500 uppercase text-[10px]">Session ID:</strong> {id}</div>
              <div><strong className="text-slate-500 uppercase text-[10px]">Date & Time:</strong> {new Date(timestamp).toLocaleString()}</div>
              <div><strong className="text-slate-500 uppercase text-[10px]">Transmission Link:</strong> <span className="uppercase">{transport} Direct</span></div>
            </div>
          </div>

          {/* Mandatory Research Prototype Banner */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3.5 text-xs text-amber-950 font-medium rounded-r-lg space-y-1 avoid-break">
            <div className="flex items-center gap-2 font-bold text-amber-900 uppercase tracking-wider text-[11px]">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Research Prototype Investigational Notice</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              This report is generated by a research software prototype and rule-grounded classifier. It is <strong>not an FDA-cleared diagnostic device</strong> and does not establish a diagnosis. Findings must be correlated with thorough clinical history, physical exam, and standard stethoscope auscultation by a qualified physician.
            </p>
          </div>

          {/* Patient Demographics & Session Parameters Grid */}
          <div className="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono avoid-break">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Participant Age</span>
              <strong className="text-slate-900 text-sm">{participantContext.age || '42'} yrs</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Height / Weight</span>
              <strong className="text-slate-900 text-sm">{participantContext.height || '175'} cm / {participantContext.weight || '70'} kg</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Quality Score</span>
              <strong className={measurements.qualityScore === 1 ? 'text-emerald-700 text-sm' : 'text-rose-700 text-sm'}>
                {measurements.qualityScore === 1 ? 'PASS (q=1)' : 'FAIL (q=0)'}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Usable Signal</span>
              <strong className="text-slate-900 text-sm">{(measurements.usableAudioRatio * 100).toFixed(0)}% ({measurements.validWindows}/{measurements.totalWindows} windows)</strong>
            </div>
          </div>

          {/* Primary Assessment Block */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-white shadow-2xs space-y-3 avoid-break">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                  Automated Classifier Finding
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-xl font-black text-slate-950">{localClass} Breath Sound</h2>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">
                    {(confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                  Pattern Status
                </span>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-black border ${statusBadge.color}`}>
                  {statusBadge.label}
                </span>
              </div>
            </div>

            {/* Narrative Summary */}
            <div className="text-xs text-slate-800 leading-relaxed space-y-1">
              <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider">
                Clinical Acoustic Summary (Gemini Multimodal Interpretation):
              </span>
              <p className="bg-teal-50/50 p-3 rounded-xl border border-teal-100 font-medium">
                {report.summary}
              </p>
              {report.audio_review.note && (
                <p className="text-[11px] text-slate-600 italic">
                  Review Agreement: <strong>{report.audio_review.agreement.toUpperCase()}</strong> — {report.audio_review.note}
                </p>
              )}
            </div>
          </div>

          {/* Continuous Waveform Snapshot & Event Sound Map */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-2 avoid-break">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-teal-600" />
                Continuous Acoustic Waveform &amp; Event Markers
              </span>
              <span className="font-mono text-[10px] text-slate-500">16.0 kHz Normalized Auscultation Stream</span>
            </div>

            {/* Waveform Bar Rendering */}
            <div className="h-16 bg-slate-950 rounded-xl p-2 flex items-center gap-0.5 overflow-hidden">
              {measurements.waveformSample?.slice(0, 150).map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-teal-400 rounded-full"
                  style={{ height: `${Math.max(8, Math.abs(v) * 95)}%` }}
                />
              ))}
            </div>

            <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-1">
              <span>Event Count: {measurements.wheezeCount} Wheezes, {measurements.crackleCount} Crackles</span>
              <span>Duration: ~{measurements.windows.length * 1.5 + 1.5}s</span>
            </div>
          </div>

          {/* Quantitative Acoustic Biometric Table */}
          <div className="space-y-1.5 avoid-break">
            <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block">
              Quantitative Acoustic Biometric Matrix
            </span>
            <table className="w-full border border-slate-200 text-left text-xs font-mono">
              <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Acoustic Parameter</th>
                  <th className="p-2.5">Measured Value</th>
                  <th className="p-2.5">Normal Baseline</th>
                  <th className="p-2.5">Clinical Relevance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                <tr>
                  <td className="p-2.5 font-bold">Breathing Frequency</td>
                  <td className="p-2.5 text-teal-800 font-bold">{measurements.respiratoryRate ? `${measurements.respiratoryRate} bpm` : 'Variable'}</td>
                  <td className="p-2.5 text-slate-500">12 – 20 bpm</td>
                  <td className="p-2.5 font-sans text-[11px] text-slate-600">Resting cycle cadence</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold">Wheeze Burden</td>
                  <td className="p-2.5 text-amber-800 font-bold">{(measurements.wheezeBurden * 100).toFixed(1)}%</td>
                  <td className="p-2.5 text-slate-500">&lt; 2.0%</td>
                  <td className="p-2.5 font-sans text-[11px] text-slate-600">Musical expiratory airway vibration ({measurements.wheezeCount} events)</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold">Crackle Burden</td>
                  <td className="p-2.5 text-sky-800 font-bold">{measurements.crackleCount} events</td>
                  <td className="p-2.5 text-slate-500">0 – 2 events</td>
                  <td className="p-2.5 font-sans text-[11px] text-slate-600">Discontinuous click sounds ({measurements.crackleRatePerBreath}/breath)</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold">Longitudinal Fused Score (g)</td>
                  <td className="p-2.5 font-bold text-slate-900">{trace.g.toFixed(2)}</td>
                  <td className="p-2.5 text-slate-500">&lt; 1.2 (EarlyWatch)</td>
                  <td className="p-2.5 font-sans text-[11px] text-slate-600">Multi-feature deviation from baseline ({trace.baselineStatus})</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Differential Possibilities Table */}
          {report.possible_conditions.length > 0 && (
            <div className="space-y-1.5 avoid-break">
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block">
                  Differential Acoustic Insights (Physician Review)
                </span>
                <span className="text-[10px] text-slate-500 italic">Not a confirmed diagnosis</span>
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden text-xs">
                {report.possible_conditions.map((cond, idx) => (
                  <div key={idx} className="p-3 bg-white flex items-start justify-between gap-4">
                    <div>
                      <strong className="text-slate-950 font-bold text-xs">{cond.name}</strong>
                      <p className="text-[11px] text-slate-600 mt-0.5">{cond.why_considered}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      cond.strength === 'more consistent' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {cond.strength}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Red Flags Caution Strip */}
          {report.red_flags.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs text-rose-950 space-y-1 avoid-break">
              <strong className="text-rose-900 font-bold flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                Urgent Warning Signs Requiring Immediate Care
              </strong>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-900">
                {report.red_flags.map((rf, i) => (
                  <li key={i}>{rf}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Clinician Signature Block */}
          <div className="border-t-2 border-slate-300 pt-6 mt-8 grid grid-cols-3 gap-6 text-xs font-mono avoid-break">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Reviewing Clinician / Investigator</span>
              <div className="border-b border-slate-400 mt-8 pb-1">Dr. ___________________________</div>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Clinical Decision / Disposition</span>
              <div className="border-b border-slate-400 mt-8 pb-1">______________________________</div>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Date &amp; Facility Stamp</span>
              <div className="border-b border-slate-400 mt-8 pb-1">Date: ________________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
