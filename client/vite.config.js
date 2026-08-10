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
    // Emits to client/dist.
    //
    // Vercel is configured for BOTH possible Root Directory settings so the
    // deploy cannot break on that one dashboard field:
    //   Root Directory = repo root -> /vercel.json       (outputDirectory: client/dist)
    //   Root Directory = client    -> /client/vercel.json (outputDirectory: dist)
    outDir: 'dist',
    emptyOutDir: true
  }
});
