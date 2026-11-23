import React from 'react';
import { SessionRecord, ScreeningResultStatus } from '../shared/contract.ts';
import { DeviceState } from '../shared/transport.ts';
import {
  CheckCircle2,
  AlertCircle,
  Eye,
  TrendingUp,
  RotateCcw,
  Wifi,
  Bluetooth,
  Battery,
  ChevronRight,
  Wind,
  ShieldCheck,
  Activity,
  Mic,
  ArrowUpRight,
} from 'lucide-react';

interface HomeScreenProps {
  latestSession: SessionRecord | null;
  deviceState: DeviceState;
  validDaysCount: number;
  onViewReport: () => void;
  onNavigateTab: (tab: 'trend' | 'history' | 'settings') => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  latestSession,
  deviceState,
  validDaysCount,
  onViewReport,
  onNavigateTab,
}) => {
  const getStatusDisplay = (st?: ScreeningResultStatus) => {
    switch (st) {
      case 'Stable':
        return {
          title: 'Stable Pattern',
          color: 'text-emerald-700',
          ringColor: '#059669',
          icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
        };
      case 'EarlyWatch':
        return {
          title: 'Early Watch',
          color: 'text-amber-700',
          ringColor: '#d97706',
          icon: <Eye className="w-8 h-8 text-amber-600" />,
        };
      case 'ElevatedPattern':
        return {
          title: 'Elevated Pattern',
          color: 'text-orange-700',
          ringColor: '#ea580c',
          icon: <TrendingUp className="w-8 h-8 text-orange-600" />,
        };
      case 'AcutePattern':
        return {
          title: 'Acute Pattern',
          color: 'text-rose-700',
          ringColor: '#e11d48',
          icon: <AlertCircle className="w-8 h-8 text-rose-600" />,
        };
      case 'REPEAT_RECORDING':
        return {
          title: 'Repeat Recording',
          color: 'text-slate-700',
          ringColor: '#64748b',
          icon: <RotateCcw className="w-8 h-8 text-slate-600" />,
        };
      default:
        return {
          title: 'Ready for Recording',
          color: 'text-teal-700',
          ringColor: '#0d9488',
          icon: <Wind className="w-8 h-8 text-teal-600" />,
        };
    }
  };

  const statusDisplay = getStatusDisplay(latestSession?.status);
  const baselineProgress = Math.min(100, Math.round((validDaysCount / 14) * 100));

  return (
    <div className="pb-24 pt-3 max-w-lg mx-auto px-4 space-y-4">
      {/* Top Bar: Greeting & Connection Pill */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            PulmoScan Companion
          </span>
          <h1 className="text-base font-bold text-slate-900">Personal Respiratory Health</h1>
        </div>

        {/* Connected Device Pill */}
        <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-full px-3 py-1 shadow-2xs text-xs">
          {deviceState.transportMode === 'wifi' ? (
            <Wifi className="w-3.5 h-3.5 text-teal-600" />
          ) : (
            <Bluetooth className="w-3.5 h-3.5 text-teal-600" />
          )}
          <span className="font-semibold text-slate-700">{deviceState.name}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        </div>
      </div>

      {/* Hero Card: Latest Personal Respiratory Status */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs relative overflow-hidden text-center">
        {latestSession?.isDemoData && (
          <div className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase mb-2">
            Demo Data
          </div>
        )}

        {/* Status Circular Ring */}
        <div className="relative w-32 h-32 mx-auto flex items-center justify-center my-1">
          <svg className="w-full h-full -rotate-90">
            <circle cx="64" cy="64" r="54" className="stroke-slate-100" strokeWidth="9" fill="transparent" />
            <circle
              cx="64"
              cy="64"
              r="54"
              stroke={statusDisplay.ringColor}
              strokeWidth="9"
              strokeDasharray={2 * Math.PI * 54}
              strokeDashoffset={latestSession ? 0 : 2 * Math.PI * 54 * 0.75}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {statusDisplay.icon}
          </div>
        </div>

        <h2 className="text-xl font-extrabold text-slate-900 mt-2">{statusDisplay.title}</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          {latestSession
            ? latestSession.report.summary
            : 'No lung audio recorded yet. Drop or generate a recording in the PC Device Console.'}
        </p>

        {latestSession && (
          <div className="text-[11px] text-slate-400 mt-3 font-mono">
            Last checked:{' '}
            {new Date(latestSession.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}

        {latestSession && (
          <button
            onClick={onViewReport}
            className="w-full mt-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition"
          >
            <span>View Full Clinical Report</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Three Compact Measurement Tiles */}
      {latestSession && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Finding</span>
            <div className="text-sm font-extrabold text-slate-800 truncate">
              {latestSession.localClass}
            </div>
            <span className="text-[10px] text-slate-500 block">
              {(latestSession.confidence * 100).toFixed(0)}% conf
            </span>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Breathing</span>
            <div className="text-sm font-extrabold text-slate-800">
              {latestSession.measurements.respiratoryRate
                ? `${latestSession.measurements.respiratoryRate} bpm`
                : 'Variable'}
            </div>
            <span className="text-[10px] text-slate-500 block">Resting rhythm</span>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Quality</span>
            <div className="text-sm font-extrabold text-teal-600">
              {(latestSession.measurements.usableAudioRatio * 100).toFixed(0)}%
            </div>
            <span className="text-[10px] text-slate-500 block">Usable signal</span>
          </div>
        </div>
      )}

      {/* Baseline Progress Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900">Personal Baseline Establishment</h3>
            <span className="text-[11px] text-slate-400">
              {validDaysCount >= 14
                ? 'Baseline established (14+ valid days)'
                : `Building: ${validDaysCount} of 14 valid days completed`}
            </span>
          </div>
          <span className="text-xs font-bold font-mono text-teal-700">{baselineProgress}%</span>
        </div>

        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div
            className="bg-teal-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${baselineProgress}%` }}
          />
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          {validDaysCount >= 14
            ? 'Longitudinal shift detection is active. Fused z-score deviations will detect early pattern variations.'
            : 'Requires 14 daily valid acoustic recordings before personalized longitudinal thresholds activate.'}
        </p>
      </div>

      {/* Quick Links / Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigateTab('trend')}
          className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-left shadow-2xs flex items-center justify-between transition"
        >
          <div>
            <span className="text-xs font-bold text-slate-900 block">30-Day Trends</span>
            <span className="text-[10px] text-slate-400">View chart trajectory</span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-teal-600" />
        </button>

        <button
          onClick={() => onNavigateTab('history')}
          className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-left shadow-2xs flex items-center justify-between transition"
        >
          <div>
            <span className="text-xs font-bold text-slate-900 block">Session History</span>
            <span className="text-[10px] text-slate-400">Filter past records</span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-teal-600" />
        </button>
      </div>
    </div>
  );
};
