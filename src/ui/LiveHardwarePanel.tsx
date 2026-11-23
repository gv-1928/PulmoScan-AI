import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Bluetooth, Radio, Square, Wifi } from 'lucide-react';
import {
  buildEstimatedBreathPhases,
  decodeAndResampleArrayBuffer,
} from '../simulation/audioPresets';
import {
  buildSingleBufferBleResult,
  LiveCaptureFinal,
  LivePacketAccumulator,
  LivePacketFormat,
} from '../transport/liveReceiver';
import { LinkMode, PAPER_CONSTANTS } from '../types/pulmoscan';

interface LiveHardwarePanelProps {
  onCaptureComplete: (
    result: LiveCaptureFinal & { linkMode: LinkMode },
  ) => void;
}

const DEFAULT_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const DEFAULT_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

function mapBleErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('disallowed') || lower.includes('permissions policy')) {
    return 'Bluetooth access is blocked inside an embedded preview frame. Open this app directly in Chrome or Edge on https:// or http://localhost:3000 to pair your sensor.';
  }
  if (lower.includes('user cancelled') || lower.includes('canceled')) {
    return 'Bluetooth pairing was cancelled before selecting a device.';
  }
  if (
    lower.includes('gatt') ||
    lower.includes('service') ||
    lower.includes('characteristic')
  ) {
    return `Connected to the Bluetooth device, but could not find the audio service/characteristic UUID. Check the Service UUID and Audio Notify UUID fields. (${msg})`;
  }
  return `Bluetooth connection failed: ${msg}`;
}

