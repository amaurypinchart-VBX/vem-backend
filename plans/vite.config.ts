/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Le module est servi par l'Express de VEM à l'adresse /plans/ (build dans public/plans).
export default defineConfig({
  base: '/plans/',
  plugins: [react()],
  build: {
    outDir: '../public/plans',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
  server: {
    // En dev (npm run dev), les appels /api sont relayés vers le backend VEM local.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    // svg2pdf.js : sous Node, son « main » (UMD) cherche jsPDF en variable globale ; l'ESM (celui du build) l'importe
    alias: { 'svg2pdf.js': fileURLToPath(new URL('./node_modules/svg2pdf.js/dist/svg2pdf.es.js', import.meta.url)) },
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
});
