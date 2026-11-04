// Build du rendu PDF côté serveur (processus lancé par le backend VEM, voir src/server/pdfRender.tsx) :
// un seul fichier Node (plans-server/pdf-render.mjs) + les polices à côté. jsdom n'est pas inclus : il vient des
// dépendances du backend (il charge des fichiers voisins à l'exécution).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../plans-server', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vem-pdf-fonts',
      closeBundle() {
        mkdirSync(`${outDir}/fonts`, { recursive: true });
        cpSync(fileURLToPath(new URL('./src/sheets/pdf/fonts', import.meta.url)), `${outDir}/fonts`, { recursive: true });
      },
    },
  ],
  // svg2pdf.js : son « main » (UMD) cherche jsPDF en variable globale ; l'ESM l'importe
  resolve: { alias: { 'svg2pdf.js': fileURLToPath(new URL('./node_modules/svg2pdf.js/dist/svg2pdf.es.js', import.meta.url)) } },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/server/pdfRender.tsx',
    outDir,
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      // modules optionnels de jsPDF (html(), canvas) jamais utilisés ici
      external: ['canvg', 'html2canvas', 'dompurify', 'jsdom'],
      output: { entryFileNames: 'pdf-render.mjs', format: 'es', codeSplitting: false },
    },
  },
});
