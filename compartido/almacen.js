// Almacenamiento de datos (tareas, casos dinámicos, sesiones y contadores de rate-limit).
// - Si hay UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN: Upstash Redis (persistente en Vercel).
// - Si no: memoria del proceso (sirve con `node server.js` y pruebas locales sin configuración).
const urlRedis = () => process.env.UPSTASH_REDIS_REST_URL;
const tokenRedis = () => process.env.UPSTASH_REDIS_REST_TOKEN;

const memoria = globalThis.__tareas || (globalThis.__tareas = new Map());
const listas = globalThis.__listas || (globalThis.__listas = new Map());
const contadores = globalThis.__contadores || (globalThis.__contadores = new Map());

export const persistente = () => !!(urlRedis() && tokenRedis());

async function redis(cmd) {
  const r = await fetch(urlRedis(), {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenRedis()}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Almacén respondió ${r.status}`);
  return (await r.json()).result;
}

const TTL = 60 * 60 * 24 * 60; // 60 días en segundos

export async function guardar(clave, valor) {
  const txt = JSON.stringify(valor);
  if (persistente()) return redis(['SET', clave, txt, 'EX', TTL, 'NX']);
  if (memoria.has(clave)) return null;
  memoria.set(clave, txt);
  return 'OK';
}

// Cambia el valor de una clave que ya existe, sin renovar su vencimiento. Devuelve null si no existe.
export async function reemplazar(clave, valor) {
  const txt = JSON.stringify(valor);
  if (persistente()) return redis(['SET', clave, txt, 'XX', 'KEEPTTL']);
  if (!memoria.has(clave)) return null;
  memoria.set(clave, txt);
  return 'OK';
}

export async function leer(clave) {
  const txt = persistente() ? await redis(['GET', clave]) : memoria.get(clave);
  return txt ? JSON.parse(txt) : null;
}

export async function agregar(clave, valor) {
  const txt = JSON.stringify(valor);
  if (persistente()) {
    const n = await redis(['RPUSH', clave, txt]);
    await redis(['EXPIRE', clave, TTL]);
    return Number(n);
  }
  const arr = listas.get(clave) || [];
  arr.push(txt);
  listas.set(clave, arr);
  return arr.length;
}

// Deja solo los últimos `max` elementos de una lista (para listas que no deben crecer sin fin).
export async function recortarLista(clave, max) {
  if (persistente()) return redis(['LTRIM', clave, String(-max), '-1']);
  const arr = listas.get(clave);
  if (arr && arr.length > max) listas.set(clave, arr.slice(-max));
  return 'OK';
}

export async function listar(clave) {
  if (persistente()) {
    const arr = await redis(['LRANGE', clave, '0', '-1']);
    return Array.isArray(arr) ? arr.map((x) => JSON.parse(x)) : [];
  }
  return (listas.get(clave) || []).map((x) => JSON.parse(x));
}

export async function incrementar(clave, segundos = 60) {
  const seg = Math.max(1, Math.floor(Number(segundos) || 60));
  if (persistente()) {
    const n = Number(await redis(['INCR', clave]));
    if (n === 1) await redis(['EXPIRE', clave, seg]);
    return n;
  }
  const ahora = Date.now();
  const reg = contadores.get(clave);
  if (!reg || ahora >= reg.expira) {
    contadores.set(clave, { valor: 1, expira: ahora + seg * 1000 });
    return 1;
  }
  reg.valor += 1;
  return reg.valor;
}
