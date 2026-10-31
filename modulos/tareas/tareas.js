// Lógica de negocio de tareas: generación de códigos sin caracteres ambiguos,
// emisión y verificación de tokenProfesor, y soporte dual (entrega del estudiante o caso base).
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { guardar, leer, persistente } from '../../compartido/almacen.js';
import { cargarCaso } from '../defensa/turno.js';

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L

function errorHttp(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const limpio = (v, max) => String(v || '').trim().slice(0, max);

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
    casoId: 'demo',
    tokenProfesor: process.env.DEMO_TOKEN_PROFESOR || 'demo-profe-2026',
    creada: '2026-10-30T00:00:00.000Z',
  };
}

export function normalizarCodigo(raw) {
  let codigo = limpio(raw, 12).toUpperCase().replace(/[\s_]/g, '');
  if (codigo === 'DEMO01') codigo = 'DEMO-01';
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

  const casoId = limpio(datos.casoId, 64) || 'demo';
  if (casoId !== 'estudiante') {
    if (!/^[a-z0-9-]{1,64}$/.test(casoId)) throw errorHttp('Identificador de caso inválido', 400);
    try {
      await cargarCaso(casoId);
    } catch {
      throw errorHttp('El caso base seleccionado no existe', 404);
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
    cierre: limpio(datos.cierre, 40),
    casoId,
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
  const { tokenProfesor, ...publica } = t;
  return publica;
}

export function verificarTokenProfesor(tarea, tokenRecibido) {
  if (!tarea || !tarea.tokenProfesor || typeof tokenRecibido !== 'string') return false;
  const esperado = Buffer.from(String(tarea.tokenProfesor), 'utf8');
  const recibido = Buffer.from(tokenRecibido.trim(), 'utf8');
  if (!esperado.length || esperado.length !== recibido.length) return false;
  return timingSafeEqual(esperado, recibido);
}
