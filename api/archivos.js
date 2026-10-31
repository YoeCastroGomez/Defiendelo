// POST /api/archivos                     → enlace temporal para subir un .pdf o .docx directo al almacén
// GET  /api/archivos?codigo=X            → enlace temporal para bajar el documento de la tarea
// GET  /api/archivos?codigo=X&casoId=Y   → enlace temporal para bajar una entrega (con x-token-profesor)
import { prepararSubida, enlaceEnunciado, enlaceEntrega } from '../modulos/archivos/archivos.js';
import * as almacen from '../compartido/almacen.js';

const MAX_POR_MINUTO = 20;
const ERRORES_PROPIOS = [400, 401, 404, 503];

// Si el contador falla, se deja pasar: la subida es opcional y no debe cortar una entrega.
async function superaLimite(req) {
  const ip = (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'local';
  try {
    return await almacen.incrementar('limite:archivos:' + ip, 60) > MAX_POR_MINUTO;
  } catch (e) {
    console.error('[api/archivos]', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      if (await superaLimite(req)) return res.status(429).json({ error: 'Demasiadas subidas seguidas. Espera un minuto.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      return res.status(201).json(await prepararSubida(body));
    }
    if (req.method === 'GET') {
      const { codigo, casoId } = req.query || {};
      if (!casoId) return res.status(200).json(await enlaceEnunciado(codigo));
      const h = req.headers?.['x-token-profesor'];
      return res.status(200).json(await enlaceEntrega(codigo, String(casoId), Array.isArray(h) ? h[0] : String(h || '')));
    }
    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    if (ERRORES_PROPIOS.includes(e.status)) return res.status(e.status).json({ error: e.message });
    console.error('[api/archivos]', e.message);
    return res.status(500).json({ error: 'No se pudo acceder al archivo. Intenta de nuevo.' });
  }
}
