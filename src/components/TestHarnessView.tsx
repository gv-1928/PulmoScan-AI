import React, { useState, useEffect } from 'react';
import { runAcceptanceTests, TestResult } from '../test/suite.ts';
import { CheckCircle2, XCircle, Play, RefreshCw, ShieldCheck, ArrowLeft } from 'lucide-react';

export const TestHarnessView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runTime, setRunTime] = useState<number | null>(null);

  const executeTests = async () => {
    setIsRunning(true);
    const start = performance.now();
    try {
      const res = await runAcceptanceTests();
      setResults(res);
      setRunTime(Math.round(performance.now() - start));
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    executeTests();
  }, []);

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition"
              title="Return to Console"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-teal-600" />
              Automated Acceptance Test Suite
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Verifying all 11 core clinical engine, acoustic, BLE transport, and safety rules
            </p>
          </div>
        </div>

        <button
          onClick={executeTests}
          disabled={isRunning}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs transition"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Running tests...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Re-run All Tests
            </>
          )}
        </button>
      </div>

      {/* Summary Scorecard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Tests</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{total}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-emerald-700 uppercase tracking-wider font-semibold">Passed</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{passed}</div>
        </div>
        <div className={`p-4 rounded-xl shadow-xs border ${failed > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`text-xs uppercase tracking-wider font-semibold ${failed > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
            Failed
          </span>
          <div className={`text-2xl font-bold mt-1 ${failed > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{failed}</div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Execution Time</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{runTime !== null ? `${runTime} ms` : '—'}</div>
        </div>
      </div>

      {/* Test List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs divide-y divide-slate-100">
        {results.map((t) => (
          <div key={t.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/60 transition">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                  #{t.id}
                </span>
                <span className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                  {t.category}
                </span>
                <h3 className="text-sm font-semibold text-slate-800">{t.name}</h3>
              </div>
              <p className="text-xs text-slate-600 font-mono pl-1">{t.details}</p>
            </div>

            <div className="shrink-0 flex items-center">
              {t.passed ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  PASS
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800">
                  <XCircle className="w-3.5 h-3.5" />
                  FAIL
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
