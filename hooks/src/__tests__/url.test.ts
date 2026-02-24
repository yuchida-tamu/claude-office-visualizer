/**
 * Unit tests for hooks/src/url.ts — resolveServerUrl utility.
 *
 * Tests the URL resolution priority:
 * 1. CLAUDE_VISUALIZER_URL (full base URL)
 * 2. VISUALIZER_PORT (port only, localhost URL)
 * 3. Default: http://localhost:3333/api/events
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolveServerUrl } from '../url';

describe('resolveServerUrl', () => {
  let savedEnv: {
    CLAUDE_VISUALIZER_URL?: string;
    VISUALIZER_PORT?: string;
  };

  beforeEach(() => {
    // Save current env values
    savedEnv = {
      CLAUDE_VISUALIZER_URL: process.env.CLAUDE_VISUALIZER_URL,
      VISUALIZER_PORT: process.env.VISUALIZER_PORT,
    };
    // Clear both env vars for a clean slate
    delete process.env.CLAUDE_VISUALIZER_URL;
    delete process.env.VISUALIZER_PORT;
  });

  afterEach(() => {
    // Restore original env values
    if (savedEnv.CLAUDE_VISUALIZER_URL !== undefined) {
      process.env.CLAUDE_VISUALIZER_URL = savedEnv.CLAUDE_VISUALIZER_URL;
    } else {
      delete process.env.CLAUDE_VISUALIZER_URL;
    }
    if (savedEnv.VISUALIZER_PORT !== undefined) {
      process.env.VISUALIZER_PORT = savedEnv.VISUALIZER_PORT;
    } else {
      delete process.env.VISUALIZER_PORT;
    }
  });

  test('returns default URL when no env vars are set', () => {
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('uses CLAUDE_VISUALIZER_URL as base and appends /api/events', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://myhost:9999';
    const url = resolveServerUrl();
    expect(url).toBe('http://myhost:9999/api/events');
  });

  test('strips trailing slash from CLAUDE_VISUALIZER_URL to avoid double slash', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://myhost:9999/';
    const url = resolveServerUrl();
    expect(url).toBe('http://myhost:9999/api/events');
  });

  test('uses VISUALIZER_PORT to construct localhost URL', () => {
    process.env.VISUALIZER_PORT = '4444';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:4444/api/events');
  });

  test('CLAUDE_VISUALIZER_URL takes precedence over VISUALIZER_PORT', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://remote:8080';
    process.env.VISUALIZER_PORT = '4444';
    const url = resolveServerUrl();
    expect(url).toBe('http://remote:8080/api/events');
  });

  test('strips multiple trailing slashes from CLAUDE_VISUALIZER_URL', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://myhost:9999///';
    const url = resolveServerUrl();
    expect(url).toBe('http://myhost:9999/api/events');
  });
});
