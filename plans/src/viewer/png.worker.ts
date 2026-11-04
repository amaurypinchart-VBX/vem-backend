// Worker : encodage PNG des images 3D hors du fil principal (voir pngEncode.ts).
import { encodePng } from './pngEncode';

self.onmessage = (ev: MessageEvent<{ id: number; data: Uint8ClampedArray; w: number; h: number }>) => {
  const { id, data, w, h } = ev.data;
  try {
    const png = encodePng(data, w, h);
    (self as unknown as Worker).postMessage({ id, png }, [png.buffer]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: (e as Error).message });
  }
};
