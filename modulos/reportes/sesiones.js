// Lógica de negocio de reportes de sesiones. El reporte de una entrega se arma con las evaluaciones
// que el servidor registró durante el intento: el navegador solo aporta las señales que únicamente
// él puede observar (salidas de la pestaña, intentos de pegar y de captura).
import { randomBytes } from 'node:crypto';
import { agregar, listar } from '../../compartido/almacen.js';
import { errorHttp, limpio } from '../../compartido/http.js';
import { obtenerTareaInterna, verificarTokenProfesor } from '../tareas/tareas.js';
import { cargarCaso } from '../casos/casos.js';
import { leerIntento, evaluacionesFinales, entregaPrevia, CODIGO_DEMO } from './intentos.js';

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
      if (k < reg.turnos.length - 1) conversacion.push({ rol: 'carlos', texto: t.carlos_dice });
    });
    const f = reg.final;
    resultados[p.id] = {
      tema: p.tema, tipo, nivel: f.nivel, motivo: f.motivo, evidencia: f.evidencia,
      leyo: reg.turnos.some((t) => t.leyo), dubitativo: reg.turnos.some((t) => t.dubitativo),
      origen: f.origen, conversacion,
    };
  }
  return resultados;
}

function senalesDeSesion(raw, resultados, finales) {
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
  };
}

export async function guardarSesion(datos = {}) {
  if (datos.modo !== 'evaluacion') throw errorHttp('Solo se guardan reportes en modo evaluación', 400);
  if (!datos.intento) throw errorHttp('Falta el intento de la entrega', 400);
  const intento = await leerIntento(datos.intento);

  const tarea = await obtenerTareaInterna(intento.codigo);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);

  // Un reintento del mismo intento (se perdió la respuesta) no es una segunda entrega.
  const previa = await entregaPrevia(tarea, intento.nombre);
  if (previa) {
    if (previa.intento === intento.id) return { id: previa.id, nivelGeneral: previa.nivelGeneral };
    throw errorHttp('Ya entregaste esta tarea con ese nombre. Solo se permite un intento.', 409);
  }
  if (tarea.codigo === CODIGO_DEMO) {
    const repetida = (await listar('sesiones:' + tarea.codigo)).find((s) => s.intento === intento.id);
    if (repetida) return { id: repetida.id, nivelGeneral: repetida.nivelGeneral };
  }

  const caso = await cargarCaso(intento.casoId);
  const finales = await evaluacionesFinales(intento);
  if (!finales.size) throw errorHttp('La sesión debe contener al menos un punto evaluado', 400);
  const resultados = resultadosRegistrados(caso, finales);
  const senales = senalesDeSesion(datos.senales, resultados, finales);
  const nivelGeneral = calcularNivelGeneral(resultados);

  // La duración se mide desde que el servidor abrió el intento.
  const transcurrido = Math.round((Date.now() - Date.parse(intento.creado)) / 1000);
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

  await agregar('sesiones:' + tarea.codigo, sesion);
  return { id: sesion.id, nivelGeneral };
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
      cerrada: !!tarea.cerrada,
      casoId: tarea.casoId,
      creada: tarea.creada,
    },
    sesiones,
  };
}
