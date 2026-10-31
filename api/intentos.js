// POST /api/intentos → abre una entrega: { codigo, nombre, casoId?, llave? } → { intento, casoId }.
// El servidor guarda bajo ese intento cada evaluación de Carlos, y el reporte se arma con ellas.
// Responde 409 si ese nombre ya entregó (o ya había empezado y salió a mitad) y 403 si la tarea está cerrada.
import { iniciarIntento } from '../modulos/reportes/sesiones.js';
import { superaLimite, cuerpo } from '../compartido/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    if (await superaLimite(req, 'intentos')) return res.status(429).json({ error: 'Demasiados intentos seguidos. Espera un minuto.' });
    return res.status(201).json(await iniciarIntento(cuerpo(req)));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[api/intentos]', e);
    return res.status(500).json({ error: 'No se pudo empezar la entrega. Intenta de nuevo.' });
  }
}
