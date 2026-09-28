// Cloudinary refuse les images de plus de 10 Mo : une capture plus lourde (8000 px, beaucoup de détails) est réduite
// par paliers avant l'envoi, jusqu'à passer sous la limite. Le fichier pleine résolution reste téléchargeable.
export const UPLOAD_MAX_BYTES = 9.5 * 1024 * 1024;

export async function fitImageBytes(
  blob: Blob,
  width: number,
  height: number,
  maxBytes = UPLOAD_MAX_BYTES,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (blob.size <= maxBytes) return { blob, width, height };
  const bitmap = await createImageBitmap(blob);
  try {
    let out = blob;
    let w = width;
    let h = height;
    let factor = Math.sqrt(maxBytes / blob.size) * 0.9;
    for (let i = 0; i < 5 && out.size > maxBytes; i++) {
      w = Math.max(1, Math.round(width * factor));
      h = Math.max(1, Math.round(height * factor));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      out = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Réduction de l’image impossible'))), 'image/png'));
      factor *= Math.sqrt(maxBytes / out.size) * 0.9;
    }
    return { blob: out, width: w, height: h };
  } finally {
    bitmap.close();
  }
}
