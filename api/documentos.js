// POST /api/documentos → recibe el texto extraído de un trabajo (.pdf o .docx, extraído en el navegador),
// lo fragmenta, genera los 4 puntos tipados de la defensa y guarda el caso. Devuelve una `llave`:
// el trabajo subido solo se vuelve a abrir con ella (cabecera x-llave-caso), porque es privado.
// GET  /api/documentos  → límites y si hay IA configurada.
import { randomBytes } from 'node:crypto';
import { guardar, persistente } from '../compartido/almacen.js';
import { generarCaso, MIN_PALABRAS, MAX_PALABRAS } from '../modulos/documentos/generador.js';
import { proveedorConfigurado } from '../compartido/llm.js';
import { obtenerTareaInterna } from '../modulos/tareas/tareas.js';
import { limpiarArchivo } from '../compartido/archivos.js';
import { limpio, superaLimite, cuerpo } from '../compartido/http.js';
import { exigirAccesoCaso } from '../modulos/casos/acceso.js';

// Cada trabajo cuesta hasta 2 llamadas largas a la IA: los límites (por IP y global) protegen el presupuesto.
const nuevoCasoId = () => 'doc-' + randomBytes(8).toString('hex');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ia: proveedorConfigurado(), persistente: persistente(), minPalabras: MIN_PALABRAS, maxPalabras: MAX_PALABRAS });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    if (await superaLimite(req, 'documentos')) return res.status(429).json({ error: 'Demasiados trabajos procesados seguidos. Espera un minuto e intenta de nuevo.' });
    const b = cuerpo(req);
    const texto = typeof b.texto === 'string' ? b.texto : '';
    if (!texto.trim()) return res.status(400).json({ error: 'Falta el texto del trabajo' });

    const datos = {
      texto,
      titulo: limpio(b.titulo, 120),
      curso: limpio(b.curso, 80),
      tarea: limpio(b.tarea, 120),
      criterios: limpio(b.criterios, 600),
      estudiante: limpio(b.estudiante, 80),
      // Documento que el profesor deja a toda la clase (no la resolución de un estudiante).
      comun: b.comun === true && !b.codigo,
      evitar: [],
      universidadId: 'demo',
    };

    // Con código, los datos del profesor salen de la tarea guardada: el cliente no puede cambiarlos.
    if (b.codigo) {
      const t = await obtenerTareaInterna(b.codigo);
      if (!t) return res.status(404).json({ error: 'No existe una tarea con ese código' });
      Object.assign(datos, { curso: t.curso, tarea: t.titulo, criterios: t.criterios, enunciado: t.enunciado, teoria: t.teoria, codigo: t.codigo });
    }

    // Dudas nuevas para la entrega: las del ensayo se leen del caso anterior en el servidor, con su llave.
    // Así el navegador no puede meter texto propio en el prompt.
    if (b.casoAnterior) {
      const anterior = await exigirAccesoCaso(limpio(b.casoAnterior, 64), { llave: limpio(b.llaveAnterior, 64) });
      datos.evitar = anterior.puntos.map((p) => limpio(p.apertura, 300));
    }

    const { caso } = await generarCaso({ ...datos, id: nuevoCasoId() });
    caso.archivo = limpiarArchivo(b.archivo, 'resolucion');
    caso.llave = randomBytes(16).toString('hex');
    if (datos.codigo) caso.codigo = datos.codigo; // la tarea para la que se subió
    // `guardar` no sobrescribe: si el id ya estaba tomado, se reetiqueta el caso y se reintenta.
    for (let k = 0; k < 5; k++) {
      if (await guardar('caso:' + caso.id, caso)) {
        return res.status(201).json({
          casoId: caso.id,
          llave: caso.llave,
          titulo: caso.documento.titulo,
          fragmentos: caso.documento.fragmentos.length,
          puntos: caso.puntos.length,
          modoGeneracion: caso.modoGeneracion,
          // Si la IA no logró preparar las dudas, se usaron las de respaldo: se avisa para poder reintentar.
          ...(caso.modoGeneracion === 'respaldo' ? { aviso: 'La IA no respondió bien esta vez, así que Carlos preparó dudas básicas a partir del texto. Puedes volver a subir el documento para intentarlo de nuevo.' } : {}),
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
