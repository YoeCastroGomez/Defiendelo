// Contratos de la API (sección 4 del plan). Corre con `node --test`, sin red, sin .env y sin dependencias:
// usa el almacén en memoria y simula las respuestas del proveedor de IA.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const VARIABLES = ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_BASE_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'DEMO_TOKEN_PROFESOR', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_BUCKET'];
for (const v of VARIABLES) delete process.env[v];

const almacen = await import('../compartido/almacen.js');
const { default: apiTareas } = await import('../api/tareas.js');
const { default: apiCasos } = await import('../api/casos.js');
const { default: apiCarlos } = await import('../api/carlos.js');
const { default: apiSesiones } = await import('../api/sesiones.js');
const { default: apiDocumentos } = await import('../api/documentos.js');
const { default: apiArchivos } = await import('../api/archivos.js');

async function llamar(handler, { method = 'GET', query = {}, body, headers = {}, ip = '10.0.0.1' } = {}) {
  const salida = { status: 200, json: undefined };
  const res = {
    status(c) { salida.status = c; return res; },
    setHeader() { return res; },
    json(o) { salida.json = o; return res; },
    send() { return res; },
    end() { return res; },
  };
  await handler({ method, query, body, headers, socket: { remoteAddress: ip } }, res);
  return salida;
}

const TURNO = { casoId: 'demo', puntoId: 'p1', historial: [{ rol: 'estudiante', texto: 'Porque desacopla Reserva de los canales.' }] };
const JSON_TURNO = JSON.stringify({ nivel: 'verde', motivo: 'Explicó.', evidencia: 'desacopla', repreguntar: false, carlos_dice: 'Ya entendí.' });
let ipUnica = 0;
const otraIp = () => `10.1.0.${++ipUnica}`;

// Activa un proveedor falso: cada llamada a fetch consume una respuesta de la lista.
function simularIA(respuestas) {
  const original = globalThis.fetch;
  const prompts = [];
  process.env.LLM_PROVIDER = 'gemini';
  process.env.LLM_API_KEY = 'clave-de-prueba';
  process.env.LLM_MODEL = 'modelo-de-prueba';
  globalThis.fetch = async (_url, opciones) => {
    prompts.push(JSON.parse(opciones.body).systemInstruction.parts[0].text);
    const r = respuestas.shift();
    if (r.error) return new Response(r.error, { status: r.status });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: r.texto }] } }] }), { status: 200 });
  };
  return {
    prompts,
    restaurar() {
      globalThis.fetch = original;
      for (const v of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']) delete process.env[v];
    },
  };
}

describe('compartido/almacen.js', () => {
  test('guardar no sobrescribe una clave existente', async () => {
    assert.equal(await almacen.guardar('prueba:nx', { a: 1 }), 'OK');
    assert.equal(await almacen.guardar('prueba:nx', { a: 2 }), null);
    assert.deepEqual(await almacen.leer('prueba:nx'), { a: 1 });
  });

  test('leer devuelve null si la clave no existe', async () => {
    assert.equal(await almacen.leer('prueba:nada'), null);
  });

  test('agregar y listar conservan el orden', async () => {
    assert.equal(await almacen.agregar('prueba:lista', { n: 1 }), 1);
    assert.equal(await almacen.agregar('prueba:lista', { n: 2 }), 2);
    assert.deepEqual(await almacen.listar('prueba:lista'), [{ n: 1 }, { n: 2 }]);
    assert.deepEqual(await almacen.listar('prueba:vacia'), []);
  });

  test('incrementar reinicia el contador al expirar', async () => {
    assert.equal(await almacen.incrementar('prueba:ip', 1), 1);
    assert.equal(await almacen.incrementar('prueba:ip', 1), 2);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(await almacen.incrementar('prueba:ip', 1), 1);
  });
});

