// Leakage check: every locale must share the exact same key tree,
// and FR/EN files must never contain Arabic characters.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'client', 'src', 'locales');

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const dicts = {};
for (const f of files) dicts[f.replace('.json', '')] = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));

const AR = /[\u0600-\u06FF]/;

function* walk(node, prefix = '', out = new Set()) {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const p = prefix ? `${prefix}.${k}` : k;
      yield* walk(v, p, out);
    }
  } else {
    yield prefix;
  }
}

const keys = {};
for (const l of Object.keys(dicts)) keys[l] = [...walk(dicts[l])].sort();

let errors = 0;
const langs = Object.keys(dicts);
const base = keys[langs[0]];
for (const l of langs) {
  const missing = base.filter((k) => !keys[l].includes(k));
  const extra = keys[l].filter((k) => !base.includes(k));
  if (missing.length) { errors += missing.length; console.error(`[${l}] MISSING keys:`, missing.join(', ')); }
  if (extra.length) { errors += extra.length; console.error(`[${l}] EXTRA keys:`, extra.join(', ')); }
}

for (const l of langs) {
  if (l === 'ar') continue;
  for (const k of keys[l]) {
    if (AR.test(k)) { errors++; console.error(`[${l}] Arabic in KEY: ${k}`); }
  }
}

// scan string VALUES (and array items) of fr/en for Arabic
function scanValues(node, prefix) {
  if (typeof node === 'string') {
    if (AR.test(node)) { errors++; console.error(`[${prefix}] Arabic char in value: "${node.slice(0, 60)}"`); }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanValues(v, `${prefix}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) scanValues(v, prefix ? `${prefix}.${k}` : k);
  }
}
for (const l of ['fr', 'en']) scanValues(dicts[l], l);

// ar file must actually contain Arabic
if (!AR.test(JSON.stringify(dicts.ar))) { errors++; console.error('[ar] No Arabic found — something is wrong.'); }

if (errors) {
  console.error(`\nFAIL: ${errors} issue(s) found.`);
  process.exit(1);
}
console.log('OK: identical key trees, no Arabic in FR/EN, AR intact.');