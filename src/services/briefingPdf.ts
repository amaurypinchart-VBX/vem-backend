import { PDFDocument } from "pdf-lib";
// Existing Cloudinary PDF renderer; no probing pages until a network error.
export function cloudinaryPdf(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("PDF Cloudinary requis");
  }
  if (
    u.protocol !== "https:" ||
    u.hostname !== "res.cloudinary.com" ||
    u.port ||
    u.username ||
    u.password ||
    !/^\/[^/]+\/image\/upload\//.test(u.pathname) ||
    !/\.pdf$/i.test(u.pathname)
  )
    throw new Error("Ce PDF ne permet pas les aperçus Cloudinary");
  return u.href;
}
export async function pdfPageCount(
  url: string,
  download: typeof fetch = fetch,
) {
  const safe = cloudinaryPdf(url);
  const response = await download(safe, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("PDF indisponible");
  const max = 10 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > max)
    throw new Error("PDF supérieur à 10 Mo");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("PDF vide");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) throw new Error("PDF supérieur à 10 Mo");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const doc = await PDFDocument.load(Buffer.concat(chunks), {
    updateMetadata: false,
  });
  const pages = doc.getPageCount();
  if (pages < 1 || pages > 500)
    throw new Error("Le PDF doit contenir entre 1 et 500 pages");
  return pages;
}
