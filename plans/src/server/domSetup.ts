// Document minimal pour svg2pdf hors navigateur (processus de rendu PDF du serveur) : jsdom, importé en premier par
// pdfRender.tsx. jsdom vient des dépendances du backend VEM (pas dans le paquet : il charge des fichiers à côté de lui).
import { createRequire } from 'node:module';

const g = globalThis as Record<string, unknown>;
if (typeof g.document === 'undefined') {
  const req = createRequire(import.meta.url);
  const { JSDOM } = req('jsdom') as { JSDOM: new (html: string) => { window: Record<string, unknown> & { getComputedStyle: (...a: unknown[]) => unknown } } };
  const w = new JSDOM('<!doctype html><html><head></head><body></body></html>').window;
  g.window = w;
  for (const k of ['document', 'DOMParser', 'XMLSerializer', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'HTMLCanvasElement', 'CSSStyleSheet', 'CSSRule', 'NodeFilter'])
    if (!(k in g)) g[k] = w[k];
  if (!('navigator' in g)) g.navigator = w.navigator;
  g.getComputedStyle = w.getComputedStyle.bind(w);
}
