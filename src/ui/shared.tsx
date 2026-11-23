import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { DataOrigin, PhoneStatus, QualityState } from '../types/pulmoscan';

export function useAnimatedNumber(target: number, durationMs = 360): number {
  const prefersReduced = useReducedMotion();
  const [display, setDisplay] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    if (prefersReduced || Math.abs(target - currentRef.current) < 1e-6) {
      currentRef.current = target;
      setDisplay(target);
      return;
    }

    const from = currentRef.current;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextVal = from + (target - from) * eased;
      currentRef.current = nextVal;
      setDisplay(nextVal);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        currentRef.current = target;
        setDisplay(target);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, prefersReduced]);

  return display;
}

export const AnimatedNumber: React.FC<{
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}> = ({ value, decimals = 0, suffix = '', prefix = '', className = '' }) => {
  const val = useAnimatedNumber(value);
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
};

export function getStatusVisual(status: PhoneStatus): {
  color: string;
  bg: string;
  border: string;
  glyph: string;
  isAlertTone: boolean;
} {
  switch (status) {
    case PhoneStatus.STABLE:
      return {
        color: 'text-[#34D399]',
        bg: 'bg-[#34D399]/12',
        border: 'border-[#34D399]/35',
        glyph: '●',
        isAlertTone: false,
      };
    case PhoneStatus.EARLY_WATCH:
      return {
        color: 'text-[#FBBF24]',
        bg: 'bg-[#FBBF24]/12',
        border: 'border-[#FBBF24]/35',
        glyph: '▲',
        isAlertTone: true,
      };
    case PhoneStatus.ELEVATED:
      return {
        color: 'text-[#FB7185]',
        bg: 'bg-[#FB7185]/14',
        border: 'border-[#FB7185]/40',
        glyph: '◆',
        isAlertTone: true,
      };
    case PhoneStatus.CENSORED_TODAY:
      return {
        color: 'text-[#94A3B8]',
        bg: 'bg-[#94A3B8]/14',
        border: 'border-[#94A3B8]/35',
        glyph: '○',
        isAlertTone: true,
      };
    case PhoneStatus.CALIBRATING:
      return {
        color: 'text-[#2DD4BF]',
        bg: 'bg-[#2DD4BF]/12',
        border: 'border-[#2DD4BF]/35',
        glyph: '◐',
        isAlertTone: false,
      };
    case PhoneStatus.READY:
    default:
      return {
        color: 'text-[#8AA3A0]',
        bg: 'bg-[#8AA3A0]/12',
        border: 'border-[#8AA3A0]/30',
        glyph: '○',
        isAlertTone: false,
      };
  }
}

export const StatusChip: React.FC<{
  status: PhoneStatus;
  className?: string;
}> = ({ status, className = '' }) => {
  const vis = getStatusVisual(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${vis.bg} ${vis.color} ${vis.border} ${className}`}
    >
      <span aria-hidden="true" className="text-[10px]">
        {vis.glyph}
      </span>
      <span>{status}</span>
    </span>
  );
};

export function getDataOriginLabel(origin?: DataOrigin): string {
  switch (origin) {
    case 'uploaded-file':
      return 'Uploaded audio file';
    case 'live-bluetooth':
      return 'Live Bluetooth audio';
    case 'live-wifi':
      return 'Live Wi-Fi audio';
    case 'synthetic-demo':
    default:
      return 'Demo math audio';
  }
}

export function getRecommendationText(status: PhoneStatus): string {
  switch (status) {
    case PhoneStatus.READY:
      return 'Select or upload a breathing sound in Audio Acquisition and send it to the phone view.';
    case PhoneStatus.CENSORED_TODAY:
      return 'Check that the TPU contact ring rests flat on the skin, minimize room noise, and repeat the recording.';
    case PhoneStatus.ELEVATED:
      return 'Repeat the recording while resting quietly to see if the change persists.';
    default:
      return 'Continue daily recordings in a quiet setting to maintain Personal Baseline Learning.';
  }
}

export function getQualityWord(state: QualityState): 'Good' | 'Lost' | 'Bad' {
  if (state === QualityState.VALID) return 'Good';
  if (state === QualityState.TRANSPORT_CENSORED) return 'Lost';
  return 'Bad';
}
