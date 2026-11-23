import React, { useState } from 'react';
import { DeviceState } from '../shared/transport.ts';
import {
  Wifi,
  Bluetooth,
  Battery,
  ShieldCheck,
  CheckCircle2,
  Signal,
  ArrowRight,
  User,
  Camera,
  QrCode,
  Check,
  X,
} from 'lucide-react';

interface ConnectScreenProps {
  deviceState: DeviceState;
  onConnect: () => void;
  userEmail?: string;
}

export const ConnectScreen: React.FC<ConnectScreenProps> = ({
  deviceState,
  onConnect,
  userEmail = 'nhsststd1928@gmail.com',
}) => {
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [pairedSuccessfully, setPairedSuccessfully] = useState(false);

  const handleSimulateScan = () => {
    setPairedSuccessfully(true);
    setTimeout(() => {
      setShowQrScanner(false);
      onConnect();
    }, 800);
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-between p-6 max-w-sm mx-auto text-center">
      {/* Top Identity / User Pill */}
      <div className="flex items-center justify-between text-xs bg-white border border-slate-200/80 rounded-full px-3.5 py-1.5 shadow-2xs">
        <div className="flex items-center gap-2 text-slate-700">
          <User className="w-3.5 h-3.5 text-teal-600" />
          <span className="font-semibold truncate max-w-[170px]">{userEmail}</span>
        </div>
        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
          Signed In
        </span>
      </div>

      {/* Radar Animation */}
      <div className="my-auto py-8 space-y-6">
        <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
          {/* Pulsing radar rings */}
          <div className="absolute inset-0 rounded-full bg-teal-400/20 animate-ping duration-1000"></div>
          <div className="absolute inset-4 rounded-full bg-teal-500/15 animate-pulse"></div>
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-teal-600 to-teal-500 text-white flex flex-col items-center justify-center shadow-lg shadow-teal-500/30">
            {deviceState.transportMode === 'wifi' ? (
              <Wifi className="w-10 h-10 animate-bounce duration-1000" />
            ) : (
              <Bluetooth className="w-10 h-10 animate-bounce duration-1000" />
            )}
            <span className="text-[9px] font-bold tracking-widest uppercase mt-0.5 opacity-90">
              {deviceState.transportMode.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-slate-900">
            {deviceState.isConnected ? 'PulmoScan-AI Ready' : 'Searching for Device...'}
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {deviceState.isConnected
              ? 'Local console discovered via virtual dual-mode synchronization.'
              : 'Scan console QR code or connect via Wi-Fi handshake.'}
          </p>
        </div>

        {/* Found Device Card */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs text-left space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                PS
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">{deviceState.name}</h3>
                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Online • Firmware {deviceState.firmware}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
              <Signal className="w-3.5 h-3.5 text-teal-600" />
              <div className="flex items-center gap-0.5">
                <Battery className="w-3.5 h-3.5 text-slate-600" />
                <span>{deviceState.batteryPercent}%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div>
              <span className="text-slate-400 block text-[9px]">PROTOCOL</span>
              <strong className="text-slate-700 uppercase">{deviceState.transportMode} Sync</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[9px]">LATENCY</span>
              <strong className="text-teal-700">{deviceState.wifiLatencyMs} ms</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2.5">
        <button
          onClick={() => setShowQrScanner(true)}
          className="w-full py-3 bg-white hover:bg-slate-50 text-teal-700 border border-teal-200 rounded-2xl font-bold text-xs shadow-2xs flex items-center justify-center gap-2 transition"
        >
          <Camera className="w-4 h-4 text-teal-600" />
          <span>Scan QR Pairing Code</span>
        </button>

        <button
          onClick={onConnect}
          className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition"
        >
          <span>Connect & Open Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Camera QR Scanner Simulation Modal */}
      {showQrScanner && (
        <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white">
          <div className="w-full max-w-xs space-y-4 text-center">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                <Camera className="w-4 h-4 animate-pulse" />
                Camera QR Scanner
              </span>
              <button
                onClick={() => setShowQrScanner(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Viewfinder frame */}
            <div className="relative w-56 h-56 mx-auto border-2 border-dashed border-teal-500 rounded-3xl flex items-center justify-center bg-black/40 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-0.5 bg-teal-400 animate-bounce"></div>
              </div>
              <QrCode className="w-20 h-20 text-teal-500/40" />
              {pairedSuccessfully && (
                <div className="absolute inset-0 bg-emerald-600/90 flex flex-col items-center justify-center space-y-2 animate-in fade-in">
                  <Check className="w-10 h-10 text-white" />
                  <span className="text-xs font-bold">Handshake Verified!</span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              Point camera at the QR code in the Web Console's Android Sync modal.
            </p>

            <button
              onClick={handleSimulateScan}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-xs shadow-md transition"
            >
              Simulate Successful QR Scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