describe('/api/tareas', () => {
  test('POST crea tarea con casoId demo y token de 32 caracteres', async () => {
    const r = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: 'demo' } });
    assert.equal(r.status, 201);
    assert.match(r.json.codigo, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    assert.match(r.json.tokenProfesor, /^[0-9a-f]{32}$/);
  });

  test('POST acepta casoId estudiante', async () => {
    const r = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: 'estudiante' } });
    assert.equal(r.status, 201);
  });

  test('POST sin título responde 400 y con caso inexistente 404', async () => {
    assert.equal((await llamar(apiTareas, { method: 'POST', body: { curso: 'C1' } })).status, 400);
    assert.equal((await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: 'inexistente' } })).status, 404);
  });

  test('GET nunca devuelve tokenProfesor y normaliza el código', async () => {
    const creada = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: 'estudiante' } });
    const sinGuion = creada.json.codigo.replace('-', '').toLowerCase();
    const r = await llamar(apiTareas, { query: { codigo: sinGuion } });
    assert.equal(r.status, 200);
    assert.equal(r.json.codigo, creada.json.codigo);
    assert.equal('tokenProfesor' in r.json, false);
  });

  test('GET de DEMO-01 funciona sin guion y sin exponer el token', async () => {
    const r = await llamar(apiTareas, { query: { codigo: 'demo01' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.codigo, 'DEMO-01');
    assert.equal('tokenProfesor' in r.json, false);
  });

  test('GET responde 400 con formato inválido y 404 si no existe', async () => {
    assert.equal((await llamar(apiTareas, { query: { codigo: '!!' } })).status, 400);
    assert.equal((await llamar(apiTareas, { query: { codigo: 'ZZZ-ZZZ' } })).status, 404);
  });
});

describe('/api/casos', () => {
  test('los casos ya no están en la carpeta pública', () => {
    assert.equal(existsSync(new URL('../public/casos/demo.json', import.meta.url)), false);
  });

  test('GET sin id lista los casos base', async () => {
    const r = await llamar(apiCasos);
    assert.equal(r.status, 200);
    assert.ok(r.json.some((c) => c.id === 'demo'));
  });

  test('GET con id oculta lo que el estudiante debe explicar', async () => {
    const r = await llamar(apiCasos, { query: { id: 'demo' } });
    assert.equal(r.status, 200);
    assert.ok(r.json.documento.fragmentos.length > 0);
    const texto = JSON.stringify(r.json);
    assert.equal(texto.includes('que_debe_explicar'), false);
    assert.equal(texto.includes('error_de_carlos'), false);
  });

  test('GET rechaza ids inválidos e inexistentes', async () => {
    assert.equal((await llamar(apiCasos, { query: { id: '../package' } })).status, 400);
    assert.equal((await llamar(apiCasos, { query: { id: 'estudiante' } })).status, 400);
    assert.equal((await llamar(apiCasos, { query: { id: 'no-existe' } })).status, 404);
  });
});

