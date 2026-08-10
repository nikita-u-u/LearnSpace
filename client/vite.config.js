import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The monorepo keeps a single .env at the root, so point Vite there instead of
// duplicating the publishable key inside client/.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' }
  },
  build: {
    // Emits to client/dist, Vite's natural location.
    //
    // The root build script then mirrors it to <repo>/dist via
    // scripts/mirror-dist.mjs, so Vercel finds the output whether its Root
    // Directory is the repo root or "client". See that script for detail.
    outDir: 'dist',
    emptyOutDir: true
  }
});
