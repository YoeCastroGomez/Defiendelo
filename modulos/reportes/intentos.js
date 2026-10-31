// Intentos de entrega: el servidor emite un identificador al empezar una entrega y guarda ahí cada
// evaluación de Carlos. El reporte final se arma con estos registros, nunca con lo que mande el navegador.
import { randomBytes } from 'node:crypto';
import { guardar, leer, agregar, listar, incrementar } from '../../compartido/almacen.js';
import { errorHttp, limpio, igualSeguro } from '../../compartido/http.js';
import { obtenerTareaInterna } from '../tareas/tareas.js';
import { cargarCaso, esCasoPrivado, formatoCasoValido } from '../casos/casos.js';

export const CODIGO_DEMO = 'DEMO-01'; // se puede repetir: lo usan el jurado y quienes prueban la app
const MAX_TURNOS_POR_PUNTO = 2; // la respuesta y, como mucho, una repregunta
const VIDA_CONTADOR = 60 * 60 * 24 * 60; // igual que los demás datos: 60 días

export const claveNombre = (v) => limpio(v, 80).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');

export async function entregaPrevia(tarea, nombre) {
  if (tarea.codigo === CODIGO_DEMO) return null;
  const clave = claveNombre(nombre);
  return (await listar('sesiones:' + tarea.codigo)).find((s) => claveNombre(s.nombre) === clave) || null;
}

// En una tarea con trabajo base, el caso es siempre el de la tarea. Si cada estudiante sube el suyo,
// el caso debe haberse creado para esta tarea y quien empieza debe tener su llave.
async function casoDelIntento(tarea, casoIdRaw, llave) {
  if (tarea.casoId !== 'estudiante') return tarea.casoId;
  const casoId = limpio(casoIdRaw, 64);
  const caso = formatoCasoValido(casoId) ? await cargarCaso(casoId).catch(() => null) : null;
  if (!caso || !esCasoPrivado(caso) || caso.codigo !== tarea.codigo || !igualSeguro(caso.llave, String(llave || ''))) {
    throw errorHttp('Ese trabajo no corresponde a esta tarea. Vuelve a subir tu archivo.', 403);
  }
  return caso.id;
}

export async function iniciarIntento({ codigo, nombre, casoId, llave } = {}) {
  const n = limpio(nombre, 80);
  if (!n) throw errorHttp('Falta el nombre del estudiante', 400);
  const tarea = await obtenerTareaInterna(codigo);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);
  if (tarea.cerrada) throw errorHttp('Esta tarea está cerrada: ya no recibe entregas. Todavía puedes ensayar.', 403);
  if (await entregaPrevia(tarea, n)) throw errorHttp('Ya entregaste esta tarea con ese nombre. Solo se permite un intento; puedes seguir ensayando.', 409);

  const intento = {
    id: randomBytes(12).toString('hex'),
    codigo: tarea.codigo,
    casoId: await casoDelIntento(tarea, casoId, llave),
    nombre: n,
    creado: new Date().toISOString(),
  };
  for (let k = 0; k < 3 && !(await guardar('intento:' + intento.id, intento)); k++) intento.id = randomBytes(12).toString('hex');
  return { intento: intento.id, casoId: intento.casoId };
}

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
}

export async function registrarEvaluacion(intento, puntoId, registro) {
  await agregar('evaluaciones:' + intento.id, { puntoId, ...registro, creado: new Date().toISOString() });
}

// El último registro final de cada punto. Un punto que quedó en repregunta no cuenta como evaluado.
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
    if (final) finales.set(pid, { final, turnos: lista });
  }
  return finales;
}
