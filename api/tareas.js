// POST /api/tareas          → el profesor crea una tarea y recibe un código
// GET  /api/tareas?codigo=X → el estudiante carga la tarea con ese código
import { randomInt } from 'node:crypto';
import { guardar, leer, persistente } from '../lib/almacen.js';
import { cargarCaso } from '../lib/turno.js';

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L para dictarlo sin confusiones
const DEMO = { codigo: 'DEMO-01', titulo: 'Informe de diseño: módulo de notificaciones', curso: 'Diseño de Software', profesor: 'Prof. de demostración', criterios: 'Por qué se eligió Observer, cómo reduce el acoplamiento, en qué se diferencia de Strategy y cómo se extiende el diseño.', cierre: '', casoId: 'demo' };

const nuevoCodigo = () => {
  const c = Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return c.slice(0, 3) + '-' + c.slice(3);
};
const limpio = (v, max) => String(v || '').trim().slice(0, max);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let codigo = limpio(req.query?.codigo, 12).toUpperCase().replace(/[\s_]/g, '');
      if (/^[A-Z0-9]{6}$/.test(codigo)) codigo = codigo.slice(0, 3) + '-' + codigo.slice(3);
      if (!/^[A-Z0-9]{3,4}-[A-Z0-9]{2,3}$/.test(codigo)) return res.status(400).json({ error: 'Código con formato inválido' });
      const t = codigo === DEMO.codigo ? DEMO : await leer('tarea:' + codigo);
      if (!t) return res.status(404).json({ error: 'No existe una tarea con ese código' });
      return res.status(200).json(t);
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const tarea = {
        titulo: limpio(b.titulo, 120), curso: limpio(b.curso, 80), profesor: limpio(b.profesor, 80),
        criterios: limpio(b.criterios, 600), cierre: limpio(b.cierre, 40), casoId: limpio(b.casoId, 64) || 'demo',
        creada: new Date().toISOString(),
      };
      if (!tarea.titulo || !tarea.curso) return res.status(400).json({ error: 'Faltan el título o el curso' });
      await cargarCaso(tarea.casoId); // valida que el caso exista
      for (let k = 0; k < 5; k++) {
        tarea.codigo = nuevoCodigo();
        if (await guardar('tarea:' + tarea.codigo, tarea)) {
          return res.status(201).json({ codigo: tarea.codigo, persistente: persistente() });
        }
      }
      return res.status(500).json({ error: 'No se pudo generar un código, intenta de nuevo' });
    }
    res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}
