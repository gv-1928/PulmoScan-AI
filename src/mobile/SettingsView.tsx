import React, { useState } from 'react';
import {
  User,
  Sliders,
  Trash2,
  Database,
  Moon,
  Sun,
  Info,
  ShieldAlert,
  Cpu,
  Wifi,
  Radio,
  FileCheck,
} from 'lucide-react';
import { DeviceState } from '../shared/transport.ts';
import { useTheme } from '../shared/themeContext.tsx';

interface SettingsViewProps {
  deviceState: DeviceState;
  onLoadDemoHistory: () => void;
  onClearAllData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  deviceState,
  onLoadDemoHistory,
  onClearAllData,
}) => {
  const { theme, setTheme } = useTheme();
  const [age, setAge] = useState('42');
  const [height, setHeight] = useState('175');
  const [weight, setWeight] = useState('70');
  const [showDevDetails, setShowDevDetails] = useState(false);

  return (
    <div className="pb-28 pt-3 max-w-lg mx-auto px-4 space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Settings & Profile</h2>
        <p className="text-xs text-slate-500">Configure participant context and demo environment</p>
      </div>

      {/* Participant Profile (Context Only) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">Participant Context</h3>
          </div>
          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            Context only
          </span>
        </div>

        <p className="text-[11px] text-slate-400">
          Used solely for clinical demographic context. Measurements and acoustic classifications
          are derived directly from physical audio recordings.
        </p>

        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100">
            <label className="text-[10px] text-slate-500 font-semibold block">Age (yrs)</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-slate-800 focus:outline-hidden"
            />
          </div>
          <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100">
            <label className="text-[10px] text-slate-500 font-semibold block">Height (cm)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-slate-800 focus:outline-hidden"
            />
          </div>
          <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100">
            <label className="text-[10px] text-slate-500 font-semibold block">Weight (kg)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Appearance / Theme */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Appearance & Theme</h3>
          </div>
          <span className="text-xs font-mono text-slate-400 capitalize">{theme} Mode</span>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
          <button
            onClick={() => setTheme('light')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
              theme === 'light'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Light</span>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
              theme === 'dark'
                ? 'bg-slate-900 text-teal-400 shadow-xs border border-slate-700'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Dark</span>
          </button>
        </div>
      </div>

      {/* Demo Controls */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900">Demo Data Management</h3>
        </div>

        <p className="text-xs text-slate-500">
          Seed 30 days of longitudinal respiratory recordings to inspect trend charts and baseline progression.
        </p>

        <div className="space-y-2 pt-1">
          <button
            onClick={onLoadDemoHistory}
            className="w-full py-2.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <Database className="w-3.5 h-3.5 text-teal-600" />
            Seed 30-Day Demo History (DEMO DATA)
          </button>

          <button
            onClick={onClearAllData}
            className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            Clear All Stored Sessions
          </button>
        </div>
      </div>

      {/* Developer & Hardware Diagnostics */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <button
          onClick={() => setShowDevDetails(!showDevDetails)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-900">Hardware & Transport Diagnostics</h3>
          </div>
          <span className="text-xs text-teal-600 font-semibold">
            {showDevDetails ? 'Hide' : 'Inspect'}
          </span>
        </button>

        {showDevDetails && (
          <div className="pt-2 border-t border-slate-100 space-y-2 text-xs font-mono text-slate-600">
            <div className="flex justify-between">
              <span>Device Name:</span>
              <strong className="text-slate-800">{deviceState.name}</strong>
            </div>
            <div className="flex justify-between">
              <span>Firmware Version:</span>
              <span>{deviceState.firmware}</span>
            </div>
            <div className="flex justify-between">
              <span>Active Transport:</span>
              <span className="uppercase text-teal-700 font-bold">{deviceState.transportMode}</span>
            </div>
            <div className="flex justify-between">
              <span>BLE Negotiated MTU:</span>
              <span>{deviceState.mtu} bytes</span>
            </div>
            <div className="flex justify-between">
              <span>Simulated Latency:</span>
              <span>{deviceState.wifiLatencyMs} ms</span>
            </div>
            <div className="flex justify-between">
              <span>Battery Level:</span>
              <span>{deviceState.batteryPercent}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Safety Notice Card */}
      <div className="bg-amber-50/80 border border-amber-200/80 rounded-3xl p-4 text-xs text-amber-900 space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-amber-950">
          <ShieldAlert className="w-4 h-4 text-amber-700" />
          <span>Clinical Prototype Disclaimer</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          PulmoScan AI is a software prototype created for demonstrative and investigational purposes.
          It does not provide diagnosis or treatment advice. Always seek immediate clinical care for emergency symptoms.
        </p>
      </div>
    </div>
  );
};
