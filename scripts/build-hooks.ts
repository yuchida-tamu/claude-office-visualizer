/**
 * Build script: Bundle each of the 12 hook source files as standalone JS.
 *
 * Each hook becomes a self-contained ESM file with zero external imports.
 * The @shared/* imports are type-only and vanish at build time.
 * Utility modules (e.g., url.ts) are inlined by the bundler when imported.
 */
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const HOOKS_SRC = path.resolve(import.meta.dir, '../hooks/src');
const HOOKS_DIST = path.resolve(import.meta.dir, '../hooks/dist');

// The 12 hook entry files corresponding to Claude Code lifecycle events
const HOOK_NAMES = [
  'session-start',
  'session-end',
  'stop',
  'subagent-start',
  'subagent-stop',
  'pre-tool-use',
  'post-tool-use',
  'post-tool-use-failure',
  'user-prompt-submit',
  'notification',
  'permission-request',
  'pre-compact',
];

// Clean previous output
rmSync(HOOKS_DIST, { recursive: true, force: true });
mkdirSync(HOOKS_DIST, { recursive: true });

// Discover and filter source files to only known hook entries
const hookFiles = readdirSync(HOOKS_SRC).filter(
  f => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('__tests__')
);
const entries = hookFiles.filter(f => HOOK_NAMES.includes(f.replace('.ts', '')));

if (entries.length !== HOOK_NAMES.length) {
  const found = entries.map(f => f.replace('.ts', ''));
  const missing = HOOK_NAMES.filter(name => !found.includes(name));
  console.error(`Missing hook source files: ${missing.join(', ')}`);
  process.exit(1);
}

let built = 0;
for (const entry of entries) {
  const result = await Bun.build({
    entrypoints: [path.join(HOOKS_SRC, entry)],
    outdir: HOOKS_DIST,
    target: 'bun',
    format: 'esm',
  });

  if (!result.success) {
    console.error(`Failed to build ${entry}:`, result.logs);
    process.exit(1);
  }

  built++;
  console.log(`Built: hooks/dist/${entry.replace('.ts', '.js')}`);
}

console.log(`\nBuilt ${built} hooks into hooks/dist/`);
