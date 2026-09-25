/// <reference lib="webworker" />
// Worker du moteur 2D : garde en mémoire le dernier sous-ensemble reçu, calcule les vues demandées.
import { computeView } from './hlr';
import type { HlrJob, HlrPacket } from './hlr';

type In = { type: 'packet'; key: string; packet: HlrPacket } | { type: 'view'; id: number; key: string; job: HlrJob };

let current: { key: string; packet: HlrPacket } | null = null;
const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<In>) => {
  const msg = e.data;
  if (msg.type === 'packet') {
    current = { key: msg.key, packet: msg.packet };
    return;
  }
  const { id, key, job } = msg;
  try {
    if (!current || current.key !== key) throw new Error('sous-ensemble absent du Worker');
    const lw = computeView(current.packet, job, (fraction, message) => post({ type: 'progress', id, fraction, message }));
    const transfer: Transferable[] = [lw.snapPoints.buffer];
    for (const l of lw.layers) for (const p of l.polylines) transfer.push(p.buffer);
    post({ type: 'result', id, linework: lw }, transfer);
  } catch (err) {
    post({ type: 'error', id, message: (err as Error).message || String(err) });
  }
};