describe('/api/carlos', () => {
  test('GET informa si hay IA', async () => {
    const r = await llamar(apiCarlos);
    assert.deepEqual(r.json, { ia: false });
  });

  test('métodos no permitidos responden 405', async () => {
    assert.equal((await llamar(apiCarlos, { method: 'PUT' })).status, 405);
  });

  test('sin proveedor responde 503', async () => {
    assert.equal((await llamar(apiCarlos, { method: 'POST', body: TURNO, ip: otraIp() })).status, 503);
  });

  test('la petición 31 de una misma IP responde 429', async () => {
    const ip = otraIp();
    for (let k = 0; k < 30; k++) await llamar(apiCarlos, { method: 'POST', body: TURNO, ip });
    assert.equal((await llamar(apiCarlos, { method: 'POST', body: TURNO, ip })).status, 429);
    assert.equal((await llamar(apiCarlos, { method: 'POST', body: TURNO, ip: otraIp() })).status, 503);
  });

  describe('con proveedor simulado', () => {
    let ia;
    const conIA = (respuestas) => { ia = simularIA(respuestas); };
    afterEach(() => ia?.restaurar());

    test('devuelve la evaluación con el contrato acordado', async () => {
      conIA([{ texto: JSON_TURNO }]);
      const r = await llamar(apiCarlos, { method: 'POST', body: TURNO, ip: otraIp() });
      assert.equal(r.status, 200);
      assert.deepEqual(Object.keys(r.json).sort(), ['carlos_dice', 'evidencia', 'motivo', 'nivel', 'repreguntar']);
    });

    test('reintenta una vez si el JSON llega malformado', async () => {
      conIA([{ texto: 'esto no es JSON' }, { texto: JSON_TURNO }]);
      const r = await llamar(apiCarlos, { method: 'POST', body: TURNO, ip: otraIp() });
      assert.equal(r.status, 200);
      assert.equal(ia.prompts.length, 2);
      assert.match(ia.prompts[1], /no fue JSON válido/);
    });

    test('un error del proveedor no llega crudo al cliente', async () => {
      conIA([{ status: 401, error: 'SECRETO-DEL-PROVEEDOR' }]);
      const original = console.error;
      console.error = () => {};
      const r = await llamar(apiCarlos, { method: 'POST', body: TURNO, ip: otraIp() });
      console.error = original;
      assert.equal(r.status, 500);
      assert.equal(JSON.stringify(r.json).includes('SECRETO'), false);
    });

    test('el prompt incluye la regla contra inyecciones', async () => {
      conIA([{ texto: JSON_TURNO }]);
      await llamar(apiCarlos, { method: 'POST', body: TURNO, ip: otraIp() });
      assert.match(ia.prompts[0], /REGLA DE SEGURIDAD INQUEBRANTABLE/);
    });

    test('un trabajo de 35 fragmentos se recorta a la ventana del punto', async () => {
      const fragmentos = Array.from({ length: 35 }, (_, k) => ({ id: `f${k + 1}`, seccion: 'Sección única', texto: `contenido-${k + 1}-fin` }));
      await almacen.guardar('caso:doc-largo', {
        id: 'doc-largo', curso: 'C', tarea: 'T', carlos: { nombre: 'Carlos', perfil: 'Curioso.' },
        documento: { titulo: 'T', fragmentos },
        puntos: [{ id: 'p1', tema: 'Tema', fragmento: 'f20', apertura: 'Oye', que_debe_explicar: 'Algo', error_de_carlos: null }],
      });
      conIA([{ texto: JSON_TURNO }]);
      await llamar(apiCarlos, { method: 'POST', body: { ...TURNO, casoId: 'doc-largo' }, ip: otraIp() });
      for (const n of [1, 18, 19, 20, 21, 22]) assert.ok(ia.prompts[0].includes(`contenido-${n}-fin`), `falta f${n}`);
      for (const n of [2, 17, 23, 35]) assert.equal(ia.prompts[0].includes(`contenido-${n}-fin`), false, `sobra f${n}`);
    });
  });
});

