// Servidor local sin dependencias: sirve /public y /api/carlos.
// Uso: node server.js  (lee variables de .env si existe)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(RAIZ, '.env'))) {
  for (const l of readFileSync(path.join(RAIZ, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const API = {
  carlos: (await import('./api/carlos.js')).default,
  tareas: (await import('./api/tareas.js')).default,
};

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PUERTO = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const api = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (api) {
    const r = {
      status(c) { res.statusCode = c; return r; },
      json(o) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); },
    };
    if (!API[api[1]]) return r.status(404).json({ error: 'no existe' });
    let raw = '';
    for await (const c of req) raw += c;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return r.status(400).json({ error: 'JSON inválido' }); }
    return API[api[1]]({ method: req.method, body, query: Object.fromEntries(url.searchParams) }, r);
  }
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const archivo = path.join(RAIZ, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!archivo.startsWith(path.join(RAIZ, 'public'))) { res.statusCode = 403; return res.end(); }
  try {
    const data = await readFile(archivo);
    res.setHeader('content-type', TIPOS[path.extname(archivo)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('No encontrado');
  }
}).listen(PUERTO, () => console.log(`Defiéndelo en http://localhost:${PUERTO}`));
