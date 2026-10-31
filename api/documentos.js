// POST /api/documentos → recibe el texto extraído de un trabajo (.pdf o .docx, extraído en el navegador),
// lo fragmenta, genera los 4 puntos tipados de la defensa y guarda el caso.
// GET  /api/documentos  → límites y si hay IA configurada.
import { randomBytes } from 'node:crypto';
import { guardar, persistente } from '../compartido/almacen.js';
import { generarCaso, MIN_PALABRAS, MAX_PALABRAS } from '../modulos/documentos/generador.js';
import { proveedorConfigurado } from '../compartido/llm.js';

const nuevoCasoId = () => 'doc-' + randomBytes(5).toString('hex');
const limpio = (v, max) => String(v || '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ia: proveedorConfigurado(), persistente: persistente(), minPalabras: MIN_PALABRAS, maxPalabras: MAX_PALABRAS });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const texto = typeof b.texto === 'string' ? b.texto : '';
    if (!texto.trim()) return res.status(400).json({ error: 'Falta el texto del trabajo' });

    const datos = {
      texto,
      titulo: limpio(b.titulo, 120),
      curso: limpio(b.curso, 80),
      tarea: limpio(b.tarea, 120),
      criterios: limpio(b.criterios, 600),
      estudiante: limpio(b.estudiante, 80),
      universidadId: 'demo',
    };

    const { caso } = await generarCaso({ ...datos, id: nuevoCasoId() });
    // `guardar` no sobrescribe: si el id ya estaba tomado, se reetiqueta el caso y se reintenta.
    for (let k = 0; k < 5; k++) {
      if (await guardar('caso:' + caso.id, caso)) {
        return res.status(201).json({
          casoId: caso.id,
          titulo: caso.documento.titulo,
          fragmentos: caso.documento.fragmentos.length,
          puntos: caso.puntos.length,
          modoGeneracion: caso.modoGeneracion,
          persistente: persistente(),
        });
      }
      caso.id = nuevoCasoId();
    }
    return res.status(500).json({ error: 'No se pudo guardar el caso, intenta de nuevo' });
  } catch (e) {
    if (!e.status) console.error('[api/documentos]', e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo procesar el trabajo. Intenta de nuevo.' });
  }
}
