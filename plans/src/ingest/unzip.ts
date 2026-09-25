// Lecture d'un upload : .zip (.dae + textures + manifest.json), .dae seul, ou .glb.
import { unzipSync, strFromU8 } from 'fflate';

export interface SourceBundle {
  format: 'dae' | 'glb';
  modelName: string;
  daeText?: string;
  glb?: ArrayBuffer;
  manifestText?: string;
  /** nom de fichier en minuscules (sans dossier) → contenu, pour les textures */
  assets: Map<string, Uint8Array>;
}

export function baseName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

function extOf(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

export function readSourceBundle(fileName: string, data: ArrayBuffer): SourceBundle {
  const ext = extOf(fileName);
  if (ext === 'dae') {
    return { format: 'dae', modelName: fileName, daeText: new TextDecoder().decode(data), assets: new Map() };
  }
  if (ext === 'glb') {
    return { format: 'glb', modelName: fileName, glb: data, assets: new Map() };
  }
  if (ext !== 'zip') throw new Error(`Format non géré : .${ext} (attendu .zip, .dae ou .glb)`);

  const entries = unzipSync(new Uint8Array(data));
  const names = Object.keys(entries).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'));
  const daes = names.filter((n) => extOf(n) === 'dae');
  const glbs = names.filter((n) => extOf(n) === 'glb');
  const assets = new Map<string, Uint8Array>();
  for (const n of names) assets.set(baseName(n).toLowerCase(), entries[n]);
  const manifestName = names.find((n) => baseName(n).toLowerCase() === 'manifest.json');
  const manifestText = manifestName ? strFromU8(entries[manifestName]) : undefined;

  if (daes.length > 0) {
    // Plusieurs .dae : on prend celui qui est à côté du manifest.json (export de l'extension Viewbox).
    const dirOf = (n: string) => n.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const chosen = daes.length === 1 ? daes[0] : manifestName ? daes.find((d) => dirOf(d) === dirOf(manifestName)) : undefined;
    if (!chosen) {
      throw new Error(`L'archive contient ${daes.length} fichiers .dae (${daes.map(baseName).join(', ')}) : n'en garde qu'un`);
    }
    return { format: 'dae', modelName: baseName(chosen), daeText: strFromU8(entries[chosen]), manifestText, assets };
  }
  if (glbs.length > 0) {
    const u8 = entries[glbs[0]];
    return {
      format: 'glb',
      modelName: baseName(glbs[0]),
      glb: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer,
      manifestText,
      assets,
    };
  }
  throw new Error("Aucun fichier .dae ou .glb trouvé dans l'archive");
}
