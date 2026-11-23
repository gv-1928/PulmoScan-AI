import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { ReportSchema, ReportPayload } from './src/shared/contract.ts';
import { generateTemplateReport } from './src/shared/reportGenerator.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Support large audio base64 payloads (up to 25mb)
app.use(express.json({ limit: '25mb' }));

// Initialize GoogleGenAI SDK
const apiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    configured: !!apiKey,
    model: geminiModel,
    timestamp: new Date().toISOString(),
  });
});

// Acoustic Analysis API
app.post('/api/analyze', async (req, res) => {
  const startTime = Date.now();
  try {
    const { audioBase64, measurements, localClass, quality } = req.body;

    if (!measurements) {
      return res.status(400).json({ error: 'Missing measurements payload' });
    }

    // Safety Rule 3: If quality gate fails (q = 0), never query AI for conditions
    if (quality === 0 || measurements.qualityScore === 0) {
      const template = generateTemplateReport(measurements, 'measurement-only');
      return res.json({
        report: template,
        source: 'template_quality_gate',
        latencyMs: Date.now() - startTime,
      });
    }

    // If Gemini client is not configured, return measurement-only template immediately
    if (!aiClient) {
      console.warn('GEMINI_API_KEY not configured. Returning deterministic measurement report.');
      const template = generateTemplateReport(measurements, 'measurement-only');
      return res.json({
        report: template,
        source: 'measurement-only',
        latencyMs: Date.now() - startTime,
      });
    }

    // Prepare prompt with measurements
    const promptText = `
DEVICE MEASUREMENT DATA:
- Stand-in Local Classifier Verdict: ${localClass} (Confidence: ${(measurements.confidence * 100).toFixed(0)}%)
- Respiratory Rate: ${measurements.respiratoryRate ? `${measurements.respiratoryRate} breaths/min` : 'Unreliable / non-periodic'}
- Wheeze Burden: ${(measurements.wheezeBurden * 100).toFixed(1)}% (${measurements.wheezeCount} events, mean duration: ${measurements.wheezeMeanDuration}s)
- Crackle Burden: ${(measurements.crackleBurden * 100).toFixed(1)}% (${measurements.crackleCount} events, rate per breath: ${measurements.crackleRatePerBreath})
- Usable Audio Ratio: ${(measurements.usableAudioRatio * 100).toFixed(0)}%
- Both Wheeze & Crackle Flag: ${measurements.bothFlag ? 'TRUE' : 'FALSE'}

Please review this recording and the device's measurements. Generate the structured screening report.
`.trim();

    const parts: any[] = [];
    if (audioBase64) {
      parts.push({
        inlineData: {
          mimeType: 'audio/wav',
          data: audioBase64,
        },
      });
    }
    parts.push({ text: promptText });

    // 30 second timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API request timed out after 30s')), 30000)
    );

    const callPromise = aiClient.models.generateContent({
      model: geminiModel,
      contents: { parts },
      config: {
        systemInstruction:
          'You are a respiratory-sound screening assistant inside a research prototype. You receive an audio clip plus measurements computed by the device. Use ONLY the supplied measurements and what you can hear. Do not diagnose. Do not state the user has any disease. Do not give medication or dosing. Do not give numeric probabilities. List at most 4 possible associated conditions, each tied to a specific measurement, worded as \'may be associated with\' and to be discussed with a clinician. If quality q=0, return no conditions and only re-recording guidance. If the audio disagrees with the device\'s class, say so in audio_review. If you lack information, say so in limitations. Use plain language at a 9th-grade reading level.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: '≤ 60 words, plain language, no medical jargon',
            },
            audio_review: {
              type: Type.OBJECT,
              properties: {
                agreement: {
                  type: Type.STRING,
                  enum: ['consistent', 'differs', 'uncertain'],
                },
                note: {
                  type: Type.STRING,
                  description: '≤ 30 words explaining acoustic agreement',
                },
              },
              required: ['agreement', 'note'],
            },
            key_observations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                  meaning: { type: Type.STRING, description: '≤ 20 words' },
                },
                required: ['label', 'value', 'meaning'],
              },
            },
            possible_conditions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  why_considered: {
                    type: Type.STRING,
                    description: 'tie to a specific measurement',
                  },
                  strength: {
                    type: Type.STRING,
                    enum: ['more consistent', 'possible', 'less likely'],
                  },
                },
                required: ['name', 'why_considered', 'strength'],
              },
            },
            red_flags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'symptoms that should prompt urgent medical care',
            },
            next_steps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            limitations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'summary',
            'audio_review',
            'key_observations',
            'possible_conditions',
            'red_flags',
            'next_steps',
            'limitations',
          ],
        },
      },
    });

    const response: any = await Promise.race([callPromise, timeoutPromise]);
    const responseText = response.text;

    if (!responseText) {
      throw new Error('Empty response from model');
    }

    const rawJson = JSON.parse(responseText);
    const parsedReport = ReportSchema.parse(rawJson);

    return res.json({
      report: parsedReport,
      source: 'gemini',
      modelUsed: geminiModel,
      latencyMs: Date.now() - startTime,
    });
  } catch (error: any) {
    const isQuotaExceeded = error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED';
    
    console.error(
      isQuotaExceeded 
        ? 'Gemini Quota Exceeded. Using local deterministic fallback.' 
        : 'Gemini analysis error, using fallback template report:', 
      error?.message || error
    );

    const template = generateTemplateReport(req.body.measurements, 'measurement-only');
    
    if (isQuotaExceeded) {
      template.summary = `[QUOTA LIMIT] ${template.summary} (AI Analysis temporarily unavailable, showing local device measurements only)`;
    }

    return res.json({
      report: template,
      source: isQuotaExceeded ? 'quota_fallback' : 'measurement-only',
      error: error?.message || 'AI service error',
      isQuotaExceeded,
      latencyMs: Date.now() - startTime,
    });
  }
});

// -------------------------------------------------------------
// Live Wi-Fi Sync for Android Companion App (Expo Go)
// -------------------------------------------------------------
let latestSessionRecord: any = null;
const sseClients: Set<express.Response> = new Set();

// Publish new session from web console
app.post('/api/sync/publish', (req, res) => {
  latestSessionRecord = req.body;
  const payload = JSON.stringify(latestSessionRecord);
  sseClients.forEach((client) => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {}
  });
  res.json({ success: true, listeners: sseClients.size, timestamp: new Date().toISOString() });
});

// Fetch latest session via REST (simple poll / initial load)
app.get('/api/sync/latest', (req, res) => {
  if (!latestSessionRecord) {
    return res.status(404).json({ error: 'No session recorded yet' });
  }
  res.json(latestSessionRecord);
});

// Real-time Server-Sent Events (SSE) stream over Wi-Fi
app.get('/api/sync/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send current session if exists
  if (latestSessionRecord) {
    res.write(`data: ${JSON.stringify(latestSessionRecord)}\n\n`);
  }

  sseClients.add(res);

  // Send heartbeat keep-alive every 15 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {}
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Setup Vite middleware or static serving
async function startServer() {
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PulmoScan AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
