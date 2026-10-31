// Lógica de negocio de reportes de sesiones. El reporte de una entrega se arma con las evaluaciones
// que el servidor registró durante el intento: el navegador solo aporta las señales que únicamente
// él puede observar (salidas de la pestaña, intentos de pegar y de captura).
import { randomBytes } from 'node:crypto';
import { agregar, listar, leer, recortarLista } from '../../compartido/almacen.js';
import { errorHttp, limpio } from '../../compartido/http.js';
import { obtenerTareaInterna, verificarTokenProfesor, plazoVencido } from '../tareas/tareas.js';
import { cargarCaso } from '../casos/casos.js';
import {
  leerIntento, evaluacionesFinales, evaluacionesDe, entregaPrevia, casoDelIntento, crearIntento,
  intentoVigenteDe, esIntentoVigente, entregaDelIntento, marcarEntrega, listarIntentos, CODIGO_DEMO,
} from './intentos.js';

const MAX_SESIONES_DEMO = 200; // la demo admite entregas ilimitadas: solo se guardan las últimas
const MINUTOS_ABANDONO = 20; // sin actividad durante este tiempo, una entrega empezada se cierra sola

const enteroSenal = (v) => Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));
const TIPOS = ['decision', 'trampa', 'condicion'];

export function calcularNivelGeneral(resultadosObj) {
  const puntos = Object.values(resultadosObj || {});
  if (!puntos.length) return 'rojo';
  const peso = { verde: 2, amarillo: 1, rojo: 0 };
  const suma = puntos.reduce((acc, p) => acc + (peso[p?.nivel] ?? 0), 0);
  const prom = suma / puntos.length;
  if (prom >= 1.5) return 'verde';
  if (prom >= 0.8) return 'amarillo';
  return 'rojo';
}

// Un punto sin evaluación registrada (por ejemplo, si el navegador lo evaluó sin conexión) cuenta como rojo
// y queda marcado para que el profesor lo revise.
function resultadosRegistrados(caso, finales) {
  const resultados = {};
  for (const p of caso.puntos) {
    const tipo = TIPOS.includes(p.tipo) ? p.tipo : 'decision';
    const reg = finales.get(p.id);
    if (!reg) {
      resultados[p.id] = { tema: p.tema, tipo, nivel: 'rojo', motivo: 'No hay una evaluación registrada en el servidor para este punto.', evidencia: '', leyo: false, dubitativo: false, sinRegistro: true, conversacion: [] };
      continue;
    }
    const conversacion = [{ rol: 'carlos', texto: p.apertura }];
    reg.turnos.forEach((t, k) => {
      conversacion.push({ rol: 'estudiante', texto: t.respuesta });
      // La última intervención de Carlos solo se muestra si quedó una repregunta sin responder.
      if (k < reg.turnos.length - 1 || reg.pendiente) conversacion.push({ rol: 'carlos', texto: t.carlos_dice });
    });
    const f = reg.final;
    resultados[p.id] = {
      tema: p.tema, tipo, nivel: f.nivel,
      motivo: reg.pendiente ? `${f.motivo} (Carlos le repreguntó y no alcanzó a responder.)`.trim() : f.motivo,
      evidencia: f.evidencia,
      leyo: reg.turnos.some((t) => t.leyo), dubitativo: reg.turnos.some((t) => t.dubitativo),
      origen: f.origen, ...(reg.pendiente ? { pendiente: true } : {}), conversacion,
    };
  }
  return resultados;
}

function senalesDeSesion(raw, resultados, finales, abandonada, fueraDePlazo) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const turnos = [...finales.values()].flatMap((r) => r.turnos);
  return {
    pantallaOculta: enteroSenal(s.pantallaOculta),
    pegadoBloqueado: enteroSenal(s.pegadoBloqueado),
    captura: enteroSenal(s.captura),
    leyo: turnos.filter((t) => t.leyo).length,
    dubitativo: turnos.filter((t) => t.dubitativo).length,
    iaCaida: turnos.some((t) => t.iaCaida),
    sinRegistro: Object.values(resultados).filter((r) => r.sinRegistro).length,
    abandonada: !!abandonada,
    // Entregada después de la fecha límite: en una práctica es solo un dato; en una evaluación,
    // es alguien que empezó a tiempo y terminó tarde. El profesor decide si la califica.
    fueraDePlazo: !!fueraDePlazo,
  };
}

