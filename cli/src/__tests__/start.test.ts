import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { parseOptions } from '../commands/start';

describe('start parseOptions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VISUALIZER_PORT;
    delete process.env.CLAUDE_VISUALIZER_DB;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('defaults: port 3333, open false, db under home dir', () => {
    const options = parseOptions([]);
    expect(options.port).toBe(3333);
    expect(options.open).toBe(false);
    expect(options.db).toContain('.claude-visualizer/data.db');
  });

  test('--port sets custom port', () => {
    const options = parseOptions(['--port', '4444']);
    expect(options.port).toBe(4444);
  });

  test('--open enables browser open', () => {
    const options = parseOptions(['--open']);
    expect(options.open).toBe(true);
  });

  test('--db sets custom database path', () => {
    const options = parseOptions(['--db', '/tmp/test.db']);
    expect(options.db).toBe('/tmp/test.db');
  });

  test('VISUALIZER_PORT env var sets default port', () => {
    process.env.VISUALIZER_PORT = '5555';
    const options = parseOptions([]);
    expect(options.port).toBe(5555);
  });

  test('CLAUDE_VISUALIZER_DB env var sets default db path', () => {
    process.env.CLAUDE_VISUALIZER_DB = '/tmp/env-test.db';
    const options = parseOptions([]);
    expect(options.db).toBe('/tmp/env-test.db');
  });

  test('CLI args override env vars', () => {
    process.env.VISUALIZER_PORT = '5555';
    process.env.CLAUDE_VISUALIZER_DB = '/tmp/env-test.db';
    const options = parseOptions(['--port', '6666', '--db', '/tmp/cli-test.db']);
    expect(options.port).toBe(6666);
    expect(options.db).toBe('/tmp/cli-test.db');
  });

  test('multiple options combined', () => {
    const options = parseOptions(['--port', '8080', '--open', '--db', '/data/vis.db']);
    expect(options.port).toBe(8080);
    expect(options.open).toBe(true);
    expect(options.db).toBe('/data/vis.db');
  });
});
