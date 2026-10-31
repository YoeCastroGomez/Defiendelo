// Reglas de acceso a los archivos originales: quién puede subir y quién puede descargar cada uno.
import { randomBytes } from 'node:crypto';
import { archivosConfigurado, crearEnlaceSubida, crearEnlaceDescarga } from '../../compartido/archivos.js';
import { listar } from '../../compartido/almacen.js';
import { cargarCaso } from '../casos/casos.js';
import { archivosDeInstrucciones, obtenerTareaInterna, verificarTokenProfesor } from '../tareas/tareas.js';

const MAX_BYTES = 10 * 1024 * 1024;
const CARPETAS = { enunciado: 'enunciados', resolucion: 'resoluciones' };

function errorHttp(mensaje, status) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

function exigirConfiguracion() {
  if (!archivosConfigurado()) throw errorHttp('El guardado de archivos no está disponible', 503);
}

export async function prepararSubida({ tipo, nombre, tamano } = {}) {
  exigirConfiguracion();
  if (!CARPETAS[tipo]) throw errorHttp('Tipo de archivo inválido', 400);
  const extension = /\.(pdf|docx)$/i.exec(String(nombre || ''))?.[1]?.toLowerCase();
  if (!extension) throw errorHttp('Formato no compatible. Sube un archivo .pdf o .docx', 400);
  if (!(Number(tamano) > 0) || Number(tamano) > MAX_BYTES) throw errorHttp('El archivo supera el límite de 10 MB', 400);
  const ruta = `${CARPETAS[tipo]}/${randomBytes(16).toString('hex')}.${extension}`;
  return { ruta, subirUrl: await crearEnlaceSubida(ruta) };
}

// Las instrucciones y la teoría las puede bajar cualquiera que tenga el código de la tarea.
export async function enlaceMaterial(codigo, indice, tipo) {
  exigirConfiguracion();
  const tarea = await obtenerTareaInterna(codigo);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);
  const lista = tipo === 'teoria' ? tarea.teoriaArchivos || [] : archivosDeInstrucciones(tarea);
  const archivo = lista[Number(indice) || 0];
  if (!archivo) throw errorHttp('Esta tarea no tiene ese archivo para descargar', 404);
  return { url: await crearEnlaceDescarga(archivo.ruta, archivo.nombre) };
}

// La tarea de un estudiante solo la baja el profesor de esa tarea, y solo si esa entrega le pertenece.
export async function enlaceEntrega(codigo, casoId, token) {
  exigirConfiguracion();
  const tarea = await obtenerTareaInterna(codigo);
  if (!tarea) throw errorHttp('No existe una tarea con ese código', 404);
  if (!verificarTokenProfesor(tarea, token)) throw errorHttp('Token de profesor inválido o ausente', 401);
  const sesiones = await listar('sesiones:' + tarea.codigo);
  if (!sesiones.some((s) => s.casoId === casoId)) throw errorHttp('Esa entrega no pertenece a esta tarea', 404);
  const { archivo } = await cargarCaso(casoId);
  if (!archivo) throw errorHttp('Esta entrega no tiene archivo original', 404);
  return { url: await crearEnlaceDescarga(archivo.ruta, archivo.nombre) };
}
