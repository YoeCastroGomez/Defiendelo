// Casos: el trabajo en fragmentos y los puntos que explora Carlos.
// Los casos completos incluyen lo que el estudiante debe explicar, así que no se sirven desde public/.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leer } from '../../compartido/almacen.js';
import { errorHttp } from '../../compartido/http.js';

const DATOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'datos');

export const formatoCasoValido = (id) => /^[a-z0-9-]{1,64}$/.test(id || '') && id !== 'estudiante';

// Un caso subido como documento es el trabajo de alguien: no se entrega a quien solo conoce su id.
export const esCasoPrivado = (caso) => caso?.origen === 'documento';

export async function cargarCaso(id) {
  if (!formatoCasoValido(id)) throw errorHttp('Caso con formato inválido', 400);
  // Si Redis falla, los casos base deben seguir funcionando desde disco.
  const guardado = await leer('caso:' + id).catch((e) => { console.error('[casos]', e.message); return null; });
  if (guardado) return guardado;
  try {
    return JSON.parse(await readFile(path.join(DATOS, `${id}.json`), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') throw errorHttp('Caso no encontrado', 404);
    throw e;
  }
}

export async function listarCasosBase() {
  return JSON.parse(await readFile(path.join(DATOS, 'index.json'), 'utf8'));
}

// Copia para el navegador. Lista blanca: nunca incluye que_debe_explicar, error_de_carlos,
// la llave del caso, la tarea a la que pertenece ni la ruta del archivo original.
export function versionPublica(caso) {
  return {
    id: caso.id,
    curso: caso.curso,
    tarea: caso.tarea,
    estudiante: caso.estudiante,
    origen: caso.origen,
    modoGeneracion: caso.modoGeneracion,
    provisional: caso.provisional,
    documento: caso.documento,
    puntos: caso.puntos.map((p) => ({
      id: p.id, tipo: p.tipo, tema: p.tema, fragmento: p.fragmento, apertura: p.apertura,
      ...(caso.id === 'demo' && p.simulado ? { simulado: p.simulado } : {}),
    })),
  };
}
