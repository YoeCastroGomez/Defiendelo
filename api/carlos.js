// Función serverless (Vercel): POST /api/carlos
// GET informa si hay IA. Sin IA, o si la IA falla, el servidor evalúa en modo simulado.
import { evaluarTurno } from '../modulos/defensa/turno.js';
import { proveedorConfigurado } from '../compartido/llm.js';
import { superaLimite, cuerpo } from '../compartido/http.js';

const MAX_POR_MINUTO = 30;
const ERRORES_PROPIOS = [400, 403, 404, 409, 429]; // sus mensajes los escribimos nosotros

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ia: proveedorConfigurado() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    if (await superaLimite(req, 'carlos', MAX_POR_MINUTO)) return res.status(429).json({ error: 'Demasiadas respuestas seguidas. Espera un minuto antes de continuar.' });
    res.status(200).json(await evaluarTurno(cuerpo(req)));
  } catch (e) {
    if (ERRORES_PROPIOS.includes(e.status)) return res.status(e.status).json({ error: e.message });
    console.error('[api/carlos]', e.message);
    res.status(500).json({ error: 'Carlos tuvo un problema al procesar la respuesta. Intenta de nuevo.' });
  }
}
