// Función serverless (Vercel): POST /api/carlos
import { evaluarTurno } from '../modulos/defensa/turno.js';
import { proveedorConfigurado } from '../compartido/llm.js';
import * as almacen from '../compartido/almacen.js';

const MAX_POR_MINUTO = 30;
const ERRORES_PROPIOS = [400, 404, 429, 503]; // sus mensajes los escribimos nosotros

// Si el contador falla, se deja pasar: es mejor no limitar que cortar una defensa en curso.
async function superaLimite(req) {
  if (typeof almacen.incrementar !== 'function') return false;
  const ip = (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'local';
  try {
    return await almacen.incrementar('limite:carlos:' + ip, 60) > MAX_POR_MINUTO;
  } catch (e) {
    console.error('[api/carlos]', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ia: proveedorConfigurado() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    if (await superaLimite(req)) return res.status(429).json({ error: 'Demasiadas respuestas seguidas. Espera un minuto antes de continuar.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const r = await evaluarTurno(body);
    res.status(200).json(r);
  } catch (e) {
    console.error('[api/carlos]', e.message);
    if (ERRORES_PROPIOS.includes(e.status)) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Carlos tuvo un problema al procesar la respuesta. Intenta de nuevo.' });
  }
}
