import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '../static';

// ---------------------------------------------------------------------------
// Setup: create a temp directory with mock static files
// ---------------------------------------------------------------------------

const TEST_DIR = join(import.meta.dir, '__static_test_fixtures__');

beforeAll(() => {
  mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'index.html'), '<!DOCTYPE html><html><body>Hello</body></html>');
  writeFileSync(join(TEST_DIR, 'assets', 'main.js'), 'console.log("hello")');
  writeFileSync(join(TEST_DIR, 'assets', 'style.css'), 'body { color: red; }');
  writeFileSync(join(TEST_DIR, 'data.json'), '{"key":"value"}');
  // Create a small binary file to simulate .glb
  writeFileSync(join(TEST_DIR, 'model.glb'), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  writeFileSync(join(TEST_DIR, 'favicon.ico'), Buffer.from([0x00]));
  writeFileSync(join(TEST_DIR, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(TEST_DIR, 'photo.jpg'), Buffer.from([0xff, 0xd8]));
  writeFileSync(join(TEST_DIR, 'icon.svg'), '<svg></svg>');
  writeFileSync(join(TEST_DIR, 'font.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('serveStatic', () => {
  // -------------------------------------------------------------------------
  // Content-type tests
  // -------------------------------------------------------------------------
  describe('MIME types', () => {
    test('serves index.html for GET / with text/html content-type', async () => {
      const res = await serveStatic('/', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      const body = await res!.text();
      expect(body).toContain('<!DOCTYPE html>');
    });

    test('serves index.html for GET /index.html with text/html content-type', async () => {
      const res = await serveStatic('/index.html', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });

    test('serves .js files with text/javascript content-type', async () => {
      const res = await serveStatic('/assets/main.js', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
      const body = await res!.text();
      expect(body).toContain('console.log');
    });

    test('serves .css files with text/css content-type', async () => {
      const res = await serveStatic('/assets/style.css', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    });

    test('serves .json files with application/json content-type', async () => {
      const res = await serveStatic('/data.json', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('application/json');
    });

    test('serves .glb files with model/gltf-binary content-type', async () => {
      const res = await serveStatic('/model.glb', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('model/gltf-binary');
    });

    test('serves .png files with image/png content-type', async () => {
      const res = await serveStatic('/image.png', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('image/png');
    });

    test('serves .jpg files with image/jpeg content-type', async () => {
      const res = await serveStatic('/photo.jpg', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('image/jpeg');
    });

    test('serves .svg files with image/svg+xml content-type', async () => {
      const res = await serveStatic('/icon.svg', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('image/svg+xml');
    });

    test('serves .woff2 files with font/woff2 content-type', async () => {
      const res = await serveStatic('/font.woff2', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('font/woff2');
    });

    test('serves .ico files with image/x-icon content-type', async () => {
      const res = await serveStatic('/favicon.ico', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('image/x-icon');
    });
  });

  // -------------------------------------------------------------------------
  // SPA fallback
  // -------------------------------------------------------------------------
  describe('SPA fallback', () => {
    test('unknown path returns index.html (not 404)', async () => {
      const res = await serveStatic('/some/deep/path', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      const body = await res!.text();
      expect(body).toContain('<!DOCTYPE html>');
    });

    test('unknown path with extension returns index.html if file missing', async () => {
      // A path like /foo.bar where foo.bar doesn't exist should still SPA fallback
      const res = await serveStatic('/nonexistent.xyz', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });
  });

  // -------------------------------------------------------------------------
  // Security: path traversal
  // -------------------------------------------------------------------------
  describe('security', () => {
    test('path traversal with /../ is blocked with 403', async () => {
      const res = await serveStatic('/../../../etc/passwd', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    test('path traversal with encoded characters is blocked', async () => {
      const res = await serveStatic('/..%2F..%2Fetc/passwd', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    test('path traversal with backslashes is blocked', async () => {
      const res = await serveStatic('/..\\..\\etc\\passwd', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    test('returns null when clientDir has no index.html (no SPA fallback possible)', async () => {
      // Use a directory with no index.html
      const emptyDir = join(TEST_DIR, 'empty_subdir');
      mkdirSync(emptyDir, { recursive: true });

      const res = await serveStatic('/nonexistent', emptyDir);
      expect(res).toBeNull();
    });

    test('serves files with unknown extension using octet-stream', async () => {
      writeFileSync(join(TEST_DIR, 'data.bin'), Buffer.from([0x00, 0x01]));
      const res = await serveStatic('/data.bin', TEST_DIR);
      expect(res).not.toBeNull();
      expect(res!.headers.get('Content-Type')).toBe('application/octet-stream');
    });
  });
});
