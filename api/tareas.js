// POST /api/tareas          → el profesor crea una tarea y recibe { codigo, persistente, tokenProfesor }
// GET  /api/tareas?codigo=X → el estudiante carga la tarea pública (sin tokenProfesor)
import { crearTarea, obtenerTareaPublica } from '../modulos/tareas/tareas.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const t = await obtenerTareaPublica(req.query?.codigo);
      if (!t) return res.status(404).json({ error: 'No existe una tarea con ese código' });
      return res.status(200).json(t);
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const creada = await crearTarea(body);
      return res.status(201).json(creada);
    }
    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[api/tareas]', e);
    return res.status(500).json({ error: 'Error interno al procesar la tarea' });
  }
}
