import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the Vite build from client/dist to a repo-root dist.
 *
 * WHY THIS EXISTS
 * Vercel resolves its Output Directory relative to the project's Root
 * Directory setting, which lives in the dashboard and is not visible from the
 * repo. Depending on whether that field is empty or "client", Vercel looks for
 * <repo>/dist or <repo>/client/dist, and deploys kept failing with
 * "No Output Directory named dist found" whenever the two disagreed.
 *
 * Vite writes client/dist (its natural location). This mirrors it to the repo
 * root so both paths resolve and the deploy cannot break on that one field.
 * Once the Root Directory is confirmed, delete this script, drop it from the
 * root build script, and keep the single correct path.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repoRoot, 'client', 'dist');
const target = path.join(repoRoot, 'dist');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(`mirror-dist: no build found at ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

const assets = fs.readdirSync(path.join(target, 'assets'));
console.log(`mirror-dist: client/dist -> dist (${assets.length} assets)`);
