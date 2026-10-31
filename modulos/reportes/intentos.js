// Intentos de entrega: el servidor emite un identificador al empezar una entrega y guarda ahí cada
// evaluación de Carlos. El reporte final se arma con estos registros, nunca con lo que mande el navegador.
// Cada estudiante tiene un solo intento vigente por tarea: abrir otro cierra el anterior si ya respondió algo.
import { randomBytes } from 'node:crypto';
import { guardar, leer, reemplazar, agregar, listar, incrementar } from '../../compartido/almacen.js';
import { errorHttp, limpio, igualSeguro } from '../../compartido/http.js';
import { cargarCaso, esCasoPrivado, formatoCasoValido } from '../casos/casos.js';

export const CODIGO_DEMO = 'DEMO-01'; // se puede repetir: lo usan el jurado y quienes prueban la app
const MAX_TURNOS_POR_PUNTO = 2; // la respuesta y, como mucho, una repregunta
const VIDA_CONTADOR = 60 * 60 * 24 * 60; // igual que los demás datos: 60 días

export const claveNombre = (v) => limpio(v, 80).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
const esDemo = (codigo) => codigo === CODIGO_DEMO;

// Claves en el almacén:
//   intento-de:<codigo>:<nombre> → id del único intento vigente de ese estudiante en esa tarea
//   entrega:<codigo>:<nombre>    → marca atómica de que ese estudiante ya entregó (o entrega-intento:<id> en la demo)
//   intentos:<codigo>            → lista de intentos abiertos, para cerrar los abandonados
const claveVigente = (codigo, nombre) => `intento-de:${codigo}:${claveNombre(nombre)}`;
export const claveEntrega = (intento) => (esDemo(intento.codigo) ? `entrega-intento:${intento.id}` : `entrega:${intento.codigo}:${claveNombre(intento.nombre)}`);

export async function entregaPrevia(tarea, nombre) {
  if (esDemo(tarea.codigo)) return null;
  const marca = await leer(`entrega:${tarea.codigo}:${claveNombre(nombre)}`);
  if (marca) return marca;
  // Entregas guardadas antes de que existiera la marca.
  const clave = claveNombre(nombre);
  return (await listar('sesiones:' + tarea.codigo)).find((s) => claveNombre(s.nombre) === clave) || null;
}

// En una tarea con trabajo base, el caso es siempre el de la tarea. Si cada estudiante sube el suyo,
// el caso debe haberse creado para esta tarea y quien empieza debe tener su llave.
export async function casoDelIntento(tarea, casoIdRaw, llave) {
  if (tarea.casoId !== 'estudiante') return tarea.casoId;
  const casoId = limpio(casoIdRaw, 64);
  const caso = formatoCasoValido(casoId) ? await cargarCaso(casoId).catch(() => null) : null;
  if (!caso || !esCasoPrivado(caso) || caso.codigo !== tarea.codigo || !igualSeguro(caso.llave, String(llave || ''))) {
    throw errorHttp('Ese trabajo no corresponde a esta tarea. Vuelve a subir tu archivo.', 403);
  }
  return caso.id;
}

export async function intentoVigenteDe(codigo, nombre) {
  const id = await leer(claveVigente(codigo, nombre));
  return id ? leer('intento:' + id) : null;
}

// Crea el intento y lo deja como el único vigente de ese nombre. Si dos se abren a la vez, gana el
// último en escribirse y el otro deja de servir (ver esIntentoVigente).
export async function crearIntento(tarea, nombre, casoId) {
  const intento = { id: randomBytes(12).toString('hex'), codigo: tarea.codigo, casoId, nombre, creado: new Date().toISOString() };
  while (!(await guardar('intento:' + intento.id, intento))) intento.id = randomBytes(12).toString('hex');
  if (!esDemo(tarea.codigo)) {
    const clave = claveVigente(tarea.codigo, nombre);
    if (!(await guardar(clave, intento.id))) await reemplazar(clave, intento.id);
    await agregar('intentos:' + tarea.codigo, { id: intento.id, nombre, creado: intento.creado });
  }
  return intento;
}

export async function esIntentoVigente(intento) {
  if (esDemo(intento.codigo)) return true;
  return (await leer(claveVigente(intento.codigo, intento.nombre))) === intento.id;
}

export const entregaDelIntento = (intento) => leer(claveEntrega(intento));

// Marca la entrega de forma atómica: si ya había una, devuelve la existente sin escribir.
export async function marcarEntrega(intento, datos) {
  const clave = claveEntrega(intento);
  if (await guardar(clave, { ...datos, intento: intento.id })) return null;
  return leer(clave);
}

export const listarIntentos = (codigo) => listar('intentos:' + codigo);
export const evaluacionesDe = (intento) => listar('evaluaciones:' + intento.id);

export async function leerIntento(idRaw) {
  const id = String(idRaw || '');
  if (!/^[0-9a-f]{24}$/.test(id)) throw errorHttp('Intento con formato inválido', 400);
  const intento = await leer('intento:' + id);
  if (!intento) throw errorHttp('El intento no existe o ya venció. Vuelve a empezar la entrega.', 404);
  return intento;
}

export async function turnosDelPunto(intento, puntoId) {
  return (await listar('evaluaciones:' + intento.id)).filter((e) => e.puntoId === puntoId);
}

// Reserva el turno antes de evaluar. El contador es atómico: dos peticiones simultáneas no pueden
// evaluar el mismo punto más veces de las permitidas.
export async function reservarTurno(intento, puntoId) {
  const n = await incrementar(`turnos:${intento.id}:${puntoId}`, VIDA_CONTADOR);
  if (n > MAX_TURNOS_POR_PUNTO) throw errorHttp('Este punto ya fue evaluado en esta entrega.', 409);
  return n;
}

export async function registrarEvaluacion(intento, puntoId, registro) {
  await agregar('evaluaciones:' + intento.id, { puntoId, ...registro, creado: new Date().toISOString() });
}

// La evaluación con la que cuenta cada punto respondido: la final, o, si el estudiante se fue mientras
// Carlos le repreguntaba, la última que alcanzó a registrar (marcada como pendiente).
export async function evaluacionesFinales(intento) {
  const porPunto = new Map();
  for (const e of await listar('evaluaciones:' + intento.id)) {
    const lista = porPunto.get(e.puntoId) || [];
    lista.push(e);
    porPunto.set(e.puntoId, lista);
  }
  const finales = new Map();
  for (const [pid, lista] of porPunto) {
    const final = lista.find((e) => e.final);
    finales.set(pid, { final: final || lista[lista.length - 1], turnos: final ? lista.slice(0, lista.indexOf(final) + 1) : lista, pendiente: !final });
  }
  return finales;
}
