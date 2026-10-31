// GET /api/casos       → lista de casos base que puede elegir el profesor
// GET /api/casos?id=X  → caso sin lo que el estudiante debe explicar.
//   Un trabajo subido exige alguna de estas pruebas de acceso:
//   cabecera x-llave-caso (quien lo subió), ?codigo= de una tarea que lo usa como base,
//   o ?codigo= más cabecera x-token-profesor si la tarea recibió una entrega sobre él.
import { listarCasosBase } from '../modulos/casos/casos.js';
import { obtenerCasoPublico } from '../modulos/casos/acceso.js';
import { cabecera } from '../compartido/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });
  try {
    if (!req.query?.id) return res.status(200).json(await listarCasosBase());
    res.status(200).json(await obtenerCasoPublico(String(req.query.id).trim(), {
      llave: cabecera(req, 'x-llave-caso'),
      codigo: req.query.codigo,
      token: cabecera(req, 'x-token-profesor'),
    }));
  } catch (e) {
    if (!e.status) console.error('[api/casos]', e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo cargar el caso.' });
  }
}
