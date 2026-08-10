import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the build output to client/dist as well as the repo-root dist.
 *
 * WHY THIS EXISTS
 * Vercel resolves its Output Directory relative to the project's Root
 * Directory setting, which lives in the dashboard and is not visible from the
 * repo. Depending on whether that setting is empty or "client", Vercel looks
 * for either <repo>/dist or <repo>/client/dist. Deploys kept failing with
 * "No Output Directory named dist found" as the two disagreed.
 *
 * Writing the build to both locations makes the deploy succeed either way.
 * Once the Root Directory is confirmed, this mirror can be deleted and the
 * single correct path kept.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repoRoot, 'dist');
const target = path.join(repoRoot, 'client', 'dist');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(`mirror-dist: no build found at ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

const count = fs.readdirSync(path.join(target, 'assets')).length;
console.log(`mirror-dist: copied build to client/dist (${count} assets)`);
