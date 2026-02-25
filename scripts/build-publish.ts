/**
 * Build orchestrator: Runs all build stages in dependency order.
 *
 * Stages:
 *   1. Clean dist/ and hooks/dist/
 *   2. Build shared types (tsc)
 *   3. Build hooks (12 standalone bundles)
 *   4. Build client (Vite SPA)
 *   5. Build server (single Bun bundle)
 *   6. Build CLI entry point
 *   7. Copy client build output to dist/client/
 *   8. Validate output structure
 */
import { existsSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const DIST = path.resolve(ROOT, 'dist');
const HOOKS_DIST = path.resolve(ROOT, 'hooks/dist');
const CLIENT_BUILD = path.resolve(ROOT, 'client/dist');
const CLIENT_DEST = path.resolve(DIST, 'client');

function run(label: string, cmd: string[], cwd: string = ROOT): void {
  console.log(`\n--- ${label} ---`);
  const result = Bun.spawnSync(cmd, {
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (result.exitCode !== 0) {
    console.error(`\nFailed: ${label} (exit code ${result.exitCode})`);
    process.exit(1);
  }
}

// Stage 1: Clean previous output
console.log('--- Stage 1: Clean ---');
rmSync(DIST, { recursive: true, force: true });
rmSync(HOOKS_DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Stage 2: Build shared types
run('Stage 2: Build shared types', ['bun', 'run', '--filter', './shared', 'build']);

// Stage 3: Build hooks
run('Stage 3: Build hooks', ['bun', 'run', 'scripts/build-hooks.ts']);

// Stage 4: Build client (Vite)
run('Stage 4: Build client', ['bun', 'run', '--filter', './client', 'build']);

// Stage 5: Build server
run('Stage 5: Build server', ['bun', 'run', 'scripts/build-server.ts']);

// Stage 6: Build CLI entry point
run('Stage 6: Build CLI', ['bun', 'run', 'scripts/build-cli.ts']);

// Stage 7: Copy client build output to dist/client/
console.log('\n--- Stage 7: Copy client assets ---');
if (!existsSync(CLIENT_BUILD)) {
  console.error(`Client build output not found at ${CLIENT_BUILD}`);
  process.exit(1);
}
cpSync(CLIENT_BUILD, CLIENT_DEST, { recursive: true });
console.log(`Copied: client/dist/ -> dist/client/`);

// Stage 8: Validate output structure
console.log('\n--- Stage 8: Validate ---');
const requiredFiles = [
  'dist/cli.js',
  'dist/server/index.js',
  'dist/client/index.html',
];
const requiredDirs = [
  'hooks/dist',
  'dist/client',
  'dist/server',
];

let valid = true;

for (const dir of requiredDirs) {
  const fullPath = path.resolve(ROOT, dir);
  if (!existsSync(fullPath)) {
    console.error(`Missing directory: ${dir}`);
    valid = false;
  }
}

for (const file of requiredFiles) {
  const fullPath = path.resolve(ROOT, file);
  if (!existsSync(fullPath)) {
    console.error(`Missing file: ${file}`);
    valid = false;
  }
}

// Verify all 12 hooks exist
const expectedHooks = [
  'session-start.js', 'session-end.js', 'stop.js',
  'subagent-start.js', 'subagent-stop.js',
  'pre-tool-use.js', 'post-tool-use.js', 'post-tool-use-failure.js',
  'user-prompt-submit.js',
  'notification.js', 'permission-request.js', 'pre-compact.js',
];
const builtHooks = existsSync(HOOKS_DIST)
  ? readdirSync(HOOKS_DIST).filter(f => f.endsWith('.js'))
  : [];

for (const hook of expectedHooks) {
  if (!builtHooks.includes(hook)) {
    console.error(`Missing hook: hooks/dist/${hook}`);
    valid = false;
  }
}

if (!valid) {
  console.error('\nBuild validation failed.');
  process.exit(1);
}

// Stage 9: Assemble publishable package
console.log('\n--- Stage 9: Assemble publishable package ---');

// Copy hooks/dist/ into dist/hooks/dist/
const hooksDestInDist = path.resolve(DIST, 'hooks/dist');
mkdirSync(hooksDestInDist, { recursive: true });
cpSync(HOOKS_DIST, hooksDestInDist, { recursive: true });

// Copy .claude-plugin/ into dist/.claude-plugin/
const pluginSrc = path.resolve(ROOT, '.claude-plugin');
const pluginDest = path.resolve(DIST, '.claude-plugin');
cpSync(pluginSrc, pluginDest, { recursive: true });

// Generate a standalone package.json for the distribution
const distPackageJson = {
  name: 'claude-visualizer',
  version: '0.1.0',
  type: 'module',
  description: 'Real-time 3D visualization of Claude Code agent orchestration',
  bin: {
    'claude-visualizer': './cli.js',
  },
  files: [
    'cli.js',
    'server/',
    'client/',
    'hooks/',
    '.claude-plugin/',
  ],
  engines: { bun: '>=1.0' },
  license: 'MIT',
};

const { writeFileSync } = await import('node:fs');
writeFileSync(
  path.resolve(DIST, 'package.json'),
  JSON.stringify(distPackageJson, null, 2) + '\n',
);
console.log('Generated: dist/package.json');
console.log('Copied: hooks/dist/ -> dist/hooks/dist/');
console.log('Copied: .claude-plugin/ -> dist/.claude-plugin/');

console.log(`\nBuild complete. Output structure:`);
console.log(`  dist/package.json       (publishable manifest)`);
console.log(`  dist/cli.js             (CLI entry point)`);
console.log(`  dist/server/index.js    (server bundle)`);
console.log(`  dist/client/            (static SPA)`);
console.log(`  dist/hooks/dist/        (${builtHooks.length} hook bundles)`);
console.log(`  dist/.claude-plugin/    (plugin manifest)`);
console.log(`\nTo test locally:`);
console.log(`  cd /path/to/test-dir && bun install ${DIST}`);