export const LiveHardwarePanel: React.FC<LiveHardwarePanelProps> = ({
  onCaptureComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'ble' | 'wifi'>('ble');

  // BLE state
  const [serviceUuid, setServiceUuid] = useState(DEFAULT_SERVICE_UUID);
  const [charUuid, setCharUuid] = useState(DEFAULT_CHAR_UUID);
  const [showAllBle, setShowAllBle] = useState(false);

  // Wi-Fi state
  const [wsUrl, setWsUrl] = useState('');
  const [httpUrl, setHttpUrl] = useState('');

  // Shared options
  const [packetFormat, setPacketFormat] = useState<LivePacketFormat>('auto');
  const [clipLengthSec, setClipLengthSec] = useState<number>(12);

  // Live capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState<LinkMode>('BLE');
  const [deviceName, setDeviceName] = useState('PulmoScan Sensor');
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [receivedPackets, setReceivedPackets] = useState(0);
  const [lostPackets, setLostPackets] = useState(0);
  const [bufferedSec, setBufferedSec] = useState(0);
  const [liveRms, setLiveRms] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const accRef = useRef<LivePacketAccumulator | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const finishedRef = useRef(false);

  const isBleSupported =
    typeof navigator !== 'undefined' &&
    'bluetooth' in navigator &&
    typeof window !== 'undefined' &&
    window.isSecureContext;

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const stopCleanup = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  };

  const finishCapture = (mode: LinkMode) => {
    if (finishedRef.current || !accRef.current) return;
    finishedRef.current = true;
    const finalized = accRef.current.finalize();
    accRef.current = null;
    stopCleanup();
    setIsCapturing(false);
    setErrorMsg(null);
    onCaptureComplete({ ...finalized, linkMode: mode });
  };

  const cancelCapture = () => {
    finishedRef.current = true;
    accRef.current = null;
    stopCleanup();
    setIsCapturing(false);
  };

  const handleBleConnect = async () => {
    setErrorMsg(null);
    if (!isBleSupported) {
      setErrorMsg(
        'Web Bluetooth is not available in this browser. Use desktop Chrome, Edge, or Android Chrome over HTTPS or localhost.',
      );
      return;
    }

    const svc = serviceUuid.trim() || DEFAULT_SERVICE_UUID;
    const chr = charUuid.trim() || DEFAULT_CHAR_UUID;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bt = (navigator as any).bluetooth;
      const device = await bt.requestDevice(
        showAllBle
          ? {
              acceptAllDevices: true,
              optionalServices: [svc, 'battery_service'],
            }
          : {
              filters: [{ services: [svc] }],
              optionalServices: ['battery_service'],
            },
      );

      const server = await device.gatt.connect();

      let batt: number | null = null;
      try {
        const battSvc = await server.getPrimaryService('battery_service');
        const battChar = await battSvc.getCharacteristic('battery_level');
        const battVal = await battChar.readValue();
        batt = battVal.getUint8(0);
      } catch {
        batt = null;
      }

      const audioSvc = await server.getPrimaryService(svc);
      const audioChar = await audioSvc.getCharacteristic(chr);

      const name = device.name || 'PulmoScan BLE Sensor';
      const acc = new LivePacketAccumulator({
        format: packetFormat,
        linkMode: 'BLE',
        deviceName: name,
        batteryPct: batt,
      });

      accRef.current = acc;
      finishedRef.current = false;
      setCaptureMode('BLE');
      setDeviceName(name);
      setBatteryPct(batt);
      setReceivedPackets(0);
      setLostPackets(0);
      setBufferedSec(0);
      setLiveRms(0);
      setIsCapturing(true);

      const onNotify = (ev: Event) => {
        if (!accRef.current || finishedRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const target = ev.target as any;
        const dv: DataView | undefined = target?.value;
        if (!dv) return;
        const copy = new Uint8Array(dv.byteLength);
        copy.set(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
        const { rms, bufferedSec: secs } = accRef.current.ingestPacket(copy.buffer);
        setReceivedPackets(accRef.current.receivedPackets);
        setLostPackets(accRef.current.lostPackets);
        setBufferedSec(secs);
        setLiveRms(rms);

        if (secs >= Math.max(3, clipLengthSec)) {
          finishCapture('BLE');
        }
      };

      const onDisconnect = () => {
        if (finishedRef.current) return;
        const currentAcc = accRef.current;
        if (currentAcc && currentAcc.bufferedSeconds >= 3) {
          finishCapture('BLE');
        } else {
          finishedRef.current = true;
          accRef.current = null;
          stopCleanup();
          setIsCapturing(false);
          setErrorMsg(
            'Bluetooth sensor disconnected before receiving 3 seconds of audio.',
          );
        }
      };

      audioChar.addEventListener('characteristicvaluechanged', onNotify);
      device.addEventListener('gattserverdisconnected', onDisconnect);

      cleanupRef.current = () => {
        try {
          audioChar.removeEventListener('characteristicvaluechanged', onNotify);
          device.removeEventListener('gattserverdisconnected', onDisconnect);
          audioChar.stopNotifications().catch(() => undefined);
          if (device.gatt?.connected) {
            device.gatt.disconnect();
          }
        } catch {
          // ignore teardown errors
        }
      };

      await audioChar.startNotifications();
    } catch (err) {
      cancelCapture();
      setErrorMsg(mapBleErrorMessage(err));
    }
  };

  const handleWsConnect = () => {
    setErrorMsg(null);
    const trimmed = wsUrl.trim();
    if (!trimmed) {
      setErrorMsg(
        'Enter a valid WebSocket address, for example ws://192.168.4.1:81/audio or wss://your-host/audio.',
      );
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setErrorMsg(
        'Enter a valid WebSocket address, for example ws://192.168.4.1:81/audio or wss://your-host/audio.',
      );
      return;
    }

    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      setErrorMsg('WebSocket address must start with ws:// or wss://.');
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      parsed.protocol === 'ws:'
    ) {
      setErrorMsg(
        'This page is loaded over HTTPS, so the browser blocks unencrypted ws:// links. Use a wss:// address (for example via a local TLS tunnel) or run the app locally on http://localhost:3000.',
      );
      return;
    }

    const hostLabel = parsed.host || 'Wi-Fi sensor';
    const acc = new LivePacketAccumulator({
      format: packetFormat,
      linkMode: 'WIFI_DEV',
      deviceName: hostLabel,
      batteryPct: null,
    });
    accRef.current = acc;
    finishedRef.current = false;

    setCaptureMode('WIFI_DEV');
    setDeviceName(hostLabel);
    setBatteryPct(null);
    setReceivedPackets(0);
    setLostPackets(0);
    setBufferedSec(0);
    setLiveRms(0);
    setIsCapturing(true);

    let opened = false;
    const ws = new WebSocket(trimmed);
    ws.binaryType = 'arraybuffer';

    const handleBuffer = (buf: ArrayBuffer) => {
      if (!accRef.current || finishedRef.current) return;
      const { rms, bufferedSec: secs } = accRef.current.ingestPacket(buf);
      setReceivedPackets(accRef.current.receivedPackets);
      setLostPackets(accRef.current.lostPackets);
      setBufferedSec(secs);
      setLiveRms(rms);
      if (secs >= Math.max(3, clipLengthSec)) {
        finishCapture('WIFI_DEV');
      }
    };

    ws.onopen = () => {
      opened = true;
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleBuffer(event.data);
      } else if (event.data instanceof Blob) {
        const buf = await event.data.arrayBuffer();
        handleBuffer(buf);
      } else if (typeof event.data === 'string') {
        try {
          const obj = JSON.parse(event.data) as {
            packetBase64?: string;
            pcm16Base64?: string;
          };
          const b64 = obj.packetBase64 || obj.pcm16Base64;
          if (b64) {
            handleBuffer(base64ToArrayBuffer(b64));
          }
        } catch {
          // ignore non-audio string messages
        }
      }
    };

    ws.onerror = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      accRef.current = null;
      stopCleanup();
      setIsCapturing(false);
      setErrorMsg(
        opened
          ? 'Wi-Fi audio stream hit a network error.'
          : `Could not connect to ${trimmed}. Check that your sensor/bridge WebSocket server is running on the same network.`,
      );
    };

    ws.onclose = () => {
      if (finishedRef.current) return;
      const currentAcc = accRef.current;
      if (currentAcc && currentAcc.bufferedSeconds >= 3) {
        finishCapture('WIFI_DEV');
      } else {
        finishedRef.current = true;
        accRef.current = null;
        stopCleanup();
        setIsCapturing(false);
        setErrorMsg(
          opened
            ? 'Wi-Fi connection closed before receiving 3 seconds of sound.'
            : `Could not connect to ${trimmed}. Check that your sensor/bridge WebSocket server is running on the same network.`,
        );
      }
    };

    cleanupRef.current = () => {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      } catch {
        // ignore close error
      }
    };
  };

  const handleHttpFetch = async () => {
    setErrorMsg(null);
    const trimmed = httpUrl.trim();
    if (!trimmed) {
      setErrorMsg(
        'Enter a valid Wi-Fi audio address, for example http://192.168.4.1/latest.wav.',
      );
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setErrorMsg(
        'Enter a valid Wi-Fi audio address, for example http://192.168.4.1/latest.wav.',
      );
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setErrorMsg('Audio URL must start with http:// or https://.');
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      parsed.protocol === 'http:'
    ) {
      setErrorMsg(
        'This page is loaded over HTTPS, so the browser blocks plain http:// fetches to local devices. Use an https:// endpoint or run locally on http://localhost:3000.',
      );
      return;
    }

    try {
      const res = await fetch(trimmed, { mode: 'cors' });
      if (!res.ok) {
        setErrorMsg(
          `Device returned HTTP ${res.status} (${res.statusText || 'error'}).`,
        );
        return;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 64) {
        setErrorMsg('The Wi-Fi endpoint returned an empty audio response.');
        return;
      }

      const lowerPath = parsed.pathname.toLowerCase();
      if (lowerPath.endsWith('.pcm') || lowerPath.endsWith('.raw')) {
        const view = new DataView(buf);
        const count = Math.floor(buf.byteLength / 2);
        const minSamples = PAPER_CONSTANTS.SAMPLE_RATE_HZ * 3;
        const maxSamples =
          PAPER_CONSTANTS.SAMPLE_RATE_HZ * PAPER_CONSTANTS.MAX_DURATION_SEC;
        const finalLen = Math.min(maxSamples, Math.max(minSamples, count));
        const samples = new Float32Array(finalLen);
        const take = Math.min(count, finalLen);
        for (let i = 0; i < take; i++) {
          samples[i] = view.getInt16(i * 2, true) / 32768;
        }
        const durationSec =
          Math.round((finalLen / PAPER_CONSTANTS.SAMPLE_RATE_HZ) * 100) / 100;
        const bleResult = buildSingleBufferBleResult(samples, 0x02);
        onCaptureComplete({
          samples,
          breathPhases: buildEstimatedBreathPhases(durationSec),
          durationSec,
          title: `${parsed.host} stream`,
          bleResult,
          deviceName: parsed.host,
          batteryPct: null,
          linkMode: 'WIFI_DEV',
        });
      } else {
        const decoded = await decodeAndResampleArrayBuffer(
          buf,
          `${parsed.host} stream`,
        );
        const bleResult = buildSingleBufferBleResult(decoded.samples, 0x02);
        onCaptureComplete({
          samples: decoded.samples,
          breathPhases: decoded.breathPhases,
          durationSec: decoded.durationSec,
          title: decoded.title,
          bleResult,
          deviceName: parsed.host,
          batteryPct: null,
          linkMode: 'WIFI_DEV',
        });
      }
    } catch {
      setErrorMsg('Wi-Fi audio stream hit a network error.');
    }
  };

  return (
    <div className="clinical-glass rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#2DD4BF]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[#E8F3F1]">
              Connect Live Sensor (Bluetooth or Wi-Fi)
            </h3>
          </div>
          <p className="text-xs text-[#8AA3A0] mt-1">
            Receive real 16 kHz audio from your chest sensor or local bridge and
            run all 6 checks on it.
          </p>
        </div>

        <div
          className="inline-flex p-1 rounded-xl bg-[#040A0E]/80 border border-[#94E2D5]/15 self-start"
          role="tablist"
          aria-label="Live sensor transport"
        >
          {(['ble', 'wifi'] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab);
                  setErrorMsg(null);
                }}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[36px] ${
                  active ? 'text-[#050B10]' : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="live-hw-tab"
                    className="absolute inset-0 rounded-lg bg-[#2DD4BF]"
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {tab === 'ble' ? (
                    <>
                      <Bluetooth className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Bluetooth LE</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Wi-Fi Stream</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isCapturing ? (
        <div className="instrument-panel rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#FB7185] animate-pulse"
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-[#E8F3F1]">
                {deviceName}
              </span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#2DD4BF]/15 text-[#2DD4BF] border border-[#2DD4BF]/30">
                {captureMode === 'BLE' ? 'BLE' : 'Wi-Fi'}
              </span>
              {batteryPct !== null && (
                <span className="font-mono text-xs text-[#8AA3A0]">
                  Battery {batteryPct}%
                </span>
              )}
            </div>
            <div className="font-mono text-xs text-[#5EEAD4]">
              {bufferedSec.toFixed(1)}s / {clipLengthSec}s
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-[#08141B] rounded-lg px-3 py-2 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0] text-[11px]">Received</div>
              <div className="text-[#E8F3F1] font-semibold">
                {receivedPackets} pkts
              </div>
            </div>
            <div className="bg-[#08141B] rounded-lg px-3 py-2 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0] text-[11px]">Lost</div>
              <div className="text-[#FB7185] font-semibold">
                {lostPackets} pkts
              </div>
            </div>
            <div className="bg-[#08141B] rounded-lg px-3 py-2 border border-[#94E2D5]/10">
              <div className="text-[#8AA3A0] text-[11px]">Live RMS</div>
              <div className="text-[#2DD4BF] font-semibold">
                {liveRms.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="h-2 rounded-full bg-[#08141B] overflow-hidden border border-[#94E2D5]/15">
              <motion.div
                className="h-full bg-gradient-to-r from-[#2DD4BF] to-[#5EEAD4]"
                animate={{ width: `${Math.min(100, Math.max(4, liveRms * 320))}%` }}
                transition={{ duration: 0.08 }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={bufferedSec < 3}
              onClick={() => finishCapture(captureMode)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[40px]"
            >
              Stop & finish
            </button>
            <button
              type="button"
              onClick={cancelCapture}
              className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/25 text-[#E8F3F1] hover:bg-white/5 transition-colors flex items-center gap-1.5 min-h-[40px]"
            >
              <Square className="w-3 h-3" aria-hidden="true" />
              Cancel
            </button>
          </div>
        </div>
      ) : activeTab === 'ble' ? (
        <div className="space-y-3">
          {!isBleSupported && (
            <div
              role="alert"
              className="rounded-xl p-3 text-xs bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Web Bluetooth is not available in this browser. Use desktop
                Chrome, Edge, or Android Chrome over HTTPS or localhost.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-[#8AA3A0]">
                BLE Audio Service UUID
              </span>
              <input
                type="text"
                value={serviceUuid}
                onChange={(e) => setServiceUuid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-[#8AA3A0]">
                Audio Notify Characteristic UUID
              </span>
              <input
                type="text"
                value={charUuid}
                onChange={(e) => setCharUuid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-[#E8F3F1] cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={showAllBle}
                onChange={(e) => setShowAllBle(e.target.checked)}
                className="rounded border-[#94E2D5]/30 bg-[#040A0E]"
              />
              <span>Show all nearby BLE devices</span>
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
              <span>Packet format</span>
              <select
                value={packetFormat}
                onChange={(e) =>
                  setPacketFormat(e.target.value as LivePacketFormat)
                }
                className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 text-xs text-[#E8F3F1] min-h-[36px]"
              >
                <option value="auto">Auto-detect packet</option>
                <option value="pulmoscan-244">PulmoScan 244-byte</option>
                <option value="raw-pcm16">Raw PCM16</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
              <span>Clip length</span>
              <select
                value={clipLengthSec}
                onChange={(e) => setClipLengthSec(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 text-xs text-[#E8F3F1] min-h-[36px]"
              >
                <option value={6}>6s clip</option>
                <option value={12}>12s clip</option>
                <option value={24}>24s clip</option>
                <option value={30}>30s clip</option>
                <option value={60}>60s clip</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleBleConnect}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#2DD4BF] to-[#5EEAD4] text-[#050B10] shadow-[0_0_20px_rgba(45,212,191,0.28)] hover:brightness-105 transition-all min-h-[44px]"
            >
              <Bluetooth className="w-4 h-4" aria-hidden="true" />
              <span>Pair & Receive Sound</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-[#8AA3A0]">
                WebSocket stream URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="ws://192.168.4.1:81/audio"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1]"
                />
                <button
                  type="button"
                  onClick={handleWsConnect}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] transition-colors min-h-[40px]"
                >
                  Receive
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-[#8AA3A0]">
                Optional HTTP audio URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={httpUrl}
                  onChange={(e) => setHttpUrl(e.target.value)}
                  placeholder="http://192.168.4.1/latest.wav"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1]"
                />
                <button
                  type="button"
                  onClick={handleHttpFetch}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[#94E2D5]/30 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[40px]"
                >
                  Fetch
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
              <span>Packet format</span>
              <select
                value={packetFormat}
                onChange={(e) =>
                  setPacketFormat(e.target.value as LivePacketFormat)
                }
                className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 text-xs text-[#E8F3F1] min-h-[36px]"
              >
                <option value="auto">Auto-detect packet</option>
                <option value="pulmoscan-244">PulmoScan 244-byte</option>
                <option value="raw-pcm16">Raw PCM16</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
              <span>Clip length</span>
              <select
                value={clipLengthSec}
                onChange={(e) => setClipLengthSec(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 text-xs text-[#E8F3F1] min-h-[36px]"
              >
                <option value={6}>6s clip</option>
                <option value={12}>12s clip</option>
                <option value={24}>24s clip</option>
                <option value={30}>30s clip</option>
                <option value={60}>60s clip</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl p-3 text-xs bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
