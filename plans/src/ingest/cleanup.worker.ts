/// <reference lib="webworker" />
import { runCleanJob } from './cleanJob';
import type { CleanJob, CleanJobResult } from './cleanJob';

self.onmessage = (e: MessageEvent<{ batch: CleanJob[] }>) => {
  try {
    const results: CleanJobResult[] = e.data.batch.map(runCleanJob);
    const transfer: Transferable[] = [];
    for (const r of results) {
      transfer.push(r.index.buffer);
      for (const a of Object.values(r.attributes)) if (!transfer.includes(a.array.buffer)) transfer.push(a.array.buffer);
    }
    (self as unknown as Worker).postMessage({ results }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: (err as Error).message || String(err) });
  }
};
