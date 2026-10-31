// Servidor local sin dependencias: sirve /public y /api/<nombre>.
// Uso: node server.js  (lee variables de .env si existe)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(RAIZ, '.env'))) {
  for (const l of readFileSync(path.join(RAIZ, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim();
  }
}

const API_CACHE = new Map();
async function cargarApi(nombre) {
  if (API_CACHE.has(nombre)) return API_CACHE.get(nombre);
  const ruta = path.join(RAIZ, 'api', `${nombre}.js`);
  if (!existsSync(ruta)) return null;
  const mod = (await import(pathToFileURL(ruta).href)).default;
  API_CACHE.set(nombre, mod);
  return mod;
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PUERTO = process.env.PORT || 3000;
// Igual que el límite de Vercel para el cuerpo de una función (4,5 MB): en local y desplegado se acepta lo mismo.
const MAX_BODY_BYTES = 4.5 * 1024 * 1024;

// Un error inesperado responde 500 en vez de tumbar el proceso.
http.createServer((req, res) => atender(req, res).catch((e) => {
  console.error('[server]', e);
  if (!res.headersSent) { res.statusCode = 500; res.end('Error interno'); } else res.end();
})).listen(PUERTO, () => console.log(`Defiendelo en http://localhost:${PUERTO}`));

async function atender(req, res) {
  const url = new URL(req.url, 'http://x');
  const api = url.pathname.match(/^\/api\/([a-z0-9_-]+)$/);
  if (api) {
    const r = {
      status(c) { res.statusCode = c; return r; },
      setHeader(k, v) { res.setHeader(k, v); return r; },
      json(o) { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); },
      send(b) { res.end(b); },
      end(b) { res.end(b); },
    };
    const handler = await cargarApi(api[1]);
    if (!handler) return r.status(404).json({ error: 'no existe' });
    const chunks = [];
    let bytes = 0;
    for await (const c of req) {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) return r.status(413).json({ error: 'Cuerpo demasiado grande' });
      chunks.push(c);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return r.status(400).json({ error: 'JSON inválido' }); }
    return handler({ method: req.method, headers: req.headers, socket: req.socket, body, query: Object.fromEntries(url.searchParams) }, r);
  }
  let rel;
  try {
    rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  } catch {
    res.statusCode = 400; return res.end('Dirección inválida'); // p. ej. /%E0%A4%A
  }
  const archivo = path.join(RAIZ, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!archivo.startsWith(path.join(RAIZ, 'public'))) { res.statusCode = 403; return res.end(); }
  try {
    const data = await readFile(archivo);
    res.setHeader('content-type', TIPOS[path.extname(archivo)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('No encontrado');
  }
}
