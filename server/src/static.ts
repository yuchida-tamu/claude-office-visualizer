/**
 * Static file serving module for production mode.
 *
 * Serves pre-built client files from a configurable directory with correct
 * MIME types and SPA fallback (serves index.html for unmatched paths).
 */
import { resolve, extname, normalize } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

/**
 * Attempt to serve a static file from `clientDir`.
 *
 * - If the requested file exists, serves it with the correct Content-Type.
 * - If the file does not exist, falls back to serving index.html (SPA routing).
 * - If even index.html is missing, returns null (caller should handle 404).
 * - Path traversal attempts (resolved path escapes clientDir) return 403.
 */
export async function serveStatic(
  pathname: string,
  clientDir: string,
): Promise<Response | null> {
  const resolvedClientDir = resolve(clientDir);

  // Decode percent-encoded characters before resolving to catch encoded traversals
  const decoded = decodeURIComponent(pathname);

  // Security: reject any path containing directory traversal sequences
  if (decoded.includes('..')) {
    return new Response('Forbidden', { status: 403 });
  }

  // Normalize and resolve against clientDir
  const normalized = normalize(decoded);
  const filePath = resolve(resolvedClientDir, '.' + normalized);

  // Belt-and-suspenders: resolved path must stay within clientDir
  if (!filePath.startsWith(resolvedClientDir)) {
    return new Response('Forbidden', { status: 403 });
  }

  // Map "/" to "index.html"
  const targetPath = pathname === '/' ? resolve(resolvedClientDir, 'index.html') : filePath;

  // Try to serve the requested file
  const file = Bun.file(targetPath);
  if (await file.exists()) {
    const ext = extname(targetPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    return new Response(file, {
      headers: { 'Content-Type': contentType },
    });
  }

  // SPA fallback: serve index.html for any unmatched path
  const indexPath = resolve(resolvedClientDir, 'index.html');
  const indexFile = Bun.file(indexPath);
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // No index.html available — cannot serve anything
  return null;
}
