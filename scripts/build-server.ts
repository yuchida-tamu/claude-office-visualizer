/**
 * Build script: Bundle the server as a single standalone JS file.
 *
 * The server bundle inlines all @shared/* dependencies.
 * bun:sqlite is marked external since it is a Bun built-in module.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const SERVER_ENTRY = path.resolve(import.meta.dir, '../server/src/index.ts');
const SERVER_DIST = path.resolve(import.meta.dir, '../dist/server');

// Clean previous output
rmSync(SERVER_DIST, { recursive: true, force: true });
mkdirSync(SERVER_DIST, { recursive: true });

const result = await Bun.build({
  entrypoints: [SERVER_ENTRY],
  outdir: SERVER_DIST,
  target: 'bun',
  format: 'esm',
  external: ['bun:sqlite'], // Bun built-in, must not be bundled
});

if (!result.success) {
  console.error('Failed to build server:', result.logs);
  process.exit(1);
}

console.log('Built: dist/server/index.js');
