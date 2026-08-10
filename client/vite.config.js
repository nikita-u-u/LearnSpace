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
    // Output to a top-level `dist` at the repository root.
    //
    // Vercel looks for an output directory named `dist` and kept failing with
    // "No Output Directory named dist found" when the build wrote to
    // client/dist. Emitting to the repo root makes the location match what
    // Vercel expects by default, so the deploy no longer depends on getting
    // the Root Directory and Output Directory settings to agree.
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true
  }
});
