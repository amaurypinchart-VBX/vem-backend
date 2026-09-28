// Variantes d'une image Cloudinary (vignette réduite, téléchargement en fichier joint) ; les autres adresses
// (image locale, faux serveur de test) sont rendues telles quelles.
const IMAGE_UPLOAD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

export function cloudinaryVariant(url: string, transformation: string): string {
  const m = IMAGE_UPLOAD.exec(url);
  return m ? `${m[1]}${transformation}/${m[2]}` : url;
}

/** Vignette de `width` px de large au plus (jamais agrandie). */
export const thumbUrl = (url: string, width: number) => cloudinaryVariant(url, `c_limit,w_${Math.round(width)}`);

/** Adresse qui télécharge le fichier au lieu de l'ouvrir. */
export const attachmentUrl = (url: string) => cloudinaryVariant(url, 'fl_attachment');
