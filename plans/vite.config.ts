/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
});
