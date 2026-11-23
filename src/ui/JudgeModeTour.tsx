import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { ConsoleStepId, UtilityModalId } from '../types/pulmoscan';

export interface TourChapter {
  title: string;
  description: string;
  step: ConsoleStepId;
  modal?: UtilityModalId;
}

const TOUR_CHAPTERS: TourChapter[] = [
  {
    title: '1. Audio Acquisition',
    description:
      'Pick a demo sound, upload your own, or pair a live Bluetooth or Wi-Fi sensor.',
    step: 'input',
  },
  {
    title: '2. Quality Checking',
    description:
      'Checks audio clarity, noise and packet loss across each 3-second clip.',
    step: 'quality-gate',
  },
  {
    title: '3. CNN Classification',
    description:
      'Identifies Normal, Wheeze and Crackle sounds in the good clips.',
    step: 'classifier',
  },
  {
    title: '4. Personal Baseline Learning',
    description:
      'Learns your normal pattern over 14 good days. Bluetooth link settings live here.',
    step: 'sync',
  },
  {
    title: '5. Abnormality Detection',
    description:
      'Spots unusual and persistent changes against your own baseline.',
    step: 'detector',
  },
  {
    title: '6. Alert Generation',
    description: 'Shows your status and what to do next.',
    step: 'alert-gen',
  },
  {
    title: 'Sensor',
    description: 'See the hardware that captures the sound.',
    step: 'input',
    modal: 'hardware',
  },
  {
    title: 'Self-check',
    description: 'Live checks prove each tool works.',
    step: 'input',
    modal: 'acceptance',
  },
  {
    title: 'Session report',
    description: 'A printable summary of this session.',
    step: 'alert-gen',
    modal: 'clinical-pdf',
  },
  {
    title: 'Data source',
    description: 'Exactly where every number comes from.',
    step: 'input',
    modal: 'data-source',
  },
];

interface JudgeModeTourProps {
  open: boolean;
  onClose: () => void;
  onNavigateChapter: (target: {
    step: ConsoleStepId;
    modal?: UtilityModalId;
  }) => void;
}

export const JudgeModeTour: React.FC<JudgeModeTourProps> = ({
  open,
  onClose,
  onNavigateChapter,
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      return;
    }
    const ch = TOUR_CHAPTERS[index];
    onNavigateChapter({ step: ch.step, modal: ch.modal ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        setIndex((prev) => Math.min(TOUR_CHAPTERS.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const chapter = TOUR_CHAPTERS[index];
  const progressPct = ((index + 1) / TOUR_CHAPTERS.length) * 100;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Soft dimmed backdrop + spotlight aura */}
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="no-print fixed inset-0 z-40 pointer-events-none bg-[#03070B]/45"
            style={{
              background:
                'radial-gradient(ellipse 65% 45% at 50% 42%, rgba(45, 212, 191, 0.08), rgba(3, 7, 11, 0.62) 72%)',
            }}
          />

          <motion.div
            role="dialog"
            aria-label="Quick tour"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="no-print fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-lg clinical-glass-strong rounded-2xl p-4 sm:p-5 space-y-3 shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-[#2DD4BF]">
                Quick tour · Step {index + 1} of {TOUR_CHAPTERS.length}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-[#94E2D5]/25 text-[#8AA3A0] hover:text-[#E8F3F1]"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Exit</span>
              </button>
            </div>

            <div className="h-1 rounded-full bg-[#040A0E] overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#2DD4BF] to-[#5EEAD4]"
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>

            <div>
              <h3 className="text-base font-semibold text-[#E8F3F1]">
                {chapter.title}
              </h3>
              <p className="text-xs text-[#8AA3A0] mt-1">
                {chapter.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="font-mono text-[11px] text-[#8AA3A0]">
                Keys: ← / → chapters · Esc exit
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border border-[#94E2D5]/25 text-[#E8F3F1] hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Back</span>
                </button>
                {index < TOUR_CHAPTERS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setIndex((i) =>
                        Math.min(TOUR_CHAPTERS.length - 1, i + 1),
                      )
                    }
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] min-h-[36px]"
                  >
                    <span>Next</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#2DD4BF] text-[#050B10] hover:bg-[#5EEAD4] min-h-[36px]"
                  >
                    <span>Finish</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
