import React, { useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  ExternalLink,
  EyeOff,
  History,
  LineChart,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildLocal21DExplanation,
  getDominantClass,
} from '../features/pipeline';
import {
  LinkMode,
  PhonePhase,
  PhoneStatus,
  SessionAnalysisResult,
  SessionRecord,
} from '../types/pulmoscan';
import {
  AnimatedNumber,
  getRecommendationText,
  StatusChip,
} from './shared';

interface PhoneCompanionProps {
  phonePhase: PhonePhase;
  validBaselineDays: number;
  sessions: SessionRecord[];
  analysis: SessionAnalysisResult;
  linkMode: LinkMode;
  participantContext: string;
  onChangeContext: (ctx: string) => void;
  onLoadWheezeSample: () => void;
  onSeedDemo: () => void;
  onClearDemo: () => void;
  onToggleStandalone: () => void;
  onHidePhone: () => void;
  standalone?: boolean;
  onCloseDrawer?: () => void;
}

type PhoneTab = 'status' | 'history' | 'trends' | 'settings';

function getRingStrokeColor(status: PhoneStatus, isReady: boolean): string {
  if (isReady) return '#64748B';
  switch (status) {
    case PhoneStatus.ELEVATED:
      return '#FB7185';
    case PhoneStatus.EARLY_WATCH:
      return '#FBBF24';
    case PhoneStatus.CENSORED_TODAY:
      return '#94A3B8';
    case PhoneStatus.STABLE:
    case PhoneStatus.CALIBRATING:
    default:
      return '#2DD4BF';
  }
}

