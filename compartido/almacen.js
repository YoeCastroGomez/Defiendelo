// Almacenamiento de tareas.
// - Si hay UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN: Redis de Upstash (persistente, sirve en Vercel).
// - Si no: memoria del proceso (sirve con `node server.js`; en Vercel se pierde al reiniciarse la función).
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const memoria = globalThis.__tareas || (globalThis.__tareas = new Map());

export const persistente = () => !!(URL_ && TOKEN);

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Almacén respondió ${r.status}`);
  return (await r.json()).result;
}

const TTL = 60 * 60 * 24 * 60; // 60 días

export async function guardar(clave, valor) {
  const txt = JSON.stringify(valor);
  if (persistente()) return redis(['SET', clave, txt, 'EX', TTL, 'NX']);
  if (memoria.has(clave)) return null;
  memoria.set(clave, txt);
  return 'OK';
}

export async function leer(clave) {
  const txt = persistente() ? await redis(['GET', clave]) : memoria.get(clave);
  return txt ? JSON.parse(txt) : null;
}
