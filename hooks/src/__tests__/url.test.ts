/**
 * Unit tests for hooks/src/url.ts — resolveServerUrl utility.
 *
 * Tests the URL resolution priority with security validation:
 * 1. CLAUDE_VISUALIZER_URL (full base URL) — must resolve to loopback
 * 2. VISUALIZER_PORT (port only, localhost URL) — must be numeric 1-65535
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

  // --- CLAUDE_VISUALIZER_URL loopback validation ---

  test('accepts CLAUDE_VISUALIZER_URL with localhost hostname', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://localhost:9999';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:9999/api/events');
  });

  test('accepts CLAUDE_VISUALIZER_URL with 127.0.0.1', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://127.0.0.1:9999';
    const url = resolveServerUrl();
    expect(url).toBe('http://127.0.0.1:9999/api/events');
  });

  test('accepts CLAUDE_VISUALIZER_URL with [::1] (IPv6 loopback)', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://[::1]:9999';
    const url = resolveServerUrl();
    expect(url).toBe('http://[::1]:9999/api/events');
  });

  test('rejects non-loopback CLAUDE_VISUALIZER_URL and falls back to default', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://myhost:9999';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects remote hostname and falls back to default', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://evil.com:8080';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects IP address that is not 127.0.0.1', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://192.168.1.1:9999';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('falls back to default for unparseable CLAUDE_VISUALIZER_URL', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'not-a-url';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('strips trailing slash from valid CLAUDE_VISUALIZER_URL', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://localhost:9999/';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:9999/api/events');
  });

  test('strips multiple trailing slashes from valid CLAUDE_VISUALIZER_URL', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://localhost:9999///';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:9999/api/events');
  });

  test('non-loopback CLAUDE_VISUALIZER_URL does not fall through to VISUALIZER_PORT', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://remote:8080';
    process.env.VISUALIZER_PORT = '4444';
    const url = resolveServerUrl();
    // Should fall back to default, not use VISUALIZER_PORT
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('valid loopback CLAUDE_VISUALIZER_URL takes precedence over VISUALIZER_PORT', () => {
    process.env.CLAUDE_VISUALIZER_URL = 'http://localhost:8080';
    process.env.VISUALIZER_PORT = '4444';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:8080/api/events');
  });

  // --- VISUALIZER_PORT validation ---

  test('uses valid VISUALIZER_PORT to construct localhost URL', () => {
    process.env.VISUALIZER_PORT = '4444';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:4444/api/events');
  });

  test('accepts port 1 (minimum valid port)', () => {
    process.env.VISUALIZER_PORT = '1';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:1/api/events');
  });

  test('accepts port 65535 (maximum valid port)', () => {
    process.env.VISUALIZER_PORT = '65535';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:65535/api/events');
  });

  test('rejects port 0 and falls back to default', () => {
    process.env.VISUALIZER_PORT = '0';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects port 65536 and falls back to default', () => {
    process.env.VISUALIZER_PORT = '65536';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects non-numeric port and falls back to default', () => {
    process.env.VISUALIZER_PORT = 'abc';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects port with authority injection (3333@evil.com)', () => {
    process.env.VISUALIZER_PORT = '3333@evil.com';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects floating point port', () => {
    process.env.VISUALIZER_PORT = '3333.5';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects negative port', () => {
    process.env.VISUALIZER_PORT = '-1';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });

  test('rejects port with leading/trailing spaces', () => {
    process.env.VISUALIZER_PORT = ' 3333 ';
    const url = resolveServerUrl();
    expect(url).toBe('http://localhost:3333/api/events');
  });
});
