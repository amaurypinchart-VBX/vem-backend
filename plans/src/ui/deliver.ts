// Remise d'un fichier calculé dans le navigateur (PDF, DXF). Ordinateur : téléchargement direct (inchangé). Téléphone /
// tablette : écran « PDF prêt » dont chaque bouton est un nouveau geste de l'utilisateur (iOS refuse d'ouvrir ou de
// partager un fichier après un long calcul asynchrone) : Ouvrir, Partager / Enregistrer, Fichiers du projet VEM.
import type { DeviceInfo } from './useDevice';
import { downloadBlob } from './common';

/** Limite des fichiers sur Cloudinary (fichiers du projet VEM). */
export const PROJECT_FILE_MAX = 10 * 1024 * 1024;

export type DeliveryPlan = 'download' | 'ready-screen';

export function deliveryPlan(d: Pick<DeviceInfo, 'isTouch'>): DeliveryPlan {
  return d.isTouch ? 'ready-screen' : 'download';
}

/** « 12,4 Mo » */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ko`;
  return `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** Taille estimée d'un PDF de planches (Mo) : traits ≈ 0,4 Mo par planche, image 3D ≈ 1,5 Mo (≈ 2,5 Mo hors téléphone). */
export function estimatePdfMb(sheets: number, images: number, mobile: boolean): number {
  return sheets * 0.4 + images * (mobile ? 1.5 : 2.5);
}

/** Jeu trop lourd pour un téléphone : proposer « PDF planche » ou « PDF de la sélection » avant de lancer. */
export function tooHeavyForPhone(sheets: number, mb: number): boolean {
  return sheets > 25 || mb > 40;
}

/** Ouvre le fichier dans un nouvel onglet (visionneuse PDF du téléphone). */
export function openBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** Partage (Fichiers, mail, WhatsApp…) si le navigateur sait partager un fichier, sinon téléchargement. */
export async function shareOrDownload(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(name, blob);
  return 'downloaded';
}
