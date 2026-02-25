import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { bumpVersion } from '../bump-version.ts';

describe('bump-version', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'bump-version-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeJson(relativePath: string, data: object): string {
    const filePath = path.join(tmpDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    return filePath;
  }

  function readJson(filePath: string): Record<string, unknown> {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  /** Sets up both version-bearing files that bump-version expects. */
  function setupFixtures(version = '0.1.1') {
    const pkgPath = writeJson('package.json', {
      name: 'test-package',
      version,
      private: true,
    });
    const pluginPath = writeJson('.claude-plugin/plugin.json', {
      name: 'test-plugin',
      version,
      hooks: {},
    });
    return { pkgPath, pluginPath };
  }

  test('updates version in package.json', () => {
    const { pkgPath } = setupFixtures('0.1.1');

    bumpVersion('2.0.0', tmpDir);

    const result = readJson(pkgPath);
    expect(result.version).toBe('2.0.0');
    expect(result.name).toBe('test-package');
    expect(result.private).toBe(true);
  });

  test('updates version in .claude-plugin/plugin.json', () => {
    const { pluginPath } = setupFixtures('0.1.0');

    bumpVersion('3.5.1', tmpDir);

    const result = readJson(pluginPath);
    expect(result.version).toBe('3.5.1');
    expect(result.name).toBe('test-plugin');
    expect(result.hooks).toEqual({});
  });

  test('rejects invalid semver versions', () => {
    setupFixtures();

    expect(() => bumpVersion('abc', tmpDir)).toThrow();
    expect(() => bumpVersion('1.2', tmpDir)).toThrow();
    expect(() => bumpVersion('', tmpDir)).toThrow();
    expect(() => bumpVersion('v1.2.3', tmpDir)).toThrow();
  });

  test('preserves 2-space indentation in output', () => {
    const { pkgPath } = setupFixtures('0.1.0');

    bumpVersion('1.0.0', tmpDir);

    const raw = readFileSync(pkgPath, 'utf-8');
    expect(raw).toContain('  "name"');
    expect(raw).toContain('  "version"');
    expect(raw.endsWith('\n')).toBe(true);
  });
});
