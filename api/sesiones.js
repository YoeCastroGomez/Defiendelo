// POST /api/sesiones          → cierra una entrega { modo: 'evaluacion', intento, senales } y guarda el reporte
//                               armado con las evaluaciones que registró el servidor
// GET  /api/sesiones?codigo=X → devuelve las sesiones de la tarea validando cabecera x-token-profesor
import { guardarSesion, consultarSesiones } from '../modulos/reportes/sesiones.js';
import { cabecera, cuerpo } from '../compartido/http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') return res.status(201).json(await guardarSesion(cuerpo(req)));
    if (req.method === 'GET') return res.status(200).json(await consultarSesiones(req.query?.codigo, cabecera(req, 'x-token-profesor')));
    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[api/sesiones]', e);
    return res.status(500).json({ error: 'Error interno al procesar las sesiones' });
  }
}
