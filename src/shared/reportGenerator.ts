import {
  AudioMeasurements,
  ReportPayload,
} from './contract.ts';

export function generateTemplateReport(
  measurements: AudioMeasurements,
  source: 'ai' | 'measurement-only' = 'measurement-only'
): ReportPayload {
  const isPoorQuality = measurements.qualityScore === 0;

  if (isPoorQuality) {
    return {
      summary:
        'Audio quality was insufficient for acoustic analysis due to excessive background noise, clipping, or weak contact. Please repeat the recording.',
      audio_review: {
        agreement: 'uncertain',
        note: 'Quality gate discarded audio (q=0); analysis bypassed.',
      },
      key_observations: [
        {
          label: 'Signal Quality',
          value: '0% Usable',
          meaning: 'Insufficient valid audio windows detected.',
        },
        {
          label: 'Acoustic Classification',
          value: 'Repeat Recording',
          meaning: 'No clinical interpretation can be derived.',
        },
      ],
      possible_conditions: [],
      red_flags: [
        'Sudden, severe shortness of breath or inability to speak in full sentences',
        'Bluish discoloration of lips, face, or fingernails',
        'Chest pain, tightness, or lightheadedness',
      ],
      next_steps: [
        'Check sensor placement firmly against bare skin without moving',
        'Ensure the room is quiet with fans or televisions turned off',
        'Breathe naturally and deeply through an open mouth',
      ],
      limitations: [
        'Audio did not pass the initial acoustic verification threshold.',
        'No conditions or pattern statuses are assessed on discarded audio.',
      ],
    };
  }

  const { localClass, confidence, wheezeBurden, crackleCount, respiratoryRate } = measurements;
  const isWheeze = localClass === 'Wheeze';
  const isCrackle = localClass === 'Crackle';

  let summary = '';
  if (isWheeze) {
    summary = `Continuous musical sound (wheeze) observed during ${(wheezeBurden * 100).toFixed(0)}% of the breath cycle. Breathing rate was ${respiratoryRate ? `${respiratoryRate} breaths/min` : 'variable'}. Findings may indicate narrowed airway passages.`;
  } else if (isCrackle) {
    summary = `Discontinuous click-like sounds (crackles) detected (${crackleCount} events). Findings may reflect small airway opening or fluid secretions during respiration.`;
  } else {
    summary = `Normal respiratory acoustics with clear inspiratory and expiratory airflow. No predominant adventitious wheezes or crackles detected across valid segments.`;
  }

  const observations = [
    {
      label: 'Dominant Acoustic Pattern',
      value: `${localClass} (${(confidence * 100).toFixed(0)}% confidence)`,
      meaning: 'Rule-based stand-in screening classification.',
    },
    {
      label: 'Respiratory Rate',
      value: respiratoryRate ? `${respiratoryRate} bpm` : 'Variable / not periodic',
      meaning: respiratoryRate ? 'Estimated breath cycles per minute.' : 'Breathing rhythm did not exhibit uniform periodicity.',
    },
    {
      label: 'Adventitious Sound Burden',
      value: `Wheeze: ${(wheezeBurden * 100).toFixed(1)}% | Crackles: ${crackleCount}`,
      meaning: 'Temporal fraction and count of adventitious acoustic events.',
    },
    {
      label: 'Usable Audio Ratio',
      value: `${(measurements.usableAudioRatio * 100).toFixed(0)}%`,
      meaning: 'Ratio of 3-second recording windows meeting acoustic standards.',
    },
  ];

  const possible_conditions: ReportPayload['possible_conditions'] = [];

  if (isWheeze) {
    possible_conditions.push(
      {
        name: 'Reactive Airway Disease / Asthma',
        why_considered: `Associated with high expiratory musical sound burden (${(wheezeBurden * 100).toFixed(1)}%).`,
        strength: 'more consistent',
      },
      {
        name: 'Bronchial Inflammation / Bronchitis',
        why_considered: 'Airway mucosal edema causing focal flow limitation and wheezing.',
        strength: 'possible',
      },
      {
        name: 'Chronic Obstructive Airway Pattern (COPD)',
        why_considered: 'Prolonged expiratory phase with continuous acoustic wheezes.',
        strength: 'possible',
      }
    );
  } else if (isCrackle) {
    possible_conditions.push(
      {
        name: 'Lower Respiratory Secretions / Bronchiectasis',
        why_considered: `Tied to transient explosive crackle events (${crackleCount} detected).`,
        strength: 'more consistent',
      },
      {
        name: 'Alveolar Re-expansion / Early Infiltration',
        why_considered: 'Discontinuous acoustic clicks during late inspiration.',
        strength: 'possible',
      },
      {
        name: 'Pulmonary Congestion / Interstitial Pattern',
        why_considered: 'Repetitive crackles across multiple breath cycles.',
        strength: 'less likely',
      }
    );
  } else {
    possible_conditions.push({
      name: 'Unremarkable Breath Sounds',
      why_considered: 'Absence of sustained musical wheezes or discontinuous crackles.',
      strength: 'more consistent',
    });
  }

  return {
    summary,
    audio_review: {
      agreement: 'consistent',
      note: source === 'ai' ? 'Cloud model confirmed device measurements.' : 'AI unavailable — measurement-only deterministic report.',
    },
    key_observations: observations,
    possible_conditions,
    red_flags: [
      'Inability to catch breath at rest or speak full sentences without pausing',
      'Cyanosis (blue tint to lips, nails, or face)',
      'Stridor (harsh high-pitched sound heard during inhalation without stethoscope)',
      'New or worsening severe chest pain or confusion',
    ],
    next_steps: [
      'Review these findings with a licensed medical professional for clinical context',
      'Record at consistent times each day to establish personal trend accuracy',
      'Seek emergency medical evaluation immediately if experiencing any red flag symptoms',
    ],
    limitations: [
      'Research prototype only; not a diagnostic medical device.',
      'Single-site acoustic recording cannot replace comprehensive auscultation.',
      'Acoustic findings alone cannot rule in or out pulmonary pathology without clinical exam.',
    ],
  };
}
