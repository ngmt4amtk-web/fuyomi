// tests/*.test.mjs を全部拾って回す。外部依存なし（node:test / node:assert のみ）。
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from 'node:test';
import { spec as SpecReporter } from 'node:test/reporters';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort().map(f => join(here, f));
if (files.length === 0) { console.error('テストファイルが1つもない'); process.exit(1); }
let failed = 0;
const stream = run({ files, concurrency: 1 });
stream.on('test:fail', () => { failed++; });
stream.compose(new SpecReporter()).pipe(process.stdout);
stream.on('end', () => process.exit(failed ? 1 : 0));
