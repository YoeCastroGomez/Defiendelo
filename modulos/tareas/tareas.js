// Lógica de negocio de tareas: generación de códigos sin caracteres ambiguos,
// emisión y verificación de tokenProfesor, y soporte dual (entrega del estudiante o caso base).
import { randomBytes, randomInt } from 'node:crypto';
import { guardar, leer, reemplazar, persistente } from '../../compartido/almacen.js';
import { errorHttp, limpio, igualSeguro } from '../../compartido/http.js';
import { cargarCaso, esCasoPrivado } from '../casos/casos.js';
import { limpiarArchivo } from '../../compartido/archivos.js';

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L
const MAX_ARCHIVOS = 5;
const archivosEnviados = (lista) => (Array.isArray(lista) ? lista : []).map((a) => limpiarArchivo(a, 'enunciado')).filter(Boolean).slice(0, MAX_ARCHIVOS);

// Las tareas creadas antes guardaban un solo archivo en enunciadoArchivo.
export const archivosDeInstrucciones = (t) => t.enunciadoArchivos || (t.enunciadoArchivo ? [t.enunciadoArchivo] : []);

const nuevoCodigo = () => {
  const c = Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return c.slice(0, 3) + '-' + c.slice(3);
};

function tareaDemo() {
  return {
    universidadId: 'demo',
    codigo: 'DEMO-01',
    titulo: 'Informe de diseño: módulo de notificaciones',
    curso: 'Diseño de Software',
    profesor: 'Prof. de demostración',
    criterios: 'Por qué se eligió Observer, cómo reduce el acoplamiento, en qué se diferencia de Strategy y cómo se extiende el diseño.',
    cierre: '',
    tipoActividad: 'practica',
    fechaLimite: null, // la demo no vence
    casoId: 'demo',
    // Sin DEMO_TOKEN_PROFESOR no hay token: los reportes de la demo quedan cerrados.
    tokenProfesor: process.env.DEMO_TOKEN_PROFESOR || '',
    creada: '2026-10-30T00:00:00.000Z',
  };
}

// Tipo de actividad y fecha límite. En una evaluación, pasada la fecha ya no se puede empezar a entregar.
// En una práctica la fecha es referencial: se puede entregar después, pero queda marcado como fuera de plazo.
export const TIPOS_ACTIVIDAD = ['evaluacion', 'practica'];
const MAX_DIAS_PLAZO = 366;

function fechaLimiteValida(raw) {
  const ms = Date.parse(String(raw || ''));
  if (!raw || !Number.isFinite(ms)) throw errorHttp('Indica la fecha límite de la tarea', 400);
  if (ms < Date.now() - 5 * 60 * 1000) throw errorHttp('La fecha límite ya pasó: elige una fecha futura', 400);
  if (ms > Date.now() + MAX_DIAS_PLAZO * 24 * 60 * 60 * 1000) throw errorHttp('La fecha límite no puede estar a más de un año', 400);
  return new Date(ms).toISOString();
}

// ¿Venció el plazo de la tarea? Las tareas antiguas o la demo no tienen fecha y nunca vencen.
export const plazoVencido = (tarea, ahora = Date.now()) => !!tarea?.fechaLimite && ahora > Date.parse(tarea.fechaLimite);
// En una práctica el estudiante rinde las veces que quiera; en una evaluación, una sola vez.
// Las tareas antiguas, sin tipo, se tratan como evaluación. La demo siempre se puede repetir.
export const esRepetible = (tarea) => tarea?.codigo === 'DEMO-01' || tarea?.tipoActividad === 'practica';
// En una evaluación solo se responde por voz, salvo que el profesor permita responder por escrito.
export const soloVoz = (tarea) => !esRepetible(tarea) && tarea?.tipoActividad === 'evaluacion' && !tarea.permitirEscrito;
// En una evaluación vencida ya no se reciben entregas nuevas (igual que una tarea cerrada).
export const noRecibeEntregas = (tarea) => !!tarea.cerrada || (tarea.tipoActividad === 'evaluacion' && plazoVencido(tarea));

export function normalizarCodigo(raw) {
  let codigo = limpio(raw, 12).toUpperCase().replace(/[\s_]/g, '');
  if (codigo.replace(/-/g, '') === 'DEMO01') codigo = 'DEMO-01'; // también "DEM-O01" de clientes antiguos
  else if (/^[A-Z0-9]{6}$/.test(codigo)) codigo = codigo.slice(0, 3) + '-' + codigo.slice(3);
  if (!/^[A-Z0-9]{3,4}-[A-Z0-9]{2,3}$/.test(codigo)) {
    throw errorHttp('Código con formato inválido', 400);
  }
  return codigo;
}

