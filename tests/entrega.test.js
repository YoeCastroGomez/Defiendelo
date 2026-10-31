// Una tarea admite una sola entrega por estudiante. Corre con `node --test`, sin red ni .env.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

for (const v of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SUPABASE_URL']) delete process.env[v];

const { default: apiTareas } = await import('../api/tareas.js');
const { default: apiSesiones } = await import('../api/sesiones.js');
const { generarCaso } = await import('../modulos/documentos/generador.js');

async function llamar(handler, { method = 'GET', query = {}, body, headers = {} } = {}) {
  const salida = { status: 200, json: undefined };
  const res = {
    status(c) { salida.status = c; return res; },
    setHeader() { return res; },
    json(o) { salida.json = o; return res; },
    send() { return res; },
    end() { return res; },
  };
  await handler({ method, query, body, headers, socket: { remoteAddress: '10.2.0.1' } }, res);
  return salida;
}

const nuevaTarea = async () => (await llamar(apiTareas, { method: 'POST', body: { titulo: 'T', curso: 'C', casoId: 'demo' } })).json;
const entrega = (codigo, nombre, intento) => ({
  codigo, casoId: 'demo', nombre, modo: 'evaluacion', intento,
  resultados: { p1: { tema: 'X', tipo: 'decision', nivel: 'verde' } },
  senales: {},
});
const enviar = (cuerpo) => llamar(apiSesiones, { method: 'POST', body: cuerpo });

describe('una sola entrega por estudiante', () => {
  test('la segunda entrega se rechaza aunque cambien mayúsculas, tildes o espacios', async () => {
    const { codigo } = await nuevaTarea();
    assert.equal((await enviar(entrega(codigo, 'José Pérez', '1'))).status, 201);
    const otra = await enviar(entrega(codigo, '  jose   PEREZ ', '2'));
    assert.equal(otra.status, 409);
  });

  test('reintentar el mismo intento no crea otra entrega', async () => {
    const { codigo, tokenProfesor } = await nuevaTarea();
    const a = await enviar(entrega(codigo, 'Ana', '77'));
    const b = await enviar(entrega(codigo, 'Ana', '77'));
    assert.equal(b.status, 201);
    assert.equal(b.json.id, a.json.id);
    const panel = await llamar(apiSesiones, { query: { codigo }, headers: { 'x-token-profesor': tokenProfesor } });
    assert.equal(panel.json.sesiones.length, 1);
  });

  test('otro estudiante sí puede entregar, y se puede consultar quién ya entregó', async () => {
    const { codigo } = await nuevaTarea();
    await enviar(entrega(codigo, 'Ana', '1'));
    assert.equal((await enviar(entrega(codigo, 'Beto', '2'))).status, 201);
    const si = await llamar(apiSesiones, { query: { codigo, nombre: 'ana' } });
    const no = await llamar(apiSesiones, { query: { codigo, nombre: 'Carla' } });
    assert.deepEqual([si.json.entregada, no.json.entregada], [true, false]);
  });

  test('DEMO-01 se puede repetir, porque es la tarea de prueba', async () => {
    assert.equal((await enviar(entrega('DEMO-01', 'Jurado', '1'))).status, 201);
    assert.equal((await enviar(entrega('DEMO-01', 'Jurado', '2'))).status, 201);
  });
});

describe('dudas nuevas para la entrega', () => {
  const texto = Array.from({ length: 300 }, (_, k) => `palabra${k}${k % 12 === 11 ? '.' : ''}`).join(' ');
  let original;
  afterEach(() => {
    globalThis.fetch = original;
    for (const v of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']) delete process.env[v];
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
