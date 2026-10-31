// Quién puede abrir un caso. Los casos base (en disco) son públicos; un trabajo subido solo lo abre:
// - quien lo subió, con la llave que recibió al subirlo;
// - quien tenga el código de una tarea que usa ese trabajo como base común;
// - el profesor de una tarea (con su token) que recibió una entrega sobre ese trabajo.
import { listar } from '../../compartido/almacen.js';
import { errorHttp, igualSeguro } from '../../compartido/http.js';
import { cargarCaso, esCasoPrivado, versionPublica } from './casos.js';
import { obtenerTareaInterna, verificarTokenProfesor } from '../tareas/tareas.js';

export async function exigirAccesoCaso(id, { llave, codigo, token } = {}) {
  const caso = await cargarCaso(id);
  if (!esCasoPrivado(caso)) return caso;
  if (llave && igualSeguro(caso.llave, String(llave))) return caso;
  if (codigo) {
    const tarea = await obtenerTareaInterna(codigo).catch(() => null);
    if (tarea?.casoId === caso.id) return caso;
    if (tarea && token && verificarTokenProfesor(tarea, token)
      && (await listar('sesiones:' + tarea.codigo)).some((s) => s.casoId === caso.id)) return caso;
  }
  throw errorHttp('No tienes acceso a este trabajo', 403);
}

export async function obtenerCasoPublico(id, acceso) {
  return versionPublica(await exigirAccesoCaso(id, acceso));
}