describe('/api/sesiones', () => {
  const SESION = {
    codigo: 'DEMO-01', casoId: 'demo', nombre: 'Ana', modo: 'evaluacion', duracionSegundos: 300,
    resultados: { p1: { tema: 'A', nivel: 'rojo' }, p2: { tema: 'B', nivel: 'rojo' } },
    senales: { pegadoBloqueado: 1 },
  };

  test('POST ignora el nivelGeneral del cliente y lo recalcula', async () => {
    const r = await llamar(apiSesiones, { method: 'POST', body: { ...SESION, nivelGeneral: 'verde' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.nivelGeneral, 'rojo');
    assert.match(r.json.id, /^ses_/);
  });

  test('POST aplica los umbrales del plan', async () => {
    const nivel = async (...niveles) => {
      const resultados = Object.fromEntries(niveles.map((n, k) => [`p${k + 1}`, { nivel: n }]));
      return (await llamar(apiSesiones, { method: 'POST', body: { ...SESION, resultados } })).json.nivelGeneral;
    };
    assert.equal(await nivel('verde', 'amarillo'), 'verde');
    assert.equal(await nivel('amarillo', 'amarillo'), 'amarillo');
    assert.equal(await nivel('amarillo', 'rojo'), 'rojo');
  });

  test('POST rechaza práctica, nombre vacío, resultados vacíos y tarea inexistente', async () => {
    assert.equal((await llamar(apiSesiones, { method: 'POST', body: { ...SESION, modo: 'practica' } })).status, 400);
    assert.equal((await llamar(apiSesiones, { method: 'POST', body: { ...SESION, nombre: ' ' } })).status, 400);
    assert.equal((await llamar(apiSesiones, { method: 'POST', body: { ...SESION, resultados: {} } })).status, 400);
    assert.equal((await llamar(apiSesiones, { method: 'POST', body: { ...SESION, codigo: 'ZZZ-ZZZ' } })).status, 404);
  });

  test('GET exige el token del profesor', async () => {
    assert.equal((await llamar(apiSesiones, { query: { codigo: 'DEMO-01' } })).status, 401);
    assert.equal((await llamar(apiSesiones, { query: { codigo: 'DEMO-01' }, headers: { 'x-token-profesor': 'mal' } })).status, 401);
  });

  test('GET con token válido devuelve la tarea y sus sesiones sin el token', async () => {
    const creada = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: 'demo' } });
    const { codigo, tokenProfesor } = creada.json;
    await llamar(apiSesiones, { method: 'POST', body: { ...SESION, codigo, nombre: 'Primera' } });
    await llamar(apiSesiones, { method: 'POST', body: { ...SESION, codigo, nombre: 'Segunda' } });
    const r = await llamar(apiSesiones, { query: { codigo }, headers: { 'x-token-profesor': tokenProfesor } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.sesiones.map((s) => s.nombre), ['Segunda', 'Primera']);
    assert.equal(JSON.stringify(r.json).includes(tokenProfesor), false);
  });
});