export async function crearTarea(datos = {}) {
  const titulo = limpio(datos.titulo, 120);
  const curso = limpio(datos.curso, 80);
  if (!titulo || !curso) throw errorHttp('Faltan el título o el curso', 400);
  if (!TIPOS_ACTIVIDAD.includes(datos.tipoActividad)) throw errorHttp('Indica si la tarea es una evaluación o una práctica', 400);
  const fechaLimite = fechaLimiteValida(datos.fechaLimite);

  const casoId = limpio(datos.casoId, 64) || 'demo';
  if (casoId !== 'estudiante') {
    if (!/^[a-z0-9-]{1,64}$/.test(casoId)) throw errorHttp('Identificador de caso inválido', 400);
    let caso;
    try {
      caso = await cargarCaso(casoId);
    } catch {
      throw errorHttp('El caso base seleccionado no existe', 404);
    }
    // Un trabajo subido solo lo puede usar como base quien lo subió: si no, bastaría conocer su id
    // para crear una tarea con él y leerlo.
    if (esCasoPrivado(caso) && !igualSeguro(caso.llave, String(datos.llaveCaso || ''))) {
      throw errorHttp('No tienes permiso para usar ese trabajo como base', 403);
    }
  }

  const tokenProfesor = randomBytes(16).toString('hex');
  const tarea = {
    universidadId: 'demo',
    codigo: '',
    titulo,
    curso,
    profesor: limpio(datos.profesor, 80),
    criterios: limpio(datos.criterios, 600),
    enunciado: limpio(datos.enunciado, 40000),
    enunciadoNombre: limpio(datos.enunciadoNombre, 120),
    teoria: limpio(datos.teoria, 150000),
    teoriaArchivos: archivosEnviados(datos.teoriaArchivos),
    enunciadoArchivos: archivosEnviados(datos.enunciadoArchivos),
    cierre: '', // reemplazado por fechaLimite; se conserva para las tareas antiguas
    tipoActividad: datos.tipoActividad,
    fechaLimite,
    // Solo tiene sentido en una evaluación: casos justificados (dificultad del habla, sin micrófono).
    permitirEscrito: datos.tipoActividad === 'evaluacion' && datos.permitirEscrito === true,
    casoId,
    cerrada: false,
    tokenProfesor,
    creada: new Date().toISOString(),
  };

  for (let k = 0; k < 5; k++) {
    tarea.codigo = nuevoCodigo();
    if (await guardar('tarea:' + tarea.codigo, tarea)) {
      return { codigo: tarea.codigo, persistente: persistente(), tokenProfesor };
    }
  }
  throw errorHttp('No se pudo generar un código, intenta de nuevo', 500);
}

export async function obtenerTareaInterna(codigoRaw) {
  const codigo = normalizarCodigo(codigoRaw);
  if (codigo === 'DEMO-01') return tareaDemo();
  const t = await leer('tarea:' + codigo);
  return t || null;
}

export async function obtenerTareaPublica(codigoRaw) {
  const t = await obtenerTareaInterna(codigoRaw);
  if (!t) return null;
  const { tokenProfesor, enunciadoArchivo, enunciadoArchivos, teoriaArchivos, ...publica } = t;
  return {
    ...publica,
    enunciadoDescargas: archivosDeInstrucciones(t).map((a) => a.nombre),
    teoriaDescargas: (teoriaArchivos || []).map((a) => a.nombre),
  };
}

export function verificarTokenProfesor(tarea, tokenRecibido) {
  if (!tarea || !tarea.tokenProfesor) return false;
  return igualSeguro(String(tarea.tokenProfesor), tokenRecibido);
}

// El profesor cierra o reabre su tarea. Cerrada, no admite entregas nuevas; ensayar sigue permitido.
export async function cambiarEstadoTarea(codigoRaw, token, { cerrada } = {}) {
  if (typeof cerrada !== 'boolean') throw errorHttp('Indica si la tarea queda cerrada (true o false)', 400);
  const tarea = await obtenerTareaInterna(codigoRaw);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);
  if (tarea.codigo === 'DEMO-01') throw errorHttp('La tarea de demostración no se puede cerrar', 400);
  if (!verificarTokenProfesor(tarea, token)) throw errorHttp('Token de profesor inválido o ausente', 401);
  tarea.cerrada = cerrada;
  tarea.cerradaEn = cerrada ? new Date().toISOString() : null;
  if (!(await reemplazar('tarea:' + tarea.codigo, tarea))) throw errorHttp('La tarea ya no existe', 404);
  return { codigo: tarea.codigo, cerrada: tarea.cerrada, cerradaEn: tarea.cerradaEn };
}
