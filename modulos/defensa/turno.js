// Lógica de un turno con Carlos: evalúa la respuesta del estudiante sobre un punto
// del trabajo y decide qué dice Carlos a continuación. Independiente del proveedor de IA.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { llamarLLM, proveedorConfigurado } from '../../compartido/llm.js';
import { leer } from '../../compartido/almacen.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function cargarCaso(id) {
  if (!/^[a-z0-9-]{1,64}$/.test(id || '')) throw new Error('caso inválido');
  const guardado = await leer('caso:' + id);
  if (guardado) return guardado;
  const txt = await readFile(path.join(RAIZ, 'public', 'casos', `${id}.json`), 'utf8');
  return JSON.parse(txt);
}

function promptSistema(caso, punto) {
  const frag = caso.documento.fragmentos.find((f) => f.id === punto.fragmento);
  const doc = caso.documento.fragmentos.map((f) => `[${f.id}] (${f.seccion}) ${f.texto}`).join('\n');
  return `Eres ${caso.carlos.nombre}, un compañero de universidad. ${caso.carlos.perfil}
Un estudiante te está explicando su trabajo del curso "${caso.curso}": "${caso.tarea}".
Tú NO eres profesor ni examinador: eres un compañero que quiere entender. Hablas en español peruano informal, frases cortas (máximo 2 oraciones), sin tecnicismos que no sepas.

Trabajo del estudiante, dividido en fragmentos:
${doc}

Punto que estás explorando ahora: "${punto.tema}" (fragmento ${punto.fragmento}: "${frag ? frag.texto : ''}").
${punto.error_de_carlos ? `Tu confusión a propósito en este punto: ${punto.error_de_carlos}. Sostenla hasta que el estudiante la corrija con una razón.` : ''}
Lo que una buena explicación debería cubrir (NO lo reveles): ${punto.que_debe_explicar}

Evalúa la última respuesta del estudiante para este punto:
- "verde": lo explicó con sus palabras y, si había un error tuyo, lo corrigió dando la razón.
- "amarillo": idea parcial, vaga, o leyó su trabajo sin explicarlo.
- "rojo": no lo explicó, dijo algo incorrecto o aceptó tu error.
Puedes repreguntar UNA vez si la respuesta fue amarilla y aún no repreguntaste. Si no repreguntas, "carlos_dice" es una reacción breve de cierre de este punto (sin adelantar el siguiente tema).

Responde SOLO con JSON válido, sin texto adicional:
{"nivel":"verde|amarillo|rojo","motivo":"una oración, en tercera persona, para el reporte","evidencia":"frase breve tomada de lo que dijo el estudiante","repreguntar":true|false,"carlos_dice":"lo que dices ahora"}`;
}

function extraerJSON(texto) {
  const ini = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (ini < 0 || fin < ini) throw new Error('la IA no devolvió JSON');
  const o = JSON.parse(texto.slice(ini, fin + 1));
  if (!['verde', 'amarillo', 'rojo'].includes(o.nivel)) o.nivel = 'amarillo';
  o.repreguntar = !!o.repreguntar;
  o.carlos_dice = String(o.carlos_dice || '').slice(0, 400);
  o.motivo = String(o.motivo || '').slice(0, 300);
  o.evidencia = String(o.evidencia || '').slice(0, 200);
  return o;
}

// historial: [{rol:'carlos'|'estudiante', texto}] solo del punto actual
export async function evaluarTurno({ casoId, puntoId, historial, yaRepregunto, leyo }) {
  if (!proveedorConfigurado()) {
    const e = new Error('No hay proveedor de IA configurado');
    e.status = 503;
    throw e;
  }
  const caso = await cargarCaso(casoId);
  const punto = caso.puntos.find((p) => p.id === puntoId);
  if (!punto) throw new Error('punto inválido');
  const hist = (Array.isArray(historial) ? historial : []).slice(-8).map((m) => ({
    role: m.rol === 'carlos' ? 'assistant' : 'user',
    content: String(m.texto || '').slice(0, 2000) || '(silencio)',
  }));
  if (!hist.length || hist[hist.length - 1].role !== 'user') throw new Error('falta la respuesta del estudiante');
  let sistema = promptSistema(caso, punto);
  if (yaRepregunto) sistema += '\nYa repreguntaste en este punto: ahora "repreguntar" debe ser false.';
  if (leyo) sistema += '\nAviso del sistema: la última respuesta es casi idéntica al texto del trabajo (lo leyó). Tenlo en cuenta.';
  const salida = await llamarLLM(sistema, hist);
  const r = extraerJSON(salida);
  if (yaRepregunto) r.repreguntar = false;
  return r;
}
