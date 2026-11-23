import React, { useState } from 'react';
import { SessionRecord } from '../shared/contract.ts';
import {
  Search,
  Filter,
  Trash2,
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';

interface HistoryViewProps {
  sessions: SessionRecord[];
  onSelectSession: (s: SessionRecord) => void;
  onDeleteSession: (id: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sessions,
  onSelectSession,
  onDeleteSession,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'Normal' | 'Wheeze' | 'Crackle'>('all');

  const filtered = sessions.filter((s) => {
    const matchesFilter = selectedFilter === 'all' || s.localClass === selectedFilter;
    const matchesSearch =
      s.report.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.localClass.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      new Date(s.timestamp).toLocaleDateString().includes(searchTerm);
    return matchesFilter && matchesSearch;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Stable':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'EarlyWatch':
        return <Eye className="w-4 h-4 text-amber-600" />;
      case 'ElevatedPattern':
        return <TrendingUp className="w-4 h-4 text-orange-600" />;
      case 'AcutePattern':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      default:
        return <RotateCcw className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="pb-24 pt-3 max-w-lg mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Session History</h2>
          <p className="text-xs text-slate-500">
            {sessions.length} recorded respiratory screening sessions
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by date, class, or symptoms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto">
          {(['all', 'Normal', 'Wheeze', 'Crackle'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedFilter === f
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? 'All Findings' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-400 space-y-2">
            <Calendar className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-medium">No sessions found matching your filter</p>
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs hover:shadow-xs transition flex items-center justify-between gap-3 group"
            >
              <div
                onClick={() => onSelectSession(s)}
                className="flex items-center gap-3.5 flex-1 min-w-0 cursor-pointer"
              >
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 shrink-0">
                  {getStatusIcon(s.status)}
                </div>

                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{s.localClass}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                        s.status === 'Stable'
                          ? 'bg-emerald-50 text-emerald-700'
                          : s.status === 'EarlyWatch'
                          ? 'bg-amber-50 text-amber-700'
                          : s.status === 'ElevatedPattern'
                          ? 'bg-orange-50 text-orange-700'
                          : s.status === 'AcutePattern'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {s.status}
                    </span>
                    {s.isDemoData && (
                      <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                        DEMO
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{s.report.summary}</p>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {new Date(s.timestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onDeleteSession(s.id)}
                  className="p-2 text-slate-300 hover:text-rose-600 rounded-lg transition"
                  title="Delete session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onSelectSession(s)}
                  className="p-1 text-slate-400 group-hover:text-teal-600 transition"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
