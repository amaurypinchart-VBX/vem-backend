// Appareil (téléphone, tablette, ordinateur) : tous les choix « mobile » de l'app passent par ici. Doigt = pointeur
// grossier ; étroit ≤ 900 px ; téléphone ≤ 600 px ; iOS ; app ajoutée à l'écran d'accueil.
import { useEffect, useState } from 'react';

export interface DeviceInfo {
  isTouch: boolean;
  isNarrow: boolean;
  isPhone: boolean;
  isIOS: boolean;
  isStandalone: boolean;
}

const mq = (q: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

export function deviceInfo(): DeviceInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
  return {
    isTouch: mq('(pointer: coarse)'),
    isNarrow: mq('(max-width: 900px)'),
    isPhone: mq('(max-width: 600px)'),
    isIOS,
    isStandalone: mq('(display-mode: standalone)') || (nav as Navigator & { standalone?: boolean } | undefined)?.standalone === true,
  };
}

/** Appareil peu puissant (doigt ou ≤ 4 Go) : moins de calculs en parallèle, images plus légères. */
export function lowPowerDevice(): boolean {
  // essais (navigateur d'ordinateur en mode téléphone) : localStorage vem_plans_lowpower = 1
  try {
    if (localStorage.getItem('vem_plans_lowpower') === '1') return true;
  } catch {
    /* stockage indisponible */
  }
  const mem = (typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined) ?? 8;
  return mq('(pointer: coarse)') || mem <= 4;
}

/** Téléphone / tablette : écran étroit et doigt (mise en page mobile de l'éditeur). */
export const isMobileLayout = (d: DeviceInfo) => d.isNarrow && d.isTouch;

export function useDevice(): DeviceInfo {
  const [info, setInfo] = useState(deviceInfo);
  useEffect(() => {
    const update = () => setInfo((prev) => {
      const next = deviceInfo();
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return info;
}

/**
 * Très gros modèle (A. Pinchart 04.11.2026, Xiaomi : « je vérifiais planche par planche et ça a planté », jusqu'aux
 * autres onglets) : au-delà de ce nombre de triangles, l'ordinateur se règle comme un téléphone pour la mémoire — moins
 * de calculs en parallèle (chaque Worker garde sa copie du modèle), vues gardées limitées, pas de calcul de tout le jeu
 * d'avance. Le dessin obtenu est le même.
 */
export const BIG_MODEL_TRIANGLES = 800_000;
export function bigModel(index: { nodes: Array<{ kind: string; triangles: number }> }): boolean {
  // essais : localStorage vem_plans_bigmodel = 1 / 0 force le réglage
  try {
    const f = localStorage.getItem('vem_plans_bigmodel');
    if (f === '1' || f === '0') return f === '1';
  } catch {
    /* stockage indisponible */
  }
  let n = 0;
  for (const node of index.nodes) if (node.kind === 'mesh') n += node.triangles || 0;
  return n > BIG_MODEL_TRIANGLES;
}
