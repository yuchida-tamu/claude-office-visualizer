/**
 * Bump version in all project version sources.
 *
 * Updates:
 *   - package.json (root)
 *   - .claude-plugin/plugin.json
 *
 * Usage:
 *   bun run scripts/bump-version.ts <version>
 *
 * Example:
 *   bun run scripts/bump-version.ts 1.2.3
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function bumpVersion(version: string, rootDir?: string): void {
  if (!SEMVER_RE.test(version)) {
    throw new Error(
      `Invalid semver version: "${version}". Expected format: MAJOR.MINOR.PATCH (e.g. 1.2.3)`,
    );
  }

  const root = rootDir ?? path.resolve(import.meta.dir, '..');

  const targets = [
    'package.json',
    '.claude-plugin/plugin.json',
  ];

  for (const target of targets) {
    const filePath = path.resolve(root, target);
    const raw = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);
    json.version = version;
    writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
    console.log(`Updated: ${target} → ${version}`);
  }
}

// CLI entry point
if (import.meta.main) {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: bun run scripts/bump-version.ts <version>');
    process.exit(1);
  }
  bumpVersion(version);
}
