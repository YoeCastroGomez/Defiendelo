// Función serverless (Vercel): POST /api/carlos
import { evaluarTurno } from '../modulos/defensa/turno.js';
import { proveedorConfigurado } from '../compartido/llm.js';

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ia: proveedorConfigurado() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const r = await evaluarTurno(body);
    res.status(200).json(r);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}
