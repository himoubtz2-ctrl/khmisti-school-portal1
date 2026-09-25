import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, 'server', '.env');

if (existsSync(target)) {
  console.log('server\\.env already exists; it was not overwritten.');
  process.exit(0);
}

const password = `Kh-${randomBytes(15).toString('base64url')}9`;
const env = [
  'NODE_ENV=development',
  'PORT=5000',
  'ADMIN_USER=khmisti',
  `ADMIN_PASS=${password}`,
  `ADMIN_KEY=${randomBytes(24).toString('base64url')}`,
  `SESSION_SECRET=${randomBytes(48).toString('base64url')}`,
  'TRUST_PROXY=0',
  'MAX_UPLOAD_MB=10',
  '',
].join('\n');

writeFileSync(target, env, { encoding: 'utf8', flag: 'wx' });
console.log('Created server\\.env with random local secrets.');
console.log('Admin username: khmisti');
console.log(`Admin password: ${password}`);
console.log('The secret admin key is in server\\.env; keep this file private.');
