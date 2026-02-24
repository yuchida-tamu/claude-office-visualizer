/**
 * Build script: Bundle the CLI entry point as a single standalone JS file.
 *
 * The CLI bundle is a self-contained ESM file that imports commands lazily.
 * A shebang line is prepended so it can be executed directly.
 */
import { readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CLI_ENTRY = path.resolve(import.meta.dir, '../cli/src/cli.ts');
const CLI_OUT = path.resolve(import.meta.dir, '../dist/cli.js');

// Ensure output directory exists
mkdirSync(path.dirname(CLI_OUT), { recursive: true });

const result = await Bun.build({
  entrypoints: [CLI_ENTRY],
  outdir: path.dirname(CLI_OUT),
  target: 'bun',
  format: 'esm',
  naming: 'cli.js',
});

if (!result.success) {
  console.error('Failed to build CLI:', result.logs);
  process.exit(1);
}

// Prepend shebang only if Bun did not already add one
const content = readFileSync(CLI_OUT, 'utf-8');
if (!content.startsWith('#!')) {
  writeFileSync(CLI_OUT, `#!/usr/bin/env bun\n${content}`);
}
chmodSync(CLI_OUT, 0o755);

console.log('Built: dist/cli.js (with shebang, executable)');