export const PhoneCompanion: React.FC<PhoneCompanionProps> = ({
  phonePhase,
  validBaselineDays,
  sessions,
  analysis,
  linkMode,
  participantContext,
  onChangeContext,
  onLoadWheezeSample,
  onSeedDemo,
  onClearDemo,
  onToggleStandalone,
  onHidePhone,
  standalone = false,
  onCloseDrawer,
}) => {
  const prefersReduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<PhoneTab>('status');
  const [showWhySheet, setShowWhySheet] = useState(false);
  const [showJsonTrace, setShowJsonTrace] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [glarePos, setGlarePos] = useState({ x: 50, y: 20 });

  const frameRef = useRef<HTMLDivElement | null>(null);
  const isTouch =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches;

  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const springRotX = useSpring(rotX, { stiffness: 220, damping: 24 });
  const springRotY = useSpring(rotY, { stiffness: 220, damping: 24 });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReduced || isTouch || standalone || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    rotY.set(nx * 12); // ±6 deg
    rotX.set(-ny * 12);
    setGlarePos({
      x: Math.round((nx + 0.5) * 100),
      y: Math.round((ny + 0.5) * 100),
    });
  };

  const handlePointerLeave = () => {
    rotX.set(0);
    rotY.set(0);
  };

  const [activityPart = 'Resting', timePart = 'Morning'] =
    participantContext.split(' · ');

  const latestSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const isReady = phonePhase === 'READY';
  const currentStatus = isReady ? PhoneStatus.READY : analysis.trace.status;
  const currentScore = analysis.trace.srStatistic;
  const currentThreshold = analysis.trace.srThreshold;
  const dominantClass = getDominantClass(analysis.classifier);

  const ringRadius = 52;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringRatio = isReady
    ? 0
    : Math.max(0.06, Math.min(1, currentScore / Math.max(0.1, currentThreshold)));
  const ringOffset = ringCircumference * (1 - ringRatio);
  const ringColor = getRingStrokeColor(currentStatus, isReady);
  const dotAngleRad = (-90 + ringRatio * 360) * (Math.PI / 180);
  const dotX = 64 + ringRadius * Math.cos(dotAngleRad);
  const dotY = 64 + ringRadius * Math.sin(dotAngleRad);

  const explanation = useMemo(
    () => buildLocal21DExplanation(analysis),
    [analysis],
  );

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(explanation.jsonPayload, null, 2),
      );
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const reversedSessions = useMemo(
    () => [...sessions].reverse(),
    [sessions],
  );

  // Trends SVG data
  const trendChart = useMemo(() => {
    if (sessions.length === 0) return null;
    const w = 310;
    const h = 155;
    const pL = 28;
    const pR = 12;
    const pT = 14;
    const pB = 22;
    const plotW = w - pL - pR;
    const plotH = h - pT - pB;
    const maxVal = Math.max(
      8,
      ...sessions.map((s) => s.srStatistic),
    );
    const toX = (idx: number) =>
      sessions.length === 1
        ? pL + plotW / 2
        : pL + (idx / (sessions.length - 1)) * plotW;
    const toY = (v: number) => pT + plotH - (v / maxVal) * plotH;
    const path = sessions
      .map(
        (s, idx) =>
          `${idx === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toY(s.srStatistic).toFixed(1)}`,
      )
      .join(' ');
    const threshY = toY(6.5);
    return { w, h, pL, pR, pT, pB, plotW, plotH, maxVal, toX, toY, path, threshY };
  }, [sessions]);

  const phoneBody = (
    <motion.div
      ref={frameRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={
        prefersReduced || isTouch || standalone
          ? undefined
          : {
              rotateX: springRotX,
              rotateY: springRotY,
              transformPerspective: 900,
            }
      }
      className="relative rounded-[32px] p-4 clinical-glass-strong border border-[#94E2D5]/25 shadow-[0_28px_70px_-20px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col min-h-[600px]"
    >
      {/* Moving specular glare */}
      {!prefersReduced && !isTouch && !standalone && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-35 transition-opacity"
          style={{
            background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(94, 234, 212, 0.14), transparent 55%)`,
          }}
        />
      )}

      {/* Top phone header */}
      <div className="relative z-10 flex items-center justify-between gap-2 pb-3 border-b border-[#94E2D5]/12">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-[#2DD4BF]"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-[#E8F3F1]">
            Phone View
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleStandalone}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[#94E2D5]/20 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[32px]"
            title="Standalone Tab"
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
            <span>{standalone ? 'Console View' : 'Standalone Tab'}</span>
          </button>
          {onCloseDrawer ? (
            <button
              type="button"
              onClick={onCloseDrawer}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[#94E2D5]/20 text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[32px]"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              <span>Close Phone</span>
            </button>
          ) : (
            !standalone && (
              <button
                type="button"
                onClick={onHidePhone}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[#94E2D5]/20 text-[#8AA3A0] hover:text-[#E8F3F1] hover:bg-white/5 transition-colors min-h-[32px]"
                title="Hide Phone"
              >
                <EyeOff className="w-3 h-3" aria-hidden="true" />
                <span>Hide</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Main screen content */}
      <div className="relative z-10 flex-1 py-3 overflow-y-auto space-y-3">
        {phonePhase === 'ANALYZING' && (
          <div className="instrument-panel rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full mx-auto border-2 border-[#2DD4BF]/30 border-t-[#2DD4BF] animate-spin" />
            <div className="font-mono text-xs text-[#2DD4BF]">
              Syncing summary &amp; scoring...
            </div>
            <div className="h-2 rounded-full shimmer-skeleton" />
          </div>
        )}

        {phonePhase !== 'ANALYZING' && activeTab === 'status' && (
          <div className="space-y-3">
            <div className="clinical-caption text-[#2DD4BF] text-center">
              6. ALERT GENERATION
            </div>

            {/* Circular progress ring */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg
                  width="128"
                  height="128"
                  viewBox="0 0 128 128"
                  aria-hidden="true"
                >
                  <circle
                    cx="64"
                    cy="64"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(148, 226, 213, 0.12)"
                    strokeWidth="8"
                  />
                  <motion.circle
                    cx="64"
                    cy="64"
                    r={ringRadius}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    initial={{ strokeDashoffset: ringCircumference }}
                    animate={{ strokeDashoffset: ringOffset }}
                    transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                    transform="rotate(-90 64 64)"
                  />
                  {!isReady && (
                    <circle
                      cx={dotX}
                      cy={dotY}
                      r="5"
                      fill="#E8F3F1"
                      stroke={ringColor}
                      strokeWidth="2.5"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {isReady ? (
                    <span className="font-mono text-xs font-semibold text-[#8AA3A0]">
                      READY
                    </span>
                  ) : (
                    <>
                      <span
                        className="font-mono text-xl font-bold"
                        style={{ color: ringColor }}
                      >
                        <AnimatedNumber value={currentScore} decimals={2} />
                      </span>
                      <span className="font-mono text-[10px] text-[#8AA3A0]">
                        / {currentThreshold.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-base font-semibold text-[#E8F3F1]">
                {currentStatus}
              </div>
              <div className="font-mono text-[11px] text-[#8AA3A0]">
                {participantContext} ·{' '}
                {linkMode === 'BLE' ? 'Bluetooth' : 'Wi-Fi'}
              </div>
              <p className="text-xs text-[#E8F3F1]/90 px-2 leading-relaxed">
                Recommendation:{' '}
                {isReady
                  ? 'Start a recording in Audio Acquisition.'
                  : getRecommendationText(currentStatus)}
              </p>

              <button
                type="button"
                onClick={() => setShowWhySheet(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-[#94E2D5]/25 text-[#2DD4BF] hover:bg-[#2DD4BF]/10 transition-colors min-h-[36px]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Why this result?</span>
              </button>
            </div>

            {/* Personal Baseline Learning card */}
            <div className="instrument-panel rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#E8F3F1] font-medium">
                  Personal Baseline Learning
                </span>
                <span className="font-mono text-[#2DD4BF]">
                  {Math.round((validBaselineDays / 14) * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#08141B] overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#2DD4BF] to-[#5EEAD4]"
                  animate={{
                    width: `${Math.min(100, (validBaselineDays / 14) * 100)}%`,
                  }}
                  transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                />
              </div>
              <div className="font-mono text-[11px] text-[#8AA3A0]">
                Personal Baseline Learning: {validBaselineDays} of 14 days
              </div>
            </div>

            {/* Latest check card */}
            <div className="instrument-panel rounded-2xl p-3 space-y-1.5">
              <div className="text-xs font-medium text-[#E8F3F1]">
                Latest check
              </div>
              {!latestSession && isReady ? (
                <div className="text-xs text-[#8AA3A0]">
                  <span className="font-medium text-[#E8F3F1]">None yet.</span>{' '}
                  Pick a sound on the left or tap &quot;Load wheeze sample&quot;
                  to send over Bluetooth.
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <StatusChip
                    status={latestSession ? latestSession.status : currentStatus}
                  />
                  <div className="font-mono text-xs text-[#E8F3F1]">
                    {latestSession
                      ? latestSession.dominantClass
                      : dominantClass}{' '}
                    ·{' '}
                    <span className="text-[#2DD4BF]">
                      {(latestSession
                        ? latestSession.srStatistic
                        : currentScore
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {phonePhase !== 'ANALYZING' && activeTab === 'history' && (
          <div className="space-y-2">
            {reversedSessions.length === 0 ? (
              <div className="instrument-panel rounded-2xl p-6 text-center text-xs text-[#8AA3A0]">
                No sessions yet.
              </div>
            ) : (
              reversedSessions.map((item) => (
                <div
                  key={item.id}
                  className="instrument-panel rounded-xl p-3 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-[#E8F3F1]">
                      Day {item.dayIndex} · {item.label}
                    </span>
                    {item.isSynthetic && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#8B5CF6]/20 text-[#C4B5FD] border border-[#8B5CF6]/35">
                        Demo
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-[#8AA3A0]">
                    {new Date(item.timestampIso).toLocaleString()}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusChip status={item.status} />
                    <span className="font-mono text-[#2DD4BF] font-semibold">
                      {item.srStatistic.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px] text-[#8AA3A0]">
                    <span>
                      {item.validWindows}G / {item.transportCensoredWindows}L /{' '}
                      {item.acquisitionCensoredWindows}B
                    </span>
                    <span className="text-[#E8F3F1]">{item.dominantClass}</span>
                  </div>
                  {item.censoredReason && (
                    <div className="text-[11px] text-[#FB7185]">
                      {item.censoredReason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {phonePhase !== 'ANALYZING' && activeTab === 'trends' && (
          <div className="space-y-3">
            {!trendChart ? (
              <div className="instrument-panel rounded-2xl p-6 text-center text-xs text-[#8AA3A0]">
                No trend data yet. Sync a session or seed the 30-day demo in
                Settings.
              </div>
            ) : (
              <div className="instrument-panel rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#E8F3F1]">
                    Alert Score Trend
                  </span>
                  <span className="font-mono text-[11px] text-[#8AA3A0]">
                    {sessions.length} days
                  </span>
                </div>
                <svg
                  viewBox={`0 0 ${trendChart.w} ${trendChart.h}`}
                  className="w-full h-auto block"
                  aria-label="Phone View daily alert score trend chart"
                >
                  <line
                    x1={trendChart.pL}
                    y1={trendChart.threshY}
                    x2={trendChart.w - trendChart.pR}
                    y2={trendChart.threshY}
                    stroke="#FB7185"
                    strokeDasharray="4 3"
                    strokeWidth="1"
                  />
                  <text
                    x={trendChart.w - trendChart.pR - 2}
                    y={trendChart.threshY - 4}
                    textAnchor="end"
                    fill="#FB7185"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    6.5
                  </text>

                  <motion.path
                    d={trendChart.path}
                    fill="none"
                    stroke="#2DD4BF"
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45 }}
                  />

                  {sessions.map((s, idx) => {
                    const cx = trendChart.toX(idx);
                    const cy = trendChart.toY(s.srStatistic);
                    const isSkipped = s.status === PhoneStatus.CENSORED_TODAY;
                    const color =
                      s.status === PhoneStatus.ELEVATED
                        ? '#FB7185'
                        : s.status === PhoneStatus.EARLY_WATCH
                          ? '#FBBF24'
                          : s.status === PhoneStatus.CENSORED_TODAY
                            ? '#94A3B8'
                            : '#34D399';
                    return (
                      <circle
                        key={s.id}
                        cx={cx}
                        cy={cy}
                        r="3.2"
                        fill={isSkipped ? '#040A0E' : color}
                        stroke={color}
                        strokeWidth="1.5"
                      />
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        )}

        {phonePhase !== 'ANALYZING' && activeTab === 'settings' && (
          <div className="space-y-3 text-xs">
            <div className="instrument-panel rounded-2xl p-3.5 space-y-3">
              <div className="font-semibold text-[#E8F3F1]">
                Participant context
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[#8AA3A0]">Activity</span>
                  <select
                    value={activityPart}
                    onChange={(e) =>
                      onChangeContext(`${e.target.value} · ${timePart}`)
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-[#08141B] border border-[#94E2D5]/20 text-xs text-[#E8F3F1]"
                  >
                    <option value="Resting">Resting</option>
                    <option value="Active">Active</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[#8AA3A0]">Time of day</span>
                  <select
                    value={timePart}
                    onChange={(e) =>
                      onChangeContext(`${activityPart} · ${e.target.value}`)
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-[#08141B] border border-[#94E2D5]/20 text-xs text-[#E8F3F1]"
                  >
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="instrument-panel rounded-2xl p-3.5 space-y-2.5">
              <div className="font-semibold text-[#E8F3F1]">Demo history</div>
              <button
                type="button"
                onClick={onSeedDemo}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] transition-colors min-h-[40px]"
              >
                <Database className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Seed 30-day demo history</span>
              </button>
              <button
                type="button"
                onClick={onClearDemo}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border border-[#FB7185]/35 text-[#FB7185] hover:bg-[#FB7185]/10 transition-colors min-h-[40px]"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear demo data</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div
        className="relative z-10 grid grid-cols-4 gap-1 pt-2 border-t border-[#94E2D5]/12"
        role="tablist"
        aria-label="Phone companion tabs"
      >
        {(
          [
            { id: 'status' as PhoneTab, label: 'Status', Icon: Activity },
            {
              id: 'history' as PhoneTab,
              label: `History (${sessions.length})`,
              Icon: History,
            },
            { id: 'trends' as PhoneTab, label: 'Trends', Icon: LineChart },
            { id: 'settings' as PhoneTab, label: 'Settings', Icon: Settings },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-medium transition-colors min-h-[44px] ${
                active
                  ? 'bg-[#2DD4BF]/15 text-[#2DD4BF]'
                  : 'text-[#8AA3A0] hover:text-[#E8F3F1]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" aria-hidden="true" />
              <span className="truncate max-w-full">{label}</span>
            </button>
          );
        })}
      </div>

      {/* On-phone explanation sheet */}
      <AnimatePresence>
        {showWhySheet && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="absolute inset-0 z-20 bg-[#050B10]/96 backdrop-blur-xl p-4 flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-[#94E2D5]/15">
              <div className="text-sm font-semibold text-[#E8F3F1]">
                Why this result?
              </div>
              <button
                type="button"
                onClick={() => setShowWhySheet(false)}
                className="p-1.5 rounded-lg border border-[#94E2D5]/20 text-[#8AA3A0] hover:text-[#E8F3F1]"
                aria-label="Close explanation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <p className="text-[#E8F3F1] leading-relaxed">
                {explanation.summary}
              </p>

              <ul className="space-y-1.5 list-disc list-inside text-[#8AA3A0]">
                {explanation.bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>

              <div className="space-y-1.5">
                <div className="font-semibold text-[#E8F3F1]">
                  Contributing clips
                </div>
                {explanation.contributingWindows.map((cw) => (
                  <div
                    key={cw.index}
                    className="bg-[#08141B] rounded-lg px-2.5 py-1.5 border border-[#94E2D5]/10 flex items-center justify-between font-mono text-[11px]"
                  >
                    <span className="text-[#E8F3F1]">
                      Clip {cw.index + 1} ({cw.startSec}-{cw.endSec}s)
                    </span>
                    <span className="text-[#2DD4BF]">
                      +{cw.contribution.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-[#E8F3F1]">
                  21-D feature summary
                </div>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-[#94E2D5]/15 bg-[#040A0E]">
                  <table className="w-full text-[11px] font-mono">
                    <tbody>
                      {explanation.features.map((f) => (
                        <tr
                          key={f.label}
                          className="border-b border-[#94E2D5]/8 last:border-b-0"
                        >
                          <td className="px-2 py-1 text-[#8AA3A0]">
                            {f.label}
                          </td>
                          <td className="px-2 py-1 text-right text-[#E8F3F1]">
                            {f.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowJsonTrace((v) => !v)}
                    className="inline-flex items-center gap-1 text-[#2DD4BF] font-mono text-[11px]"
                  >
                    {showJsonTrace ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    <span>JSON trace</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#94E2D5]/20 text-[11px] font-mono text-[#E8F3F1] hover:bg-white/5"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="w-3 h-3 text-[#34D399]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                {showJsonTrace && (
                  <pre className="p-2.5 rounded-lg bg-[#040A0E] border border-[#94E2D5]/15 font-mono text-[10px] text-[#8AA3A0] overflow-x-auto">
                    {JSON.stringify(explanation.jsonPayload, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (standalone) {
    return (
      <div className="max-w-md mx-auto py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-mono text-[#8AA3A0]">
            Standalone phone view · Updates live with your console
          </span>
          <button
            type="button"
            onClick={onLoadWheezeSample}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4]"
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Load wheeze sample</span>
          </button>
        </div>
        {phoneBody}
      </div>
    );
  }

  return phoneBody;
};