// Abre una entrega. Hay un solo intento vigente por estudiante y tarea: si ya había uno con respuestas
// (se fue a mitad), ese se entrega con lo que alcanzó a responder y no se abre otro.
export async function iniciarIntento({ codigo, nombre, casoId, llave } = {}) {
  const n = limpio(nombre, 80);
  if (!n) throw errorHttp('Falta el nombre del estudiante', 400);
  const tarea = await obtenerTareaInterna(codigo);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);
  if (tarea.cerrada) throw errorHttp('Esta tarea está cerrada: ya no recibe entregas. Todavía puedes ensayar.', 403);
  if (tarea.tipoActividad === 'evaluacion' && plazoVencido(tarea)) throw errorHttp('El plazo de esta evaluación ya venció: ya no recibe entregas. Todavía puedes ensayar.', 403);
  if (await entregaPrevia(tarea, n)) throw errorHttp('Ya entregaste esta tarea con ese nombre. Solo se permite un intento; puedes seguir ensayando.', 409);

  const previo = tarea.codigo === CODIGO_DEMO ? null : await intentoVigenteDe(tarea.codigo, n);
  if (previo && (await evaluacionesDe(previo)).length) {
    await cerrarIntento(previo, { abandonada: true });
    throw errorHttp('Ya habías empezado esta entrega y saliste a mitad: se entregó lo que alcanzaste a responder. Solo se permite un intento; puedes seguir ensayando.', 409);
  }
  const intento = await crearIntento(tarea, n, await casoDelIntento(tarea, casoId, llave));
  return { intento: intento.id, casoId: intento.casoId };
}

export async function guardarSesion(datos = {}) {
  if (datos.modo !== 'evaluacion') throw errorHttp('Solo se guardan reportes en modo evaluación', 400);
  if (!datos.intento) throw errorHttp('Falta el intento de la entrega', 400);
  return cerrarIntento(await leerIntento(datos.intento), { senales: datos.senales, abandonada: datos.abandonada === true });
}

