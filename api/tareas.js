// POST  /api/tareas          → el profesor crea una tarea y recibe { codigo, persistente, tokenProfesor }
// GET   /api/tareas?codigo=X → el estudiante carga la tarea pública (sin tokenProfesor)
// PATCH /api/tareas?codigo=X → el profesor cierra o reabre la tarea: { cerrada: true|false } con x-token-profesor
import { crearTarea, obtenerTareaPublica, cambiarEstadoTarea } from '../modulos/tareas/tareas.js';
import { cabecera, cuerpo } from '../compartido/http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const t = await obtenerTareaPublica(req.query?.codigo);
      if (!t) return res.status(404).json({ error: 'No existe una tarea con ese código' });
      return res.status(200).json(t);
    }
    if (req.method === 'POST') return res.status(201).json(await crearTarea(cuerpo(req)));
    if (req.method === 'PATCH') return res.status(200).json(await cambiarEstadoTarea(req.query?.codigo, cabecera(req, 'x-token-profesor'), cuerpo(req)));
    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[api/tareas]', e);
    return res.status(500).json({ error: 'Error interno al procesar la tarea' });
  }
}
