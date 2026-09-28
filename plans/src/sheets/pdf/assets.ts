// Ce que l'export PDF intègre, chargé à la demande dans le navigateur : polices TTF (seulement les variantes
// utilisées) et images 3D réduites au besoin : PNG si elles ont de la transparence (les vues 3D de la couverture se
// chevauchent), sinon JPEG, bien plus léger.
import type { FontFiles, FontKey } from './pdf';
import gelasioRegular from './fonts/Gelasio-Regular.ttf?url';
import gelasioBold from './fonts/Gelasio-Bold.ttf?url';
import gelasioItalic from './fonts/Gelasio-Italic.ttf?url';
import gelasioBoldItalic from './fonts/Gelasio-BoldItalic.ttf?url';
import arimoRegular from './fonts/Arimo-Regular.ttf?url';
import arimoBold from './fonts/Arimo-Bold.ttf?url';
import arimoItalic from './fonts/Arimo-Italic.ttf?url';
import arimoBoldItalic from './fonts/Arimo-BoldItalic.ttf?url';

const FONT_URLS: Record<FontKey, string> = {
  'Gelasio-normal': gelasioRegular,
  'Gelasio-bold': gelasioBold,
  'Gelasio-italic': gelasioItalic,
  'Gelasio-bolditalic': gelasioBoldItalic,
  'Arimo-normal': arimoRegular,
  'Arimo-bold': arimoBold,
  'Arimo-italic': arimoItalic,
  'Arimo-bolditalic': arimoBoldItalic,
};

export async function loadFonts(keys: FontKey[]): Promise<FontFiles> {
  const out: FontFiles = {};
  await Promise.all(
    keys.map(async (k) => {
      const res = await fetch(FONT_URLS[k]);
      if (!res.ok) throw new Error(`Police ${k} introuvable (${res.status})`);
      out[k] = await res.arrayBuffer();
    }),
  );
  return out;
}

/** Plus grand côté des images 3D dans le PDF (px) : ≈ 180 dpi sur une image de 335 mm (planche A1). */
const MAX_IMAGE_PX = 3000;

/** Image 3D (URL Cloudinary ou blob:) → data URL pour le PDF, au plus MAX_IMAGE_PX de côté. */
export async function pdfImageDataUrl(url: string, jpegQuality = 0.92): Promise<string> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Image 3D inaccessible (${res.status})`);
  const bmp = await createImageBitmap(await res.blob());
  const k = Math.min(1, MAX_IMAGE_PX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let transparent = false;
  for (let i = 3; i < px.length; i += 4)
    if (px[i] < 255) {
      transparent = true;
      break;
    }
  if (transparent) return canvas.toDataURL('image/png');
  return canvas.toDataURL('image/jpeg', jpegQuality);
}
