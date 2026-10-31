// Una tarea admite una sola entrega por estudiante. Corre con `node --test`, sin red ni .env.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Toda tarea nueva necesita tipo de actividad y fecha límite.
const PLAZO = { tipoActividad: 'evaluacion', fechaLimite: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() };

for (const v of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SUPABASE_URL']) delete process.env[v];

const { default: apiTareas } = await import('../api/tareas.js');
const { default: apiSesiones } = await import('../api/sesiones.js');
const { default: apiIntentos } = await import('../api/intentos.js');
const { default: apiCarlos } = await import('../api/carlos.js');
const { generarCaso } = await import('../modulos/documentos/generador.js');

let ip = 0;
async function llamar(handler, { method = 'GET', query = {}, body, headers = {} } = {}) {
  const salida = { status: 200, json: undefined };
  const res = {
    status(c) { salida.status = c; return res; },
    setHeader() { return res; },
    json(o) { salida.json = o; return res; },
    send() { return res; },
    end() { return res; },
  };
  await handler({ method, query, body, headers, socket: { remoteAddress: `10.2.0.${++ip}` } }, res);
  return salida;
}

const nuevaTarea = async () => (await llamar(apiTareas, { method: 'POST', body: { ...PLAZO, titulo: 'T', curso: 'C', casoId: 'demo' } })).json;
const abrir = (codigo, nombre) => llamar(apiIntentos, { method: 'POST', body: { codigo, nombre } });
async function entregar(codigo, nombre) {
  const a = await abrir(codigo, nombre);
  if (a.status !== 201) return a;
  await llamar(apiCarlos, { method: 'POST', body: { intento: a.json.intento, puntoId: 'p1', historial: [{ rol: 'estudiante', texto: 'No sé.' }] } });
  return Object.assign(await llamar(apiSesiones, { method: 'POST', body: { modo: 'evaluacion', intento: a.json.intento } }), { intento: a.json.intento });
}

describe('una sola entrega por estudiante', () => {
  test('la segunda entrega se rechaza aunque cambien mayúsculas, tildes o espacios', async () => {
    const { codigo } = await nuevaTarea();
    assert.equal((await entregar(codigo, 'José Pérez')).status, 201);
    const otra = await abrir(codigo, '  jose   PEREZ ');
    assert.equal(otra.status, 409);
  });

  test('si se abrieron dos intentos sin responder, solo el último sirve para entregar', async () => {
    const { codigo } = await nuevaTarea();
    const a = await abrir(codigo, 'Luz');
    const b = await abrir(codigo, 'luz');
    const responderEn = (x) => llamar(apiCarlos, { method: 'POST', body: { intento: x.json.intento, puntoId: 'p1', historial: [{ rol: 'estudiante', texto: 'No sé.' }] } });
    assert.equal((await responderEn(a)).status, 409);
    assert.equal((await responderEn(b)).status, 200);
    assert.equal((await llamar(apiSesiones, { method: 'POST', body: { modo: 'evaluacion', intento: a.json.intento } })).status, 409);
    assert.equal((await llamar(apiSesiones, { method: 'POST', body: { modo: 'evaluacion', intento: b.json.intento } })).status, 201);
  });

  test('reintentar el cierre del mismo intento no crea otra entrega', async () => {
    const { codigo, tokenProfesor } = await nuevaTarea();
    const a = await entregar(codigo, 'Ana');
    const b = await llamar(apiSesiones, { method: 'POST', body: { modo: 'evaluacion', intento: a.intento } });
    assert.equal(b.status, 201);
    assert.equal(b.json.id, a.json.id);
    const panel = await llamar(apiSesiones, { query: { codigo }, headers: { 'x-token-profesor': tokenProfesor } });
    assert.equal(panel.json.sesiones.length, 1);
  });

  test('otro estudiante sí puede entregar, y ya no se puede consultar quién entregó sin el token', async () => {
    const { codigo } = await nuevaTarea();
    await entregar(codigo, 'Ana');
    assert.equal((await entregar(codigo, 'Beto')).status, 201);
    const consulta = await llamar(apiSesiones, { query: { codigo, nombre: 'ana' } });
    assert.equal(consulta.status, 401);
    assert.equal(consulta.json.entregada, undefined);
  });

  test('DEMO-01 se puede repetir, porque es la tarea de prueba', async () => {
    assert.equal((await entregar('DEMO-01', 'Jurado')).status, 201);
    assert.equal((await entregar('DEMO-01', 'Jurado')).status, 201);
  });
});

describe('dudas nuevas para la entrega', () => {
  const texto = Array.from({ length: 300 }, (_, k) => `palabra${k}${k % 12 === 11 ? '.' : ''}`).join(' ');
  let original;
  afterEach(() => {
    globalThis.fetch = original;
    for (const v of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']) delete process.env[v];
  });

  test('sin IA, la entrega también trae dudas distintas a las del ensayo', async () => {
    const ensayo = await generarCaso({ id: 'x1', texto, titulo: 'T', curso: 'C' });
    const entrega = await generarCaso({ id: 'x2', texto, titulo: 'T', curso: 'C', evitar: ensayo.caso.puntos.map((p) => p.apertura) });
    const temas = (c) => c.caso.puntos.map((p) => p.tema).join('|');
    assert.notEqual(temas(entrega), temas(ensayo));
    const ids = entrega.caso.documento.fragmentos.map((f) => f.id);
    assert.ok(entrega.caso.puntos.every((p) => ids.includes(p.fragmento)));
  });

  test('el prompt pide no repetir las dudas del ensayo', async () => {
    original = globalThis.fetch;
    Object.assign(process.env, { LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k', LLM_MODEL: 'm' });
    let prompt = '';
    globalThis.fetch = async (_u, o) => {
      prompt = JSON.parse(o.body).systemInstruction.parts[0].text;
      return { ok: false, status: 500, text: async () => 'no', json: async () => ({}) };
    };
    await generarCaso({ id: 'x', texto, titulo: 'T', curso: 'C', evitar: ['¿Por qué usaste colas?'] }).catch(() => {}); // solo importa el prompt
    assert.match(prompt, /¿Por qué usaste colas\?/);
    assert.match(prompt, /No las repitas/);
  });
});