describe('/api/archivos', () => {
  const RUTA_ENUNCIADO = 'enunciados/' + 'a'.repeat(32) + '.pdf';
  const RUTA_ENUNCIADO_2 = 'enunciados/' + 'c'.repeat(32) + '.pdf';
  const RUTA_ENTREGA = 'resoluciones/' + 'b'.repeat(32) + '.docx';
  const texto = Array.from({ length: 300 }, (_, k) => `palabra${k}${k % 12 === 11 ? '.' : ''}`).join(' ');
  let fetchOriginal;

  beforeEach(() => {
    fetchOriginal = globalThis.fetch;
    process.env.SUPABASE_URL = 'https://prueba.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'clave-secreta';
    process.env.SUPABASE_BUCKET = 'cubeta';
    globalThis.fetch = async (url) => new Response(JSON.stringify(
      String(url).includes('/upload/sign/') ? { url: '/object/upload/sign/cubeta/x?token=s' } : { signedURL: '/object/sign/cubeta/x?token=d' },
    ), { status: 200 });
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_BUCKET']) delete process.env[v];
  });

  test('POST valida el formato y el tamaño, y nunca devuelve la clave', async () => {
    const pedir = (body) => llamar(apiArchivos, { method: 'POST', body, ip: otraIp() });
    assert.equal((await pedir({ tipo: 'enunciado', nombre: 'a.png', tamano: 10 })).status, 400);
    assert.equal((await pedir({ tipo: 'enunciado', nombre: 'a.pdf', tamano: 11 * 1024 * 1024 })).status, 400);
    assert.equal((await pedir({ tipo: 'otro', nombre: 'a.pdf', tamano: 10 })).status, 400);
    const r = await pedir({ tipo: 'resolucion', nombre: 'Mi Tarea.DOCX', tamano: 10 });
    assert.equal(r.status, 201);
    assert.match(r.json.ruta, /^resoluciones\/[0-9a-f]{32}\.docx$/);
    assert.equal(JSON.stringify(r.json).includes('clave-secreta'), false);
  });

  test('sin configuración responde 503', async () => {
    delete process.env.SUPABASE_URL;
    assert.equal((await llamar(apiArchivos, { method: 'POST', body: { tipo: 'enunciado', nombre: 'a.pdf', tamano: 10 }, ip: otraIp() })).status, 503);
  });

  test('el enunciado se baja con el código y no expone su ruta', async () => {
    const creada = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T', curso: 'C', casoId: 'estudiante', enunciadoArchivos: [{ ruta: RUTA_ENUNCIADO, nombre: 'Guía' }, { ruta: RUTA_ENUNCIADO_2, nombre: 'Rúbrica' }] } });
    const conTeoria = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T', curso: 'C', casoId: 'estudiante', teoriaArchivos: [{ ruta: RUTA_ENUNCIADO_2, nombre: 'Lectura' }] } });
    const lectura = await llamar(apiArchivos, { query: { codigo: conTeoria.json.codigo, tipo: 'teoria' } });
    assert.match(lectura.json.url, /download=Lectura\.pdf$/);
    assert.deepEqual((await llamar(apiTareas, { query: { codigo: conTeoria.json.codigo } })).json.teoriaDescargas, ['Lectura.pdf']);
    const { codigo } = creada.json;
    const publica = await llamar(apiTareas, { query: { codigo } });
    assert.deepEqual(publica.json.enunciadoDescargas, ['Guía.pdf', 'Rúbrica.pdf']);
    assert.equal(JSON.stringify(publica.json).includes(RUTA_ENUNCIADO), false);
    const r = await llamar(apiArchivos, { query: { codigo } });
    assert.equal(r.status, 200);
    assert.match(r.json.url, /download=Gu%C3%ADa\.pdf$/);
    const segundo = await llamar(apiArchivos, { query: { codigo, indice: '1' } });
    assert.match(segundo.json.url, /download=R%C3%BAbrica\.pdf$/);
    assert.equal((await llamar(apiArchivos, { query: { codigo, indice: '5' } })).status, 404);
    assert.equal((await llamar(apiArchivos, { query: { codigo, tipo: 'teoria' } })).status, 404);
  });

  test('una ruta inventada por el cliente se descarta', async () => {
    const creada = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T', curso: 'C', casoId: 'estudiante', enunciadoArchivos: [{ ruta: '../secreto.pdf', nombre: 'x' }] } });
    assert.equal((await llamar(apiArchivos, { query: { codigo: creada.json.codigo } })).status, 404);
  });

  test('la entrega solo la baja el profesor de esa tarea', async () => {
    const crear = async () => (await llamar(apiTareas, { method: 'POST', body: { titulo: 'T', curso: 'C', casoId: 'estudiante' } })).json;
    const propia = await crear();
    const ajena = await crear();
    const doc = await llamar(apiDocumentos, { method: 'POST', body: { codigo: propia.codigo, titulo: 'R', texto, archivo: { ruta: RUTA_ENTREGA, nombre: 'Tarea.docx' } } });
    const { casoId } = doc.json;
    await llamar(apiSesiones, { method: 'POST', body: { codigo: propia.codigo, casoId, nombre: 'Ana', modo: 'evaluacion', resultados: { p1: { nivel: 'verde' } } } });

    const publico = await llamar(apiCasos, { query: { id: casoId } });
    assert.equal(JSON.stringify(publico.json).includes(RUTA_ENTREGA), false);

    const bajar = (t) => llamar(apiArchivos, { query: { codigo: t.codigo, casoId }, headers: { 'x-token-profesor': t.tokenProfesor } });
    assert.equal((await llamar(apiArchivos, { query: { codigo: propia.codigo, casoId } })).status, 401);
    assert.equal((await bajar(ajena)).status, 404);
    const ok = await bajar(propia);
    assert.equal(ok.status, 200);
    assert.match(ok.json.url, /download=Tarea\.docx$/);
  });
});

