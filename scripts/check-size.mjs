// Fails when a built bundle grows past its gzip budget. Run after `npm run build`.
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');

const BUDGETS = [
  { file: 'packages/core/dist/index.js', gzip: 80 },
  { file: 'packages/core/dist/index.iife.js', gzip: 55 },
  { file: 'packages/vue/dist/index.js', gzip: 3 },
  { file: 'packages/react/dist/index.js', gzip: 3 }
];

let failed = false;

for (const budget of BUDGETS) {
  const content = await readFile(join(root, budget.file));
  const raw = content.byteLength / 1024;
  const gzip = gzipSync(content, { level: 9 }).byteLength / 1024;
  const ok = gzip <= budget.gzip;
  failed ||= !ok;
  console.log(
    `${ok ? '✓' : '✗'} ${budget.file}: ${raw.toFixed(1)} kB, ${gzip.toFixed(1)} kB gzip (budget ${budget.gzip} kB)`
  );
}

if (failed) {
  process.exit(1);
}
