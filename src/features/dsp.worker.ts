import { runDspPipeline } from './dsp';

self.onmessage = (event: MessageEvent<{ requestId: number; samples: Float32Array }>) => {
  const { requestId, samples } = event.data;
  try {
    const result = runDspPipeline(samples);
    self.postMessage({ requestId, ok: true, result });
  } catch (err) {
    self.postMessage({
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
