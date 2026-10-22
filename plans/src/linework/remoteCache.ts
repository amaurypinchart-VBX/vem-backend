// Cache des vues partagé par le serveur VEM : une vue calculée sur un ordinateur est envoyée au serveur (même clé
// que le cache IndexedDB), un téléphone la télécharge au lieu de refaire le calcul (trop lourd pour sa mémoire).
// Format : « VLW1 » + longueur de l'en-tête + en-tête JSON (tableaux typés remplacés par {$t, o, n}) + données
// binaires alignées sur 8 octets, le tout compressé gzip. Les nombres sont copiés à l'identique (aucun arrondi).
import { gunzipSync, gzipSync } from 'fflate';
import type { Linework2D } from './types';

type TypedName = 'f64' | 'f32' | 'u32' | 'i32' | 'u16' | 'u8';
type Typed = Float64Array | Float32Array | Uint32Array | Int32Array | Uint16Array | Uint8Array;
const CTORS = { f64: Float64Array, f32: Float32Array, u32: Uint32Array, i32: Int32Array, u16: Uint16Array, u8: Uint8Array } as const;

function typedName(v: unknown): TypedName | null {
  if (v instanceof Float64Array) return 'f64';
  if (v instanceof Float32Array) return 'f32';
  if (v instanceof Uint32Array) return 'u32';
  if (v instanceof Int32Array) return 'i32';
  if (v instanceof Uint16Array) return 'u16';
  if (v instanceof Uint8Array) return 'u8';
  return null;
}

const MAGIC = [0x56, 0x4c, 0x57, 0x31]; // VLW1

export function encodeLinework(lw: Linework2D): Uint8Array {
  const arrays: Typed[] = [];
  let offset = 0;
  const offsets: number[] = [];
  const header = JSON.stringify(lw, function (_k, v) {
    const t = typedName(v);
    if (!t) return v;
    const a = v as Typed;
    offset = Math.ceil(offset / 8) * 8;
    offsets.push(offset);
    arrays.push(a);
    const o = offset;
    offset += a.byteLength;
    return { $t: t, o, n: a.length };
  });
  const head = new TextEncoder().encode(header);
  const start = Math.ceil((8 + head.length) / 8) * 8;
  const out = new Uint8Array(start + offset);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, head.length, true);
  out.set(head, 8);
  arrays.forEach((a, i) => out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), start + offsets[i]));
  return gzipSync(out, { level: 6 });
}

export function decodeLinework(bytes: Uint8Array): Linework2D {
  const raw = gunzipSync(bytes);
  if (raw.length < 8 || MAGIC.some((m, i) => raw[i] !== m)) throw new Error('Vue partagée illisible');
  const len = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(4, true);
  const header = new TextDecoder().decode(raw.subarray(8, 8 + len));
  const start = Math.ceil((8 + len) / 8) * 8;
  return JSON.parse(header, (_k, v) => {
    if (!v || typeof v !== 'object' || typeof v.$t !== 'string' || !(v.$t in CTORS)) return v;
    const C = CTORS[v.$t as TypedName];
    // copie alignée (le tampon décompressé n'est pas forcément aligné pour Float64Array)
    const bytesLen = v.n * C.BYTES_PER_ELEMENT;
    const copy = new Uint8Array(bytesLen);
    copy.set(raw.subarray(start + v.o, start + v.o + bytesLen));
    return new C(copy.buffer);
  }) as Linework2D;
}

/** Vue partagée la plus lourde envoyée au serveur (après compression). */
export const REMOTE_MAX_BYTES = 8 * 1024 * 1024;

export interface RemoteLineworkCache {
  get(key: string, signal?: AbortSignal): Promise<Linework2D | null>;
  put(key: string, lw: Linework2D): void;
  /** vue trouvée dans le cache local : envoyée au serveur s'il ne l'a pas encore (vues calculées avant le partage) */
  share(key: string, lw: Linework2D): void;
}

/** Cache partagé par le serveur VEM (lecture puis envoi en arrière-plan, sans jamais faire échouer une vue). */
export function serverLineworkCache(
  modelKey: string,
  io: {
    get(key: string, signal?: AbortSignal): Promise<Uint8Array | null>;
    has(key: string): Promise<boolean>;
    put(key: string, modelKey: string, bytes: Uint8Array): Promise<void>;
  },
): RemoteLineworkCache {
  const sent = new Set<string>();
  const self: RemoteLineworkCache = {
    async get(key, signal) {
      try {
        const bytes = await io.get(key, signal);
        if (!bytes) return null;
        sent.add(key);
        return decodeLinework(bytes);
      } catch {
        return null;
      }
    },
    put(key, lw) {
      if (sent.has(key)) return;
      sent.add(key);
      // envoi après le rendu (compression hors du chemin critique)
      setTimeout(() => {
        try {
          const bytes = encodeLinework(lw);
          if (bytes.length > REMOTE_MAX_BYTES) return;
          void io.put(key, modelKey, bytes).catch(() => undefined);
        } catch {
          /* rien : la vue reste dans le cache local */
        }
      }, 50);
    },
    share(key, lw) {
      if (sent.has(key)) return;
      sent.add(key);
      void io
        .has(key)
        .then((has) => {
          if (has) return;
          sent.delete(key);
          self.put(key, lw);
        })
        .catch(() => undefined);
    },
  };
  return self;
}