async function cerrarIntento(intento, { senales: senalesRaw, abandonada = false } = {}) {
  const tarea = await obtenerTareaInterna(intento.codigo);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);

  // Un reintento del mismo intento (se perdió la respuesta) no es una segunda entrega.
  const marca = await entregaDelIntento(intento);
  if (marca) {
    if (marca.intento === intento.id) return { id: marca.id, nivelGeneral: marca.nivelGeneral };
    throw errorHttp('Ya entregaste esta tarea con ese nombre. Solo se permite un intento.', 409);
  }
  if (!(await esIntentoVigente(intento))) throw errorHttp('Este intento ya no es válido: se empezó otra entrega con ese nombre.', 409);
  const previa = await entregaPrevia(tarea, intento.nombre);
  if (previa) throw errorHttp('Ya entregaste esta tarea con ese nombre. Solo se permite un intento.', 409);

  const caso = await cargarCaso(intento.casoId);
  const finales = await evaluacionesFinales(intento);
  if (!finales.size) throw errorHttp('La sesión debe contener al menos un punto respondido', 400);
  const resultados = resultadosRegistrados(caso, finales);
  // "Abandonada" es salir con puntos sin responder. Si respondió todo y solo falló el envío final, no lo es.
  const completa = caso.puntos.every((p) => finales.has(p.id) && !finales.get(p.id).pendiente);
  const ultimaRespuesta = Math.max(...[...finales.values()].flatMap((r) => r.turnos.map((t) => Date.parse(t.creado) || 0)));
  const senales = senalesDeSesion(senalesRaw, resultados, finales, abandonada && !completa, plazoVencido(tarea, abandonada ? ultimaRespuesta : Date.now()));
  const nivelGeneral = calcularNivelGeneral(resultados);

  // La duración va de que el servidor abrió el intento a la última respuesta registrada.
  const ultimo = Math.max(...[...finales.values()].flatMap((r) => r.turnos.map((t) => Date.parse(t.creado) || 0)));
  const fin = abandonada ? ultimo : Date.now();
  const transcurrido = Math.round((fin - Date.parse(intento.creado)) / 1000);
  const duracionSegundos = Math.max(0, Math.min(7200, Number.isFinite(transcurrido) ? transcurrido : 0));

  const sesion = {
    id: 'ses_' + randomBytes(5).toString('hex'),
    universidadId: 'demo',
    codigo: tarea.codigo,
    casoId: intento.casoId,
    nombre: intento.nombre,
    modo: 'evaluacion',
    nivelGeneral,
    intento: intento.id,
    duracionSegundos,
    resultados,
    senales,
    creada: new Date().toISOString(),
  };

  // La marca es atómica: si dos cierres llegan a la vez, solo uno guarda la sesión.
  const otra = await marcarEntrega(intento, { id: sesion.id, nivelGeneral });
  if (otra) {
    if (otra.intento === intento.id) return { id: otra.id, nivelGeneral: otra.nivelGeneral };
    throw errorHttp('Ya entregaste esta tarea con ese nombre. Solo se permite un intento.', 409);
  }
  await agregar('sesiones:' + tarea.codigo, sesion);
  if (tarea.codigo === CODIGO_DEMO) await recortarLista('sesiones:' + tarea.codigo, MAX_SESIONES_DEMO);
  return { id: sesion.id, nivelGeneral };
}

// Entregas empezadas, con respuestas y sin actividad hace rato: se cierran como abandonadas para que
// el profesor las vea. Los intentos sin ninguna respuesta no cuentan como entrega.
async function cerrarAbandonadas(tarea) {
  if (tarea.codigo === CODIGO_DEMO) return;
  const limite = Date.now() - MINUTOS_ABANDONO * 60 * 1000;
  for (const { id } of await listarIntentos(tarea.codigo)) {
    const intento = await leer('intento:' + id);
    if (!intento || await entregaDelIntento(intento) || !(await esIntentoVigente(intento))) continue;
    const evaluaciones = await evaluacionesDe(intento);
    if (!evaluaciones.length || Math.max(...evaluaciones.map((e) => Date.parse(e.creado) || 0)) > limite) continue;
    await cerrarIntento(intento, { abandonada: true }).catch((e) => console.error('[sesiones] no se cerró un intento abandonado:', e.message));
  }
}

export async function consultarSesiones(codigoRaw, tokenRecibido) {
  const tarea = await obtenerTareaInterna(codigoRaw);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);
  if (tarea.codigo === CODIGO_DEMO && !tarea.tokenProfesor) {
    throw errorHttp('Los reportes de DEMO-01 están desactivados: configura DEMO_TOKEN_PROFESOR en el servidor.', 401);
  }
  if (!verificarTokenProfesor(tarea, tokenRecibido)) {
    throw errorHttp('Token de profesor inválido o ausente', 401);
  }

  await cerrarAbandonadas(tarea);
  const sesiones = await listar('sesiones:' + tarea.codigo);
  sesiones.reverse();

  return {
    tarea: {
      codigo: tarea.codigo,
      titulo: tarea.titulo,
      curso: tarea.curso,
      profesor: tarea.profesor,
      criterios: tarea.criterios,
      cierre: tarea.cierre,
      tipoActividad: tarea.tipoActividad || null,
      fechaLimite: tarea.fechaLimite || null,
      cerrada: !!tarea.cerrada,
      casoId: tarea.casoId,
      creada: tarea.creada,
    },
    sesiones,
  };
}
