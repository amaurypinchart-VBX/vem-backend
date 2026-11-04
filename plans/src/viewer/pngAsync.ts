// PNG des captures encodé dans un Worker (la page reste réactive) ; sans Worker (tests), sur place.
import { encodePng } from './pngEncode';

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./png.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<{ id: number; png?: Uint8Array; error?: string }>) => {
      const w = waiting.get(ev.data.id);
      if (!w) return;
      waiting.delete(ev.data.id);
      if (ev.data.png) w.resolve(ev.data.png);
      else w.reject(new Error(ev.data.error ?? 'Encodage PNG impossible'));
    };
    worker.onerror = () => {
      for (const w of waiting.values()) w.reject(new Error('Encodage PNG impossible'));
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Blob PNG des pixels RVBA (non prémultipliés, haut en bas). Les pixels sont transférés au Worker (inutilisables ensuite). */
export async function pngBlob(data: Uint8ClampedArray, w: number, h: number): Promise<Blob> {
  const wk = getWorker();
  const png = wk
    ? await new Promise<Uint8Array>((resolve, reject) => {
        const id = ++seq;
        waiting.set(id, { resolve, reject });
        wk.postMessage({ id, data, w, h }, [data.buffer]);
      })
    : encodePng(data, w, h);
  return new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}
