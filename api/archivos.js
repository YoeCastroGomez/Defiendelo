// POST /api/archivos                     → enlace temporal para subir un .pdf o .docx directo al almacén
// GET  /api/archivos?codigo=X&indice=N&tipo=teoria → enlace temporal para bajar instrucciones o teoría
// GET  /api/archivos?codigo=X&casoId=Y   → enlace temporal para bajar una entrega (con x-token-profesor)
import { prepararSubida, enlaceMaterial, enlaceEntrega } from '../modulos/archivos/archivos.js';
import { superaLimite, cabecera, cuerpo } from '../compartido/http.js';

const ERRORES_PROPIOS = [400, 401, 403, 404, 503];

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      if (await superaLimite(req, 'archivos')) return res.status(429).json({ error: 'Demasiadas subidas seguidas. Espera un minuto.' });
      return res.status(201).json(await prepararSubida(cuerpo(req)));
    }
    if (req.method === 'GET') {
      const { codigo, casoId, indice, tipo } = req.query || {};
      if (!casoId) return res.status(200).json(await enlaceMaterial(codigo, indice, tipo));
      return res.status(200).json(await enlaceEntrega(codigo, String(casoId), cabecera(req, 'x-token-profesor')));
    }
    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    if (ERRORES_PROPIOS.includes(e.status)) return res.status(e.status).json({ error: e.message });
    console.error('[api/archivos]', e.message);
    return res.status(500).json({ error: 'No se pudo acceder al archivo. Intenta de nuevo.' });
  }
}
