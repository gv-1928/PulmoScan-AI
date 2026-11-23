import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Radio, Send, Wifi } from 'lucide-react';
import {
  BleLinkConfig,
  BleLinkResult,
  LinkMode,
  PAPER_CONSTANTS,
  WindowAnalysis,
} from '../types/pulmoscan';
import { AnimatedNumber } from './shared';

interface BluetoothLinkPanelProps {
  bleConfig: BleLinkConfig;
  onChangeConfig: (next: BleLinkConfig) => void;
  bleResult: BleLinkResult;
  rawSamples: Float32Array;
  windows: WindowAnalysis[];
  srStatistic: number;
  srThreshold: number;
  validBaselineDays: number;
  onSyncToPhone: () => void;
}

export const BluetoothLinkPanel: React.FC<BluetoothLinkPanelProps> = ({
  bleConfig,
  onChangeConfig,
  bleResult,
  rawSamples,
  windows,
  srStatistic,
  srThreshold,
  validBaselineDays,
  onSyncToPhone,
}) => {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Bin packets into ~200 cells for compact strip
  const packetCells = useMemo(() => {
    const packets = bleResult.packets;
    if (packets.length === 0) return [];
    const targetCells = Math.min(200, packets.length);
    const step = packets.length / targetCells;
    const cells: Array<{ lost: boolean }> = [];
    for (let c = 0; c < targetCells; c++) {
      const s = Math.floor(c * step);
      const e = Math.min(packets.length, Math.max(s + 1, Math.floor((c + 1) * step)));
      let anyLost = false;
      for (let i = s; i < e; i++) {
        if (packets[i].lost) {
          anyLost = true;
          break;
        }
      }
      cells.push({ lost: anyLost });
    }
    return cells;
  }, [bleResult.packets]);

  // Waveform overlay canvas (raw faint vs reassembled mint, with lost gaps shaded)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 700;
    const height = canvas.clientHeight || 130;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#040A0E';
    ctx.fillRect(0, 0, width, height);

    const midY = height / 2;
    const amp = height * 0.42;
    const totalSamples = Math.max(1, rawSamples.length);

    // Shade lost packet ranges
    ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
    for (const pkt of bleResult.packets) {
      if (!pkt.lost) continue;
      const x1 = (pkt.sampleIndex / totalSamples) * width;
      const x2 = ((pkt.sampleIndex + pkt.payloadSamples) / totalSamples) * width;
      ctx.fillRect(x1, 0, Math.max(1.5, x2 - x1), height);
    }

    // Draw raw samples (faint slate)
    ctx.strokeStyle = 'rgba(138, 163, 160, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const s0 = Math.floor((x / width) * totalSamples);
      const s1 = Math.min(totalSamples, Math.floor(((x + 1) / width) * totalSamples) + 1);
      let minV = 0;
      let maxV = 0;
      for (let i = s0; i < s1; i++) {
        const v = rawSamples[i];
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      ctx.moveTo(x, midY - maxV * amp);
      ctx.lineTo(x, Math.max(midY - maxV * amp + 0.5, midY - minV * amp));
    }
    ctx.stroke();

    // Draw reassembled samples (mint teal)
    const reassembled = bleResult.reassembledSamples;
    ctx.strokeStyle = '#5EEAD4';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const s0 = Math.floor((x / width) * reassembled.length);
      const s1 = Math.min(
        reassembled.length,
        Math.floor(((x + 1) / width) * reassembled.length) + 1,
      );
      let minV = 0;
      let maxV = 0;
      for (let i = s0; i < s1; i++) {
        const v = reassembled[i];
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      ctx.moveTo(x, midY - maxV * amp);
      ctx.lineTo(x, Math.max(midY - maxV * amp + 0.5, midY - minV * amp));
    }
    ctx.stroke();

    ctx.restore();
  }, [bleResult, rawSamples]);

  const setField = <K extends keyof BleLinkConfig>(
    key: K,
    value: BleLinkConfig[K],
  ) => {
    onChangeConfig({ ...bleConfig, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#E8F3F1]">
          4. Personal Baseline Learning
        </h2>
        <p className="text-sm text-[#8AA3A0] mt-0.5">
          Bluetooth & normal pattern
        </p>
      </div>

      {/* Controls */}
      <div className="clinical-glass rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-0.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/15">
            {(
              [
                { mode: 'BLE' as LinkMode, label: 'Bluetooth', Icon: Radio },
                {
                  mode: 'WIFI_DEV' as LinkMode,
                  label: 'Wi-Fi (dev)',
                  Icon: Wifi,
                },
              ] as const
            ).map(({ mode, label, Icon }) => {
              const active = bleConfig.linkMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setField('linkMode', mode)}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 min-h-[36px] ${
                    active ? 'text-[#050B10]' : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="step4-link-pill"
                      className="absolute inset-0 rounded-lg bg-[#2DD4BF]"
                      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
            <span>MTU</span>
            <select
              value={bleConfig.mtuBytes}
              onChange={(e) =>
                setField('mtuBytes', Number(e.target.value) as 185 | 244 | 512)
              }
              className="px-2.5 py-1.5 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1] min-h-[36px]"
            >
              <option value={185}>185</option>
              <option value={244}>244</option>
              <option value={512}>512</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
            <span>Packet loss</span>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={bleConfig.packetLossPct}
              onChange={(e) => setField('packetLossPct', Number(e.target.value))}
              className="w-24 sm:w-28"
            />
            <span className="font-mono text-xs text-[#2DD4BF] min-w-[34px]">
              {bleConfig.packetLossPct}%
            </span>
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-[#8AA3A0]">
            <span>Seed</span>
            <input
              type="number"
              min={1}
              max={999}
              value={bleConfig.seed}
              onChange={(e) =>
                setField('seed', Math.max(1, Number(e.target.value) || 1))
              }
              className="w-16 px-2 py-1 rounded-xl bg-[#040A0E] border border-[#94E2D5]/20 font-mono text-xs text-[#E8F3F1] min-h-[36px]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-[#E8F3F1]">
          <label className="inline-flex items-center gap-2 cursor-pointer min-h-[36px]">
            <input
              type="checkbox"
              checked={bleConfig.burstMode}
              onChange={(e) => setField('burstMode', e.target.checked)}
            />
            <span>Burst loss</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer min-h-[36px]">
            <input
              type="checkbox"
              checked={bleConfig.disconnectEvent}
              onChange={(e) => setField('disconnectEvent', e.target.checked)}
            />
            <span>Disconnect event</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer min-h-[36px]">
            <input
              type="checkbox"
              checked={bleConfig.autoSend}
              onChange={(e) => setField('autoSend', e.target.checked)}
            />
            <span>Auto-send to phone</span>
          </label>
        </div>
      </div>

      {/* Transport stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
        <div className="clinical-glass rounded-xl p-3">
          <div className="text-[#8AA3A0]">Sent packets</div>
          <div className="font-mono text-base font-semibold text-[#E8F3F1] mt-0.5">
            {bleResult.sentCount}
          </div>
        </div>
        <div className="clinical-glass rounded-xl p-3">
          <div className="text-[#8AA3A0]">Received</div>
          <div className="font-mono text-base font-semibold text-[#34D399] mt-0.5">
            {bleResult.receivedCount}
          </div>
        </div>
        <div className="clinical-glass rounded-xl p-3">
          <div className="text-[#8AA3A0]">Lost</div>
          <div className="font-mono text-base font-semibold text-[#FB7185] mt-0.5">
            {bleResult.lostCount}
          </div>
        </div>
        <div className="clinical-glass rounded-xl p-3">
          <div className="text-[#8AA3A0]">Loss %</div>
          <div className="font-mono text-base font-semibold text-[#E8F3F1] mt-0.5">
            {bleResult.lossPct.toFixed(2)}%
          </div>
        </div>
        <div className="clinical-glass rounded-xl p-3">
          <div className="text-[#8AA3A0]">Max gap</div>
          <div className="font-mono text-base font-semibold text-[#E8F3F1] mt-0.5">
            {bleResult.maxGapMs.toFixed(1)} ms
          </div>
        </div>
        <div className="clinical-glass rounded-xl p-3">
          <div className="text-[#8AA3A0]">MTU</div>
          <div className="font-mono text-base font-semibold text-[#2DD4BF] mt-0.5">
            {bleResult.mtuBytes} B
          </div>
        </div>
      </div>

      {/* Packet strip */}
      <div className="instrument-panel rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-[#8AA3A0]">
          <span>Packet stream ({packetCells.length} binned cells)</span>
          <span className="font-mono">Teal = received · Hatched = lost</span>
        </div>
        <div
          className="grid gap-[1px]"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, packetCells.length)}, minmax(0, 1fr))`,
          }}
        >
          {packetCells.map((cell, i) => (
            <div
              key={i}
              className={`h-5 rounded-[1px] ${
                cell.lost
                  ? 'pattern-lost border-t border-[#94A3B8]/50'
                  : 'bg-[#2DD4BF]/75'
              }`}
            />
          ))}
        </div>
        {/* 3s window brackets */}
        <div
          className="grid gap-1 pt-1"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, windows.length)}, minmax(0, 1fr))`,
          }}
        >
          {windows.map((w) => (
            <div
              key={w.index}
              className="border-t border-x border-[#94E2D5]/25 rounded-t-sm text-center font-mono text-[10px] text-[#8AA3A0] pt-0.5"
            >
              W{w.index + 1} ({w.startSec}-{w.endSec}s)
            </div>
          ))}
        </div>
      </div>

      {/* Waveform overlay */}
      <div className="instrument-panel rounded-2xl p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8AA3A0]">
          <span>Raw vs reassembled audio</span>
          <span className="font-mono">
            Faint = raw · Mint = reassembled · Shaded = lost gap
          </span>
        </div>
        <canvas
          ref={overlayCanvasRef}
          className="w-full h-[126px] block rounded-lg"
          aria-label="Raw versus Bluetooth reassembled audio waveform overlay"
        />
      </div>

      {/* Per-window transport bars */}
      <div className="instrument-panel rounded-2xl p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8AA3A0]">
          <span>Per-window transport stats</span>
          <span className="font-mono">
            Thresholds: {PAPER_CONSTANTS.TRANSPORT_LOSS_THRESHOLD_PCT.toFixed(1)}% loss /{' '}
            {PAPER_CONSTANTS.TRANSPORT_GAP_THRESHOLD_MS.toFixed(0)} ms gap
          </span>
        </div>
        <div className="space-y-2">
          {bleResult.windowTransportStats.map((stat) => {
            const lossFill = Math.min(100, (stat.lossPct / 20) * 100);
            const gapFill = Math.min(100, (stat.maxGapMs / 100) * 100);
            const lossMarker = (2.0 / 20) * 100;
            const gapMarker = (20 / 100) * 100;
            const overLoss =
              stat.lossPct > PAPER_CONSTANTS.TRANSPORT_LOSS_THRESHOLD_PCT;
            const overGap =
              stat.maxGapMs > PAPER_CONSTANTS.TRANSPORT_GAP_THRESHOLD_MS;

            return (
              <div
                key={stat.windowIndex}
                className="grid grid-cols-12 items-center gap-2 text-xs font-mono"
              >
                <div className="col-span-2 text-[#E8F3F1]">
                  Clip {stat.windowIndex + 1}
                </div>
                <div className="col-span-5 space-y-1">
                  <div className="relative h-2.5 rounded bg-[#08141B] overflow-hidden">
                    <div
                      className={`h-full ${
                        overLoss ? 'bg-[#FB7185]' : 'bg-[#2DD4BF]'
                      }`}
                      style={{ width: `${lossFill}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-px bg-[#FBBF24]"
                      style={{ left: `${lossMarker}%` }}
                      title="2.0% loss threshold"
                    />
                  </div>
                  <div className="text-[10px] text-[#8AA3A0]">
                    Loss {stat.lossPct.toFixed(1)}%
                  </div>
                </div>
                <div className="col-span-5 space-y-1">
                  <div className="relative h-2.5 rounded bg-[#08141B] overflow-hidden">
                    <div
                      className={`h-full ${
                        overGap ? 'bg-[#FB7185]' : 'bg-[#5EEAD4]'
                      }`}
                      style={{ width: `${gapFill}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-px bg-[#FBBF24]"
                      style={{ left: `${gapMarker}%` }}
                      title="20 ms gap threshold"
                    />
                  </div>
                  <div className="text-[10px] text-[#8AA3A0]">
                    Gap {stat.maxGapMs.toFixed(1)} ms
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spec note */}
      <div className="font-mono text-xs text-[#8AA3A0] px-1">
        Header 8 B + 236 audio B = 118 samples = 7.375 ms per packet · 16 kHz ·
        16-bit · 256 kbps raw.
      </div>

      {/* Transport loss never changes alert score + Sync to phone + 14-day progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="clinical-glass rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[#E8F3F1]">
              Transport loss never changes the alert score
            </div>
            <div className="text-xs text-[#8AA3A0] mt-0.5">
              Dropped Bluetooth clips are ignored by the MAR likelihood pool.
            </div>
          </div>
          <div className="font-mono text-base font-semibold text-[#2DD4BF] shrink-0">
            Alert score <AnimatedNumber value={srStatistic} decimals={2} /> /{' '}
            {srThreshold.toFixed(1)}
          </div>
        </div>

        <div className="clinical-glass rounded-2xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-xs text-[#2DD4BF]">
                {validBaselineDays} of 14 days
              </div>
              <div className="text-xs text-[#8AA3A0]">
                Personal Baseline Learning progress
              </div>
            </div>
            <button
              type="button"
              onClick={onSyncToPhone}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] transition-colors min-h-[40px]"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sync to phone</span>
            </button>
          </div>
          <div className="h-2 rounded-full bg-[#040A0E] overflow-hidden border border-[#94E2D5]/15">
            <motion.div
              className="h-full bg-gradient-to-r from-[#2DD4BF] to-[#5EEAD4]"
              animate={{
                width: `${Math.min(100, (validBaselineDays / 14) * 100)}%`,
              }}
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
