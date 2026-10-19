import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Deployed to https://dukperado-hue.github.io/marswalker/ — GitHub Pages serves a
// project site under /<repo>/, so every asset URL needs that prefix (otherwise 404s).
// Moving hosts later (e.g. coolunclelab.com/...) is one variable:
//   VITE_BASE=/some/path/ npm run build      (VITE_BASE=/ for local preview)
export default defineConfig({
  base: process.env.VITE_BASE ?? '/marswalker/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep Three.js out of the Phase 1 bundle; it loads only when Phase 3/4 starts.
        manualChunks: { three: ['three'] },
      },
    },
  },
});
