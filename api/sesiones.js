// POST /api/sesiones          → guarda el reporte en modo evaluación y recalcula nivelGeneral
// GET  /api/sesiones?codigo=X → devuelve las sesiones de la tarea validando cabecera x-token-profesor
// GET  /api/sesiones?codigo=X&nombre=Y → indica si ese estudiante ya entregó
import { guardarSesion, consultarSesiones, yaEntrego } from '../modulos/reportes/sesiones.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const guardada = await guardarSesion(body);
      return res.status(201).json(guardada);
    }
    if (req.method === 'GET') {
      if (req.query?.nombre) return res.status(200).json({ entregada: await yaEntrego(req.query.codigo, req.query.nombre) });
      const h = req.headers?.['x-token-profesor'];
      const token = Array.isArray(h) ? h[0] : String(h || '');
      const datos = await consultarSesiones(req.query?.codigo, token);
      return res.status(200).json(datos);
    }
    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[api/sesiones]', e);
    return res.status(500).json({ error: 'Error interno al procesar las sesiones' });
  }
}
