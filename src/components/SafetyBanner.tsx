import React from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export const SafetyBanner: React.FC<{ compact?: boolean }> = ({ compact }) => {
  return (
    <aside 
      aria-label="Medical Research Prototype Notice"
      className="bg-amber-500 text-slate-950 px-3.5 py-1.5 text-xs font-medium border-b border-amber-600 shadow-xs flex items-center justify-between z-50 sticky top-0"
    >
      <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
        <ShieldAlert className="w-4 h-4 text-slate-950 shrink-0" />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-bold tracking-tight">Research prototype.</span>
          <span>Not a medical device. Not a diagnosis. Not for emergencies.</span>
          {!compact && (
            <span className="text-slate-900/80 hidden sm:inline text-[11px]">
              • In severe distress, call local emergency services immediately.
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
