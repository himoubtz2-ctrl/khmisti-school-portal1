// ---------------------------------------------------------------------------
// env.js — loads server/.env into process.env exactly once.
// It must be imported BEFORE any module that reads process.env at load time
// (notably db.js, which hashes ADMIN_PASS while seeding).
// ESM evaluates imports depth-first in source order, so db.js importing this
// file first guarantees the variables exist before the seed runs.
// ---------------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const envFile = path.join(__dirname, '.env');
  if (existsSync(envFile)) {
    for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i <= 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
} catch {}

export const envLoaded = true;
