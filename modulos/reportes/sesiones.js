// Lógica de negocio de reportes de sesiones: recálculo en servidor del nivel general,
// sanitización de resultados y señales (incluyendo dubitativo), y consulta protegida con tokenProfesor.
import { randomBytes } from 'node:crypto';
import { agregar, listar } from '../../compartido/almacen.js';
import { obtenerTareaInterna, verificarTokenProfesor } from '../tareas/tareas.js';

function errorHttp(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const limpio = (v, max) => String(v || '').trim().slice(0, max);
const enteroSenal = (v) => Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));

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

function sanitizarResultados(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw errorHttp('Formato de resultados inválido', 400);
  }
  const entradas = Object.entries(raw).slice(0, 12);
  if (!entradas.length) {
    throw errorHttp('La sesión debe contener al menos un punto evaluado', 400);
  }
  const limpios = {};
  for (const [idRaw, r] of entradas) {
    const pid = limpio(idRaw, 32);
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(pid) || !r || typeof r !== 'object') {
      throw errorHttp('Identificador o contenido de punto inválido', 400);
    }
    const nivel = ['verde', 'amarillo', 'rojo'].includes(r.nivel) ? r.nivel : 'rojo';
    const tipo = ['decision', 'trampa', 'condicion'].includes(r.tipo) ? r.tipo : 'decision';
    const convRaw = Array.isArray(r.conversacion) ? r.conversacion.slice(0, 12) : [];
    const conversacion = convRaw.map((m) => ({
      rol: m?.rol === 'carlos' ? 'carlos' : 'estudiante',
      texto: limpio(m?.texto, 2000) || '(sin texto)',
    }));
    limpios[pid] = {
      tema: limpio(r.tema, 140),
      tipo,
      nivel,
      motivo: limpio(r.motivo, 350),
      evidencia: limpio(r.evidencia, 240),
      leyo: !!r.leyo,
      dubitativo: !!r.dubitativo,
      conversacion,
    };
  }
  return limpios;
}

function sanitizarSenales(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    pantallaOculta: enteroSenal(s.pantallaOculta),
    pegadoBloqueado: enteroSenal(s.pegadoBloqueado),
    leyo: enteroSenal(s.leyo),
    dubitativo: enteroSenal(s.dubitativo),
    captura: enteroSenal(s.captura),
    iaCaida: !!s.iaCaida,
  };
}

export async function guardarSesion(datos = {}) {
  if (datos.modo !== 'evaluacion') {
    throw errorHttp('Solo se guardan reportes en modo evaluación', 400);
  }
  const nombre = limpio(datos.nombre, 80);
  if (!nombre) throw errorHttp('Falta el nombre del estudiante', 400);

  const tarea = await obtenerTareaInterna(datos.codigo);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);

  const resultados = sanitizarResultados(datos.resultados);
  const senales = sanitizarSenales(datos.senales);
  const nivelGeneral = calcularNivelGeneral(resultados);

  const casoRaw = limpio(datos.casoId, 64);
  const casoId = /^[a-z0-9-]{1,64}$/.test(casoRaw) && casoRaw !== 'estudiante'
    ? casoRaw
    : (tarea.casoId !== 'estudiante' ? tarea.casoId : 'demo');

  const duracionSegundos = Math.max(0, Math.min(7200, Math.round(Number(datos.duracionSegundos) || 0)));

  const sesion = {
    id: 'ses_' + randomBytes(5).toString('hex'),
    universidadId: 'demo',
    codigo: tarea.codigo,
    casoId,
    nombre,
    modo: 'evaluacion',
    nivelGeneral,
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
      casoId: tarea.casoId,
      creada: tarea.creada,
    },
    sesiones,
  };
}