describe('/api/documentos', () => {
  const palabras = (n) => Array.from({ length: n }, (_, k) => `palabra${k}${k % 12 === 11 ? '.' : ''}`).join(' ');
  const documento = (texto) => ({ method: 'POST', body: { titulo: 'Informe', curso: 'Diseño', texto } });
  beforeEach(() => { for (const v of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']) delete process.env[v]; });

  test('rechaza trabajos con muy poco texto o demasiado largos', async () => {
    assert.equal((await llamar(apiDocumentos, documento(''))).status, 400);
    const corto = await llamar(apiDocumentos, documento(palabras(10)));
    assert.equal(corto.status, 400);
    assert.match(corto.json.error, /escaneado/i);
    assert.equal((await llamar(apiDocumentos, documento(palabras(15050)))).status, 400);
  });

  test('crea un caso defendible sin filtrar las respuestas', async () => {
    const r = await llamar(apiDocumentos, documento(palabras(300)));
    assert.equal(r.status, 201);
    assert.match(r.json.casoId, /^doc-[0-9a-f]{10}$/);
    assert.equal(r.json.puntos, 4);
    assert.equal(r.json.modoGeneracion, 'simulado');

    const publico = await llamar(apiCasos, { query: { id: r.json.casoId } });
    assert.equal(publico.status, 200);
    const ids = publico.json.documento.fragmentos.map((f) => f.id);
    for (const p of publico.json.puntos) assert.ok(ids.includes(p.fragmento), `${p.id} apunta a ${p.fragmento}`);
    const texto = JSON.stringify(publico.json);
    assert.equal(texto.includes('que_debe_explicar'), false);
    assert.equal(texto.includes('error_de_carlos'), false);
  });

  test('los criterios del profesor llegan a la IA y sus errores no llegan crudos al cliente', async () => {
    const ia = simularIA([{ status: 500, error: 'SECRETO-DEL-PROVEEDOR' }, { status: 500, error: 'SECRETO-DEL-PROVEEDOR' }]);
    const original = console.error;
    console.error = () => {};
    const r = await llamar(apiDocumentos, { method: 'POST', body: { titulo: 'Informe', curso: 'Diseño', criterios: 'CRITERIO-DE-PRUEBA', texto: palabras(300) } });
    console.error = original;
    ia.restaurar();
    assert.equal(r.status, 502);
    assert.equal(JSON.stringify(r.json).includes('SECRETO'), false);
    assert.match(ia.prompts[0], /CRITERIO-DE-PRUEBA/);
  });

  test('el enunciado del profesor llega al estudiante y a la IA', async () => {
    const creada = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: 'estudiante', enunciado: 'ENUNCIADO-DE-PRUEBA', enunciadoNombre: 'Guía 1' } });
    const { codigo } = creada.json;
    const publica = await llamar(apiTareas, { query: { codigo } });
    assert.equal(publica.json.enunciado, 'ENUNCIADO-DE-PRUEBA');
    assert.equal(publica.json.enunciadoNombre, 'Guía 1');

    const ia = simularIA([{ status: 500, error: 'x' }, { status: 500, error: 'x' }]);
    const original = console.error;
    console.error = () => {};
    await llamar(apiDocumentos, { method: 'POST', body: { codigo, titulo: 'Resolución', enunciado: 'FALSO', texto: palabras(300) } });
    console.error = original;
    ia.restaurar();
    assert.match(ia.prompts[0], /ENUNCIADO-DE-PRUEBA/);
    assert.equal(ia.prompts[0].includes('FALSO'), false);
  });

  test('la teoría del profesor llega al estudiante y a la IA', async () => {
    const creada = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: 'estudiante', teoria: 'TEORIA-DE-PRUEBA' } });
    const { codigo } = creada.json;
    assert.equal((await llamar(apiTareas, { query: { codigo } })).json.teoria, 'TEORIA-DE-PRUEBA');
    const ia = simularIA([{ status: 500, error: 'x' }, { status: 500, error: 'x' }]);
    const original = console.error;
    console.error = () => {};
    await llamar(apiDocumentos, { method: 'POST', body: { codigo, titulo: 'Resolución', texto: palabras(300) } });
    console.error = original;
    ia.restaurar();
    assert.match(ia.prompts[0], /TEORIA-DE-PRUEBA/);
  });

  test('un código de tarea inexistente responde 404', async () => {
    const r = await llamar(apiDocumentos, { method: 'POST', body: { codigo: 'ZZZ-ZZZ', titulo: 'Resolución', texto: palabras(300) } });
    assert.equal(r.status, 404);
  });

  test('una tarea puede usar como base el caso recién creado', async () => {
    const doc = await llamar(apiDocumentos, documento(palabras(300)));
    const r = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T1', curso: 'C1', casoId: doc.json.casoId } });
    assert.equal(r.status, 201);
  });
});

