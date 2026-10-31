// GET /api/casos       → lista de casos base que puede elegir el profesor
// GET /api/casos?id=X  → caso sin lo que el estudiante debe explicar
import { listarCasosBase, obtenerCasoPublico } from '../modulos/casos/casos.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });
  try {
    if (!req.query?.id) return res.status(200).json(await listarCasosBase());
    res.status(200).json(await obtenerCasoPublico(String(req.query.id).trim()));
  } catch (e) {
    if (!e.status) console.error('[api/casos]', e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo cargar el caso.' });
  }
}
