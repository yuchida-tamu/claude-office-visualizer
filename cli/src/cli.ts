#!/usr/bin/env bun
// CLI entry point for claude-visualizer
export {};

import { resolve } from 'path';
import { readFileSync } from 'fs';

function getVersion(): string {
  try {
    const pkgPath = resolve(import.meta.dir, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'start':
    await import('./commands/start').then(m => m.start(args.slice(1)));
    break;
  case 'stop':
    await import('./commands/stop').then(m => m.stop());
    break;
  case 'status':
    await import('./commands/status').then(m => m.status());
    break;
  case '--version':
  case '-v':
    console.log(`claude-visualizer ${getVersion()}`);
    break;
  case '--help':
  case '-h':
  case undefined:
    printUsage();
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    printUsage();
    process.exit(1);
}

function printUsage() {
  console.log(`claude-visualizer — Real-time 3D visualization of Claude Code agents

Usage:
  claude-visualizer start [options]   Start the visualizer server
  claude-visualizer stop              Stop the visualizer server
  claude-visualizer status            Show server status

Options (start):
  --port <number>   Server port (default: 3333, env: VISUALIZER_PORT)
  --open            Open browser after starting
  --db <path>       Database file path (default: ~/.claude-visualizer/data.db)

Environment variables:
  VISUALIZER_PORT          Server port
  CLAUDE_VISUALIZER_DB     Database file path
  CLAUDE_VISUALIZER_URL    Full server URL for hooks
`);
}
