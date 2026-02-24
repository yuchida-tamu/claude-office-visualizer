import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolveDatabasePath } from '../database';

// ---------------------------------------------------------------------------
// Tests for resolveDatabasePath
// ---------------------------------------------------------------------------

describe('resolveDatabasePath', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CLAUDE_VISUALIZER_DB;
    delete process.env.CLAUDE_VISUALIZER_DB;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CLAUDE_VISUALIZER_DB = originalEnv;
    } else {
      delete process.env.CLAUDE_VISUALIZER_DB;
    }
  });

  test('returns "visualizer.db" by default (no args, no env)', () => {
    const result = resolveDatabasePath();
    expect(result).toBe('visualizer.db');
  });

  test('returns explicit path when provided', () => {
    const result = resolveDatabasePath('custom.db');
    expect(result).toBe('custom.db');
  });

  test('returns env var path when CLAUDE_VISUALIZER_DB is set', () => {
    process.env.CLAUDE_VISUALIZER_DB = '/tmp/test.db';
    const result = resolveDatabasePath();
    expect(result).toBe('/tmp/test.db');
  });

  test('explicit path takes precedence over env var', () => {
    process.env.CLAUDE_VISUALIZER_DB = '/tmp/env.db';
    const result = resolveDatabasePath('explicit.db');
    expect(result).toBe('explicit.db');
  });

  test('returns env var path with relative path', () => {
    process.env.CLAUDE_VISUALIZER_DB = 'relative/path/data.db';
    const result = resolveDatabasePath();
    expect(result).toBe('relative/path/data.db');
  });
});
