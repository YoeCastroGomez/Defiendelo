// Casos: el trabajo en fragmentos y los puntos que explora Carlos.
// Los casos completos incluyen lo que el estudiante debe explicar, así que no se sirven desde public/.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leer } from '../../compartido/almacen.js';

const DATOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'datos');

function error(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

export async function cargarCaso(id) {
  if (!/^[a-z0-9-]{1,64}$/.test(id || '') || id === 'estudiante') throw error(400, 'Caso con formato inválido');
  // Si Redis falla, los casos base deben seguir funcionando desde disco.
  const guardado = await leer('caso:' + id).catch((e) => { console.error('[casos]', e.message); return null; });
  if (guardado) return guardado;
  try {
    return JSON.parse(await readFile(path.join(DATOS, `${id}.json`), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') throw error(404, 'Caso no encontrado');
    throw e;
  }
}

export async function listarCasosBase() {
  return JSON.parse(await readFile(path.join(DATOS, 'index.json'), 'utf8'));
}

// Copia para el navegador: nunca incluye que_debe_explicar ni error_de_carlos.
export async function obtenerCasoPublico(id) {
  const { carlos, archivo, ...caso } = await cargarCaso(id);
  return {
    ...caso,
    puntos: caso.puntos.map((p) => ({
      id: p.id, tipo: p.tipo, tema: p.tema, fragmento: p.fragmento, apertura: p.apertura,
      ...(caso.id === 'demo' && p.simulado ? { simulado: p.simulado } : {}),
    })),
  };
}
