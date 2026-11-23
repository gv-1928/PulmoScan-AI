import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Wifi,
  Copy,
  Check,
  X,
  Radio,
  ExternalLink,
  Code2,
  Layers,
  ArrowRight,
  QrCode,
  KeyRound,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

interface AndroidSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidSyncModal: React.FC<AndroidSyncModalProps> = ({ isOpen, onClose }) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Persistent shared handshake pairing token
  const [handshakeToken, setHandshakeToken] = useState(() => {
    try {
      const existing = localStorage.getItem('pulmoscan_handshake_token');
      if (existing) return existing;
      const newToken = `pulmo-auth-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      localStorage.setItem('pulmoscan_handshake_token', newToken);
      return newToken;
    } catch {
      return 'pulmo-auth-EXPO99';
    }
  });

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const syncStreamUrl = `${currentHost}/api/sync/stream`;
  const syncLatestUrl = `${currentHost}/api/sync/latest`;

  // QR pairing payload format
  const pairingPayload = JSON.stringify({
    url: currentHost,
    token: handshakeToken,
    system: 'PulmoScan-AI',
    v: 1,
  });

  const handleCopy = (text: string, type: 'url' | 'curl' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else if (type === 'curl') {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleRegenerateToken = () => {
    const newToken = `pulmo-auth-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    setHandshakeToken(newToken);
    try {
      localStorage.setItem('pulmoscan_handshake_token', newToken);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                QR Pairing & Android Sync
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-bold px-2 py-0.5 rounded-full">
                  Secure Handshake
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scan QR code with the Mobile Companion app for instant network pairing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code & Handshake Token Section */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-slate-50 dark:bg-slate-950/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="sm:col-span-5 flex flex-col items-center justify-center bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <QRCodeCanvas
              value={pairingPayload}
              size={140}
              level={'M'}
              includeMargin={true}
              bgColor={'#ffffff'}
              fgColor={'#0f172a'}
            />
            <span className="text-[9px] text-slate-400 mt-2 font-mono">Scan in Mobile App</span>
          </div>

          <div className="sm:col-span-7 space-y-3">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-bold uppercase tracking-wider block">
                Shared Handshake Token
              </span>
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 mt-1">
                <span className="text-teal-600 dark:text-teal-400 font-mono text-xs font-bold">{handshakeToken}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(handshakeToken, 'token')}
                    className="text-slate-400 hover:text-teal-600 p-1"
                    title="Copy Token"
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleRegenerateToken}
              className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              <span>Regenerate Handshake Key</span>
            </button>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              This token authenticates the mobile companion connection directly with the web console over Wi-Fi.
            </p>
          </div>
        </div>

        {/* Sync Endpoints */}
        <div className="bg-slate-50 dark:bg-slate-950/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 font-mono text-xs">
          <div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-bold uppercase tracking-wider block">
              1. Real-time Wi-Fi SSE Stream
            </span>
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 mt-1">
              <span className="text-teal-600 dark:text-teal-400 truncate max-w-sm">{syncStreamUrl}</span>
              <button
                onClick={() => handleCopy(syncStreamUrl, 'url')}
                className="text-slate-400 hover:text-teal-600 p-1 shrink-0"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

