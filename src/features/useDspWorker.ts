import { DspPipelineOutput } from '../types/pulmoscan';
import { runDspPipeline } from './dsp';

let workerInstance: Worker | null = null;
let workerFailed = false;
let nextRequestId = 1;

const pending = new Map<
  number,
  {
    resolve: (val: DspPipelineOutput) => void;
    reject: (err: Error) => void;
  }
>();

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') {
    return null;
  }
  if (workerInstance) return workerInstance;

  try {
    const w = new Worker(new URL('./dsp.worker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (
      event: MessageEvent<{
        requestId: number;
        ok: boolean;
        result?: DspPipelineOutput;
        error?: string;
      }>,
    ) => {
      const { requestId, ok, result, error } = event.data;
      const entry = pending.get(requestId);
      if (!entry) return;
      pending.delete(requestId);
      if (ok && result) {
        entry.resolve(result);
      } else {
        entry.reject(new Error(error || 'DSP worker execution failed'));
      }
    };
    w.onerror = () => {
      workerFailed = true;
      workerInstance = null;
      const entries = Array.from(pending.entries());
      pending.clear();
      for (const [, entry] of entries) {
        entry.reject(new Error('DSP worker errored'));
      }
    };
    workerInstance = w;
    return w;
  } catch {
    workerFailed = true;
    return null;
  }
}

export async function runDspInWorker(samples: Float32Array): Promise<DspPipelineOutput> {
  const worker = getWorker();
  if (!worker) {
    return runDspPipeline(samples);
  }

  const requestId = nextRequestId++;
  const copy = new Float32Array(samples);

  try {
    return await new Promise<DspPipelineOutput>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      worker.postMessage({ requestId, samples: copy }, [copy.buffer]);
    });
  } catch {
    return runDspPipeline(samples);
  }
}
