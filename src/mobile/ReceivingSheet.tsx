import React from 'react';
import { Wifi, Bluetooth, RefreshCw, AlertCircle } from 'lucide-react';
import { TransportType } from '../shared/contract.ts';

interface ReceivingSheetProps {
  isOpen: boolean;
  receivedCount: number;
  totalCount: number;
  transport: TransportType;
  isRecovering?: boolean;
}

export const ReceivingSheet: React.FC<ReceivingSheetProps> = ({
  isOpen,
  receivedCount,
  totalCount,
  transport,
  isRecovering,
}) => {
  if (!isOpen) return null;

  const pct = totalCount > 0 ? Math.min(100, Math.round((receivedCount / totalCount) * 100)) : 10;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="56"
              cy="56"
              r="48"
              className="stroke-slate-100"
              strokeWidth="8"
              fill="transparent"
            />
            <circle
              cx="56"
              cy="56"
              r="48"
              className="stroke-teal-600 transition-all duration-150 ease-out"
              strokeWidth="8"
              strokeDasharray={2 * Math.PI * 48}
              strokeDashoffset={2 * Math.PI * 48 * (1 - pct / 100)}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {transport === 'wifi' ? (
              <Wifi className="w-8 h-8 text-teal-600 animate-pulse" />
            ) : (
              <Bluetooth className="w-8 h-8 text-teal-600 animate-pulse" />
            )}
            <span className="text-xs font-bold text-slate-700 mt-1 font-mono">{pct}%</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-slate-900">
            {isRecovering ? 'Recovering Missing Packets...' : 'Receiving Respiratory Report'}
          </h3>
          <p className="text-xs text-slate-500">
            {transport === 'wifi'
              ? 'High-speed encrypted local sync in progress'
              : `Virtual BLE reassembly: ${receivedCount} of ${totalCount || '...'} chunks`}
          </p>
        </div>

        {isRecovering && (
          <div className="flex items-center justify-center gap-2 bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-xl border border-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>NACK retransmission in progress...</span>
          </div>
        )}

        <div className="pt-1">
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-teal-600 h-full transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1.5 font-mono">
            <span>Device: PulmoScan-AI</span>
            <span>CRC16 Guard Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
