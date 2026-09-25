/** SHA-256 hexadécimal d'un fichier (identifiant de version du modèle). */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fnv1a32(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Identifiant court et stable dérivé d'un chemin de nœud (2 × FNV-1a 32 bits = 64 bits, risque de
 * collision négligeable même sur 100 000 nœuds ; buildIndex garantit de toute façon l'unicité).
 */
export function stableId(text: string): string {
  return fnv1a32(text, 0x811c9dc5).toString(36) + fnv1a32(text, 0x01234567).toString(36);
}