describe('puntos tipados (decisión, trampa, condición)', () => {
  const TIPOS = ['decision', 'trampa', 'trampa', 'condicion'];
  const palabras = (n) => Array.from({ length: n }, (_, k) => `palabra${k}${k % 12 === 11 ? '.' : ''}`).join(' ');
  beforeEach(() => { for (const v of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']) delete process.env[v]; });

  test('el caso demo conserva el tipo de cada punto y es el único que expone la respuesta simulada', async () => {
    const r = await llamar(apiCasos, { query: { id: 'demo' } });
    assert.deepEqual(r.json.puntos.map((p) => p.tipo), TIPOS);
    assert.ok(r.json.puntos.every((p) => p.simulado), 'el demo necesita su respuesta simulada');
  });

  test('un trabajo subido genera p1..p4 con los tipos del plan y sin respuesta simulada pública', async () => {
    const doc = await llamar(apiDocumentos, { method: 'POST', body: { titulo: 'Informe', curso: 'Diseño', texto: palabras(300) } });
    const publico = await llamar(apiCasos, { query: { id: doc.json.casoId } });
    assert.deepEqual(publico.json.puntos.map((p) => p.id), ['p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(publico.json.puntos.map((p) => p.tipo), TIPOS);
    assert.ok(publico.json.puntos.every((p) => !('simulado' in p)), 'solo el demo expone la respuesta simulada');
  });

  test('Carlos solo sostiene un error a propósito en las trampas', async () => {
    const doc = await llamar(apiDocumentos, { method: 'POST', body: { titulo: 'Informe', curso: 'Diseño', texto: palabras(300) } });
    const [p1, p2, p3] = (await almacen.leer('caso:' + doc.json.casoId)).puntos;
    assert.equal(p1.error_de_carlos, null);
    assert.ok(p2.error_de_carlos && p3.error_de_carlos, 'p2 y p3 deben traer un error de Carlos');
  });
});

describe('/api/carlos con las señales del navegador', () => {
  const ESTADOS = ['curioso', 'confundido', 'ironico', 'convencido'];
  let ia;
  afterEach(() => ia?.restaurar());

  test('GET informa ia:true cuando hay proveedor configurado', async () => {
    ia = simularIA([]);
    assert.deepEqual((await llamar(apiCarlos)).json, { ia: true });
  });

  test('acepta leyo y dubitativo y, si devuelve estado_carlos, es uno de los válidos', async () => {
    ia = simularIA([{ texto: JSON_TURNO }]);
    const r = await llamar(apiCarlos, { method: 'POST', body: { ...TURNO, leyo: true, dubitativo: true }, ip: otraIp() });
    assert.equal(r.status, 200);
    assert.ok(['verde', 'amarillo', 'rojo'].includes(r.json.nivel));
    if ('estado_carlos' in r.json) assert.ok(ESTADOS.includes(r.json.estado_carlos), `estado inválido: ${r.json.estado_carlos}`);
  });
});

describe('/api/sesiones: lo que ve el profesor', () => {
  const SESION = {
    codigo: 'DEMO-01', casoId: 'demo', nombre: 'Beatriz', modo: 'evaluacion', duracionSegundos: 312,
    resultados: {
      p1: { tema: 'Por qué Observer', tipo: 'decision', nivel: 'verde', motivo: 'Explicó el desacoplamiento.', evidencia: 'Reserva no cambia', leyo: false, dubitativo: true, conversacion: [{ rol: 'carlos', texto: 'Hola' }, { rol: 'estudiante', texto: 'Creo que desacopla.' }] },
      p4: { tema: 'Nuevo canal', tipo: 'condicion', nivel: 'amarillo', motivo: 'Idea parcial.', evidencia: 'agregaría otro observador', leyo: true, dubitativo: false, conversacion: [] },
    },
    senales: { pantallaOculta: 2, pegadoBloqueado: 1, leyo: 1, dubitativo: 1, captura: 0, iaCaida: false },
  };
  const TOKEN_DEMO = 'demo-profe-2026';

  test('el token por defecto de DEMO-01 abre sus reportes y conserva tipo, dubitativo y señales', async () => {
    await llamar(apiSesiones, { method: 'POST', body: SESION });
    const r = await llamar(apiSesiones, { query: { codigo: 'demo01' }, headers: { 'x-token-profesor': TOKEN_DEMO } });
    assert.equal(r.status, 200);
    const guardada = r.json.sesiones.find((s) => s.nombre === 'Beatriz');
    assert.equal(guardada.nivelGeneral, 'verde');
    assert.equal(guardada.duracionSegundos, 312);
    assert.equal(guardada.resultados.p1.tipo, 'decision');
    assert.equal(guardada.resultados.p1.dubitativo, true);
    assert.equal(guardada.resultados.p1.conversacion.length, 2);
    assert.equal(guardada.resultados.p4.tipo, 'condicion');
    assert.equal(guardada.resultados.p4.leyo, true);
    assert.equal(guardada.senales.dubitativo, 1);
    assert.equal(guardada.senales.pantallaOculta, 2);
  });

  test('un token de otra tarea no abre los reportes', async () => {
    const otra = await llamar(apiTareas, { method: 'POST', body: { titulo: 'T', curso: 'C', casoId: 'estudiante' } });
    const r = await llamar(apiSesiones, { query: { codigo: 'DEMO-01' }, headers: { 'x-token-profesor': otra.json.tokenProfesor } });
    assert.equal(r.status, 401);
  });

  test('normaliza tipos y niveles inválidos y acota las señales', async () => {
    const sucia = { ...SESION, nombre: 'Sucia', resultados: { p1: { tema: 'X', tipo: 'inventado', nivel: 'azul' } }, senales: { pantallaOculta: -5, pegadoBloqueado: 99999, leyo: 'abc' } };
    await llamar(apiSesiones, { method: 'POST', body: sucia });
    const r = await llamar(apiSesiones, { query: { codigo: 'DEMO-01' }, headers: { 'x-token-profesor': TOKEN_DEMO } });
    const guardada = r.json.sesiones.find((s) => s.nombre === 'Sucia');
    assert.equal(guardada.resultados.p1.tipo, 'decision');
    assert.equal(guardada.resultados.p1.nivel, 'rojo');
    assert.deepEqual([guardada.senales.pantallaOculta, guardada.senales.pegadoBloqueado, guardada.senales.leyo], [0, 999, 0]);
  });
});

describe('despliegue y secretos', () => {
  const leerTexto = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

  test('vercel.json incluye los casos en las funciones y fija maxDuration en 30', () => {
    const funciones = JSON.parse(leerTexto('../vercel.json')).functions['api/*.js'];
    assert.equal(funciones.includeFiles, 'modulos/casos/datos/**');
    assert.equal(funciones.maxDuration, 30);
  });

  test('.env.example no trae valores y .env está ignorado por git', () => {
    const asignaciones = leerTexto('../.env.example').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    assert.ok(asignaciones.length > 0);
    for (const l of asignaciones) assert.match(l, /^[A-Z_]+=$/, `no debe llevar valor: ${l.split('=')[0]}`);
    assert.ok(leerTexto('../.gitignore').split('\n').map((l) => l.trim()).includes('.env'));
  });

  test('el repositorio no depende de paquetes npm', () => {
    const paquete = JSON.parse(leerTexto('../package.json'));
    assert.equal(paquete.type, 'module');
    assert.equal(paquete.dependencies, undefined);
    assert.equal(paquete.devDependencies, undefined);
  });
});
