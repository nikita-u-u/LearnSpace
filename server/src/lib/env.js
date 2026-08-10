import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/**
 * Loads the monorepo .env.
 *
 * WHY THIS IS ITS OWN MODULE
 * ES module imports are fully evaluated before the importing module's body
 * runs. Calling dotenv.config() in the body of index.js was therefore too
 * late: every module index.js imports had already been evaluated and had
 * already read process.env. That silently gave middleware/auth.js the fallback
 * JWT secret while index.js signed tokens with the real one, so every
 * authenticated request failed with 401.
 *
 * Importing this module *first* in index.js fixes the ordering, because
 * imports are evaluated top to bottom.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

const result = dotenv.config({ path: path.resolve(here, '../../../.env') });

if (result.error) {
  console.warn(`⚠️  Could not read .env (${result.error.code}). Falling back to process env.`);
}

/** Fails fast in production rather than silently using an insecure default. */
const required = ['JWT_ACCESS_SECRET', 'MONGODB_URI'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  const message = `Missing required environment variables: ${missing.join(', ')}`;
  if (process.env.NODE_ENV === 'production') throw new Error(message);
  console.warn(`⚠️  ${message}`);
}

export const env = process.env;
