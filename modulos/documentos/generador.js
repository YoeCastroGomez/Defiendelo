// Convierte el texto extraído de un trabajo (PDF/DOCX) en un caso jugable:
// fragmentos con sección y los 4 puntos tipados con los que Carlos conduce la defensa.
// Independiente del proveedor de IA: sin proveedor configurado genera puntos deterministas.
import { llamarLLM, proveedorConfigurado } from '../../compartido/llm.js';

export const MIN_PALABRAS = 50;
export const MAX_PALABRAS = 15000;
export const MIN_FRAGMENTOS = 4;
export const MAX_FRAGMENTOS = 60;

// Orden pedagógico fijo: una decisión, dos trampas y un cambio de condición.
const TIPOS = ['decision', 'trampa', 'trampa', 'condicion'];

const CARLOS = {
  nombre: 'Carlos',
  perfil: 'Compañero de los primeros ciclos. Es curioso y pregunta como quien quiere entender de verdad, pero a veces se equivoca con mucha seguridad.',
};

export const contarPalabras = (t) => (String(t || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

const recortar = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/* ---------- fragmentación ---------- */

// Encabezados típicos de un trabajo universitario.
const RE_NUMERADO = /^(?:\d+(?:\.\d+)*[.)\-–]|\d+(?:\.\d+)+|[IVXLC]{1,5}[.)\-–])\s+\S/;
const RE_CLAVE = /^(?:resumen|abstract|introducci[oó]n|antecedentes|planteamiento|marco\s+(?:te[oó]rico|conceptual)|metodolog[ií]a|m[eé]todo|desarrollo|an[aá]lisis|dise[nñ]o|arquitectura|implementaci[oó]n|resultados|discusi[oó]n|conclusiones?|recomendaciones?|referencias|bibliograf[ií]a|anexos?|ap[eé]ndice|objetivos?|justificaci[oó]n|alcance|limitaciones|cap[ií]tulo\b|contexto|problema)\b/i;

function normalizar(texto) {
  return String(texto || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, '') // invisibles que dejan los extractores de PDF
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function esEncabezado(linea) {
  const n = contarPalabras(linea);
  if (!n || n > 12 || linea.length > 110) return false;
  const numerado = RE_NUMERADO.test(linea);
  if (/[.;,]$/.test(linea) && !numerado) return false;
  const mayusculas = linea === linea.toLocaleUpperCase('es') && /\p{Lu}/u.test(linea);
  return numerado || RE_CLAVE.test(linea) || mayusculas || /:$/.test(linea);
}

function porPalabras(texto, max) {
  const paso = Math.max(1, max);
  const p = texto.split(' ');
  const out = [];
  for (let i = 0; i < p.length; i += paso) out.push(p.slice(i, i + paso).join(' '));
  return out;
}

// Parte un texto largo en trozos de como máximo `max` palabras, cortando entre oraciones.
function porOraciones(texto, max) {
  const oraciones = texto.split(/(?<=[.!?…”"»])\s+/).filter(Boolean);
  const out = [];
  let buf = [];
  let n = 0;
  const cerrar = () => { if (buf.length) out.push(buf.join(' ')); buf = []; n = 0; };
  for (const o of oraciones) {
    const c = contarPalabras(o);
    if (c > max) { cerrar(); out.push(...porPalabras(o, max)); continue; }
    if (n && n + c > max) cerrar();
    buf.push(o);
    n += c;
  }
  cerrar();
  return out.length ? out : [texto];
}

function dividirMayor(frags) {
  if (!frags.length) return null;
  let i = 0;
  for (let k = 1; k < frags.length; k++) {
    if (contarPalabras(frags[k].texto) > contarPalabras(frags[i].texto)) i = k;
  }
  const f = frags[i];
  const mitad = Math.ceil(contarPalabras(f.texto) / 2);
  const partes = mitad > 1 ? porOraciones(f.texto, mitad) : porPalabras(f.texto, 1);
  if (partes.length < 2) return null;
  return [...frags.slice(0, i), ...partes.map((t) => ({ seccion: f.seccion, texto: t })), ...frags.slice(i + 1)];
}

// Pega un fragmento demasiado corto (un título suelto, un pie de página) a su mejor vecino.
function fusionarEn(frags, i) {
  const vecinos = [i - 1, i + 1].filter((k) => k >= 0 && k < frags.length);
  const j = vecinos.sort((a, b) => {
    const misma = (k) => (frags[k].seccion === frags[i].seccion ? 0 : 1);
    return misma(a) - misma(b) || contarPalabras(frags[a].texto) - contarPalabras(frags[b].texto);
  })[0];
  const [a, b] = i < j ? [frags[i], frags[j]] : [frags[j], frags[i]];
  const largo = contarPalabras(a.texto) >= contarPalabras(b.texto) ? a : b;
  const ini = Math.min(i, j);
  return [...frags.slice(0, ini), { seccion: largo.seccion, texto: `${a.texto} ${b.texto}` }, ...frags.slice(ini + 2)];
}

function fusionarMenor(frags) {
  let i = 0;
  let mejor = Infinity;
  for (let k = 0; k < frags.length - 1; k++) {
    const mismaSeccion = frags[k].seccion === frags[k + 1].seccion;
    const costo = contarPalabras(frags[k].texto) + contarPalabras(frags[k + 1].texto) + (mismaSeccion ? 0 : 10000);
    if (costo < mejor) { mejor = costo; i = k; }
  }
  const a = frags[i];
  const b = frags[i + 1];
  return [...frags.slice(0, i), { seccion: a.seccion, texto: `${a.texto} ${b.texto}` }, ...frags.slice(i + 2)];
}

// Devuelve 4..60 fragmentos { id, seccion, texto } de ~45–180 palabras
// (en trabajos muy cortos o muy largos manda la cantidad, no el tamaño).
export function fragmentarTexto(texto) {
  const limpio = normalizar(texto);
  const total = contarPalabras(limpio);
  const techo = Math.max(180, Math.ceil(total / MAX_FRAGMENTOS));
  const piso = Math.min(45, Math.max(5, Math.floor(total / MIN_FRAGMENTOS)));

  const unidades = limpio.split('\n').flatMap((l) => {
    const linea = l.trim();
    if (!linea || esEncabezado(linea) || contarPalabras(linea) <= techo) return [linea];
    return porOraciones(linea, techo);
  });

  const frags = [];
  let seccion = '';
  let buffer = [];
  let palabras = 0;
  let nuevoParrafo = true;
  const cerrar = () => {
    if (!buffer.length) return;
    frags.push({ seccion: seccion || 'Introducción', texto: buffer.join(' ') });
    buffer = [];
    palabras = 0;
  };

  for (const linea of unidades) {
    if (!linea) { nuevoParrafo = true; continue; }
    if (esEncabezado(linea)) {
      cerrar();
      seccion = recortar(linea.replace(/[:\s]+$/, ''), 80);
      nuevoParrafo = true;
      continue;
    }
    const n = contarPalabras(linea);
    if (palabras >= piso && (nuevoParrafo || palabras + n > techo)) cerrar();
    buffer.push(linea);
    palabras += n;
    if (palabras >= techo) cerrar();
    nuevoParrafo = false;
  }
  cerrar();

  if (!frags.length) {
    // Todo parecía encabezado (un índice, una portada, un documento de puros títulos):
    // se reparte el texto tal cual, sin detectar secciones.
    const corte = Math.min(techo, Math.max(1, Math.ceil(contarPalabras(limpio) / MIN_FRAGMENTOS)));
    for (const t of porOraciones(limpio.replace(/\n+/g, ' '), corte)) frags.push({ seccion: 'Introducción', texto: t });
  }

  let salida = frags;
  const minimo = Math.max(8, Math.min(piso, 20));
  while (salida.length > MIN_FRAGMENTOS) {
    const i = salida.findIndex((f) => contarPalabras(f.texto) < minimo);
    if (i < 0) break;
    salida = fusionarEn(salida, i);
  }
  while (salida.length < MIN_FRAGMENTOS) {
    const partido = dividirMayor(salida);
    if (!partido || partido.length === salida.length) break;
    salida = partido;
  }
  while (salida.length > MAX_FRAGMENTOS) salida = fusionarMenor(salida);

  return salida.map((f, i) => ({ id: `f${i + 1}`, seccion: f.seccion, texto: f.texto }));
}

export function tituloDesdeTexto(texto, respaldo = 'Trabajo del estudiante') {
  const primera = normalizar(texto).split('\n').map((l) => l.trim()).find(Boolean) || '';
  const n = contarPalabras(primera);
  if (n >= 2 && n <= 20 && primera.length <= 120) return recortar(primera.replace(/[.;,:\s]+$/, ''), 120);
  return respaldo;
}

/* ---------- términos clave (para el respaldo determinista y el reparto de fragmentos) ---------- */

const VACIAS = new Set(['para', 'porque', 'cuando', 'donde', 'sobre', 'entre', 'desde', 'hasta', 'según', 'segun', 'aunque', 'mientras', 'también', 'tambien', 'además', 'ademas', 'entonces', 'todos', 'todas', 'otros', 'otras', 'mismo', 'misma', 'puede', 'pueden', 'tiene', 'tienen', 'hacer', 'siendo', 'estos', 'estas', 'esta', 'este', 'esto', 'esos', 'esas', 'cada', 'como', 'pero', 'esta', 'está', 'debe', 'deben', 'ser', 'más', 'mas', 'menos', 'muy', 'solo', 'sólo', 'cual', 'cuales', 'ello', 'ellos', 'forma', 'manera', 'parte', 'partes', 'decir', 'trabajo', 'presente', 'siguiente', 'través', 'traves']);

// Terminaciones de verbo conjugado: un término clave debería ser un sustantivo o un nombre propio.
const RE_VERBO = /(?:amos|emos|imos|aron|ieron|ando|iendo|aste|aban|ábamos|aría|arían|mente)$/;

// Palabras candidatas a término clave: sin vacías, sin verbos ni adverbios evidentes, sin cifras sueltas.
const fichas = (t) => (String(t || '').toLocaleLowerCase('es').match(/[\p{L}\p{N}][\p{L}\p{N}-]{3,}/gu) || [])
  .filter((w) => !VACIAS.has(w) && !RE_VERBO.test(w) && /\p{L}{3}/u.test(w));

// En cuántos fragmentos aparece cada palabra: lo que sale en todas las secciones es relleno.
function frecuenciaDocumento(fragmentos) {
  const df = new Map();
  for (const f of fragmentos) for (const w of new Set(fichas(f.texto))) df.set(w, (df.get(w) || 0) + 1);
  return df;
}

const escapar = (w) => w.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

// Palabra más característica del fragmento (frecuente aquí, rara en el resto), con su escritura original.
function terminoClave(frag, excluir = new Set(), df = null, total = 1) {
  const conteo = new Map();
  for (const w of fichas(frag.texto)) if (!excluir.has(w)) conteo.set(w, (conteo.get(w) || 0) + 1);
  let mejor = '';
  let puntaje = 0;
  for (const [w, c] of conteo) {
    const rareza = df ? Math.log(1 + total / (df.get(w) || 1)) : 1;
    // Las mayúsculas a media oración suelen marcar un nombre propio o un término técnico.
    const propio = new RegExp(`[^.!?]\\s\\p{Lu}${escapar(w.slice(1))}`, 'u').test(frag.texto) ? 1.6 : 1;
    // Un artículo delante casi siempre indica sustantivo, no verbo.
    const sustantivo = new RegExp(`\\b(?:el|la|los|las|un|una|unos|unas|del|al|su|sus|este|esta)\\s${escapar(w)}`, 'iu').test(frag.texto) ? 1.6 : 1;
    const p = c * Math.min(w.length, 14) * rareza * propio * sustantivo;
    if (p > puntaje) { puntaje = p; mejor = w; }
  }
  if (!mejor) return recortar(frag.seccion, 40).toLocaleLowerCase('es') || 'esta parte';
  const original = frag.texto.match(new RegExp(`\\b${escapar(mejor)}\\w*`, 'iu'));
  return original ? original[0] : mejor;
}

// Cita corta del fragmento: su primera oración, cortada en palabra entera si es larga.
function frase(frag, palabras = 18) {
  let cita = '';
  for (const o of frag.texto.split(/(?<=[.!?…])\s+/)) {
    cita = cita ? `${cita} ${o}` : o;
    if (contarPalabras(cita) >= 8) break; // una oración muy corta no se entiende citada sola
  }
  const p = (cita || frag.texto).split(' ');
  const corte = p.length > palabras ? p.slice(0, palabras).join(' ').replace(/[,;:\s]+$/, '') + '…' : cita;
  return recortar(corte, 180).replace(/[.,;:]+$/, ''); // se cita entre comillas: sin punto final
}

// Fragmento que mejor encaja con un texto dado; si no hay señal, reparte por posición.
function mejorFragmento(texto, fragmentos, posicion = 0) {
  const buscadas = new Set(fichas(texto));
  let mejor = null;
  let puntaje = 0;
  for (const f of fragmentos) {
    let p = 0;
    for (const w of new Set(fichas(f.texto))) if (buscadas.has(w)) p++;
    if (p > puntaje) { puntaje = p; mejor = f; }
  }
  if (mejor) return mejor.id;
  const i = Math.min(fragmentos.length - 1, Math.floor((posicion * fragmentos.length) / TIPOS.length));
  return fragmentos[i].id;
}

/* ---------- puntos ---------- */

function promptSistema(datos, fragmentos) {
  return `Preparas una defensa oral para la app Defiéndelo. Un estudiante subió su trabajo del curso "${datos.curso}" ("${datos.tarea}") y Carlos, un compañero de clase conducido por IA, lo va a interrogar.${datos.criterios ? `
El profesor espera que el estudiante pueda explicar: ${datos.criterios}` : ''}

${CARLOS.nombre}: ${CARLOS.perfil} Habla en español peruano informal, frases cortas, sin tecnicismos que no sepa. NO es profesor ni examinador: es un compañero que quiere entender.

Tu tarea: leer el trabajo y escribir EXACTAMENTE 4 puntos de defensa, en este orden y con este propósito pedagógico:
- p1, tipo "decision": por qué el estudiante tomó una decisión clave de SU trabajo. "error_de_carlos" debe ser null.
- p2, tipo "trampa": una confusión que Carlos sostiene con seguridad sobre un concepto central del trabajo. "error_de_carlos" obligatorio.
- p3, tipo "trampa": una falsa equivalencia o suposición errónea de Carlos ("X es lo mismo que Y", "eso da igual") en OTRA sección distinta a la de p2. "error_de_carlos" obligatorio.
- p4, tipo "condicion": un cambio de condición o un requerimiento nuevo e inesperado aplicado al trabajo ("¿Y si ahora nos piden...?"). "error_de_carlos" puede ser un texto o null.

Reglas:
- Todo debe salir del contenido real del trabajo: menciona sus conceptos, decisiones y nombres propios. Nada genérico.
- "fragmento" es el id de un fragmento existente de la lista ([f1], [f2], ...), el que el estudiante necesita mirar para responder. Usa un fragmento distinto en cada punto.
- "apertura" es lo que Carlos dice para abrir el punto: máximo 2 oraciones, en primera persona, con su confusión incluida si la tiene. Nunca revela la respuesta.
- "que_debe_explicar" es la pauta para el evaluador (no se le muestra al estudiante): qué tendría que cubrir una buena explicación.
- "simulado" es una respuesta de ejemplo del estudiante para el modo de demostración, con su nivel ("verde", "amarillo" o "rojo") y el motivo en tercera persona.

Responde SOLO con JSON válido, sin texto adicional:
{"titulo":"título breve del trabajo","puntos":[{"id":"p1","tipo":"decision","tema":"3 a 6 palabras","fragmento":"f1","apertura":"...","error_de_carlos":null,"que_debe_explicar":"...","simulado":{"respuesta":"...","nivel":"verde","motivo":"..."}}]}`;
}

function documentoParaPrompt(fragmentos) {
  const total = fragmentos.reduce((s, f) => s + contarPalabras(f.texto), 0);
  const limite = total > 5000 ? 70 : 0; // en trabajos largos, a cada fragmento le basta su inicio
  return fragmentos
    .map((f) => {
      const p = f.texto.split(' ');
      const texto = limite && p.length > limite ? `${p.slice(0, limite).join(' ')} […]` : f.texto;
      return `[${f.id}] (${f.seccion}) ${texto}`;
    })
    .join('\n');
}

function extraerJSON(texto) {
  const ini = String(texto || '').indexOf('{');
  const fin = String(texto || '').lastIndexOf('}');
  if (ini < 0 || fin < ini) throw new Error('la IA no devolvió JSON');
  return JSON.parse(texto.slice(ini, fin + 1));
}

const NIVELES = ['verde', 'amarillo', 'rojo'];

// Normaliza lo que devolvió la IA y garantiza la estructura de los 4 puntos.
function normalizarPuntos(crudos, fragmentos) {
  if (!Array.isArray(crudos) || crudos.length < TIPOS.length) throw new Error('la IA no devolvió 4 puntos');
  const respaldo = puntosDeterministas(fragmentos);
  const usados = new Set();
  const asignados = [];
  const seccionDe = (id) => (fragmentos.find((f) => f.id === id) || {}).seccion;
  return TIPOS.map((tipo, i) => {
    const c = crudos[i] && typeof crudos[i] === 'object' ? crudos[i] : {};
    const base = respaldo[i];
    const tema = recortar(c.tema, 60) || base.tema;
    const apertura = recortar(c.apertura, 300) || base.apertura;
    if (!tema || !apertura) throw new Error('la IA devolvió un punto vacío');

    // Si la IA inventó el id o repitió uno ya usado, se reasigna al fragmento libre que mejor encaje.
    let fragmento = fragmentos.some((f) => f.id === c.fragmento) ? c.fragmento : '';
    if (!fragmento || usados.has(fragmento)) {
      const libres = fragmentos.filter((f) => !usados.has(f.id));
      fragmento = libres.length
        ? mejorFragmento(`${tema} ${apertura} ${c.que_debe_explicar || ''}`, libres, i)
        : fragmento || fragmentos[0].id;
    }
    // La falsa equivalencia de p3 va en otra sección que p2 (si el trabajo tiene más de una).
    if (i === 2 && seccionDe(fragmento) === seccionDe(asignados[1])) {
      const otras = fragmentos.filter((f) => !usados.has(f.id) && f.seccion !== seccionDe(asignados[1]));
      if (otras.length) fragmento = mejorFragmento(`${tema} ${apertura}`, otras, i);
    }
    usados.add(fragmento);
    asignados.push(fragmento);

    // p1 nunca lleva error; p2 y p3 siempre (si la IA lo omitió, se usa el del respaldo);
    // p4 puede ir sin error si la IA lo dejó explícitamente en null.
    const error = recortar(c.error_de_carlos, 300);
    const sinError = tipo === 'decision' || (tipo === 'condicion' && c.error_de_carlos === null);
    const s = c.simulado && typeof c.simulado === 'object' ? c.simulado : {};
    return {
      id: `p${i + 1}`,
      tipo,
      tema,
      fragmento,
      apertura,
      error_de_carlos: sinError ? null : error || base.error_de_carlos,
      que_debe_explicar: recortar(c.que_debe_explicar, 500) || base.que_debe_explicar,
      simulado: {
        respuesta: recortar(s.respuesta, 600) || base.simulado.respuesta,
        nivel: NIVELES.includes(s.nivel) ? s.nivel : base.simulado.nivel,
        motivo: recortar(s.motivo, 300) || base.simulado.motivo,
      },
    };
  });
}

// Respaldo sin IA: arma los 4 puntos a partir de fragmentos repartidos a lo largo del trabajo.
export function puntosDeterministas(fragmentos) {
  const n = fragmentos.length;
  const elegidos = TIPOS.map((_, i) => fragmentos[Math.min(n - 1, Math.floor((i * n) / TIPOS.length))]);
  // Un término distinto por punto: p3 compara dos y no debe quedar "X vs. X".
  const df = frecuenciaDocumento(fragmentos);
  const vistos = new Set();
  const t = elegidos.map((f) => {
    const termino = terminoClave(f, vistos, df, n);
    vistos.add(termino.toLocaleLowerCase('es'));
    return termino;
  });

  return [
    {
      id: 'p1',
      tipo: 'decision',
      tema: `Por qué ${recortar(t[0], 40)}`,
      fragmento: elegidos[0].id,
      apertura: `Oye, una duda de tu trabajo: dices "${frase(elegidos[0], 18)}". ¿Por qué lo hiciste así y no de otra forma?`,
      error_de_carlos: null,
      que_debe_explicar: `Por qué se tomó esa decisión en "${elegidos[0].seccion}": qué problema resuelve, qué alternativa se descartó y con qué criterio.`,
      simulado: { respuesta: `Lo hice así porque era lo que mejor resolvía el problema de ${recortar(t[0], 40)}; la otra opción me obligaba a rehacer más cosas.`, nivel: 'verde', motivo: 'Explicó la decisión con sus palabras y mencionó la alternativa descartada.' },
    },
    {
      id: 'p2',
      tipo: 'trampa',
      tema: `Qué es ${recortar(t[1], 40)}`,
      fragmento: elegidos[1].id,
      apertura: `A ver si entendí: lo de "${recortar(t[1], 40)}" es más que nada un detalle de forma, ¿no? Si lo sacas, el trabajo igual funciona.`,
      error_de_carlos: `Cree que "${recortar(t[1], 40)}" es un detalle de forma que no cambia el resultado del trabajo.`,
      que_debe_explicar: `Qué es "${recortar(t[1], 40)}" en este trabajo, qué papel cumple en "${elegidos[1].seccion}" y qué se rompería sin eso.`,
      simulado: { respuesta: `No es un detalle: ${recortar(t[1], 40)} es justamente lo que sostiene esa parte. Si lo quito, se cae el resto del trabajo.`, nivel: 'verde', motivo: 'Corrigió la confusión de Carlos y explicó la función del concepto.' },
    },
    {
      id: 'p3',
      tipo: 'trampa',
      tema: `${recortar(t[2], 30)} vs. ${recortar(t[3], 30)}`,
      fragmento: elegidos[2].id,
      apertura: `Ya, y "${recortar(t[2], 30)}" viene a ser lo mismo que "${recortar(t[3], 30)}", ¿no? Al final suenan igual.`,
      error_de_carlos: `Cree que "${recortar(t[2], 30)}" y "${recortar(t[3], 30)}" son lo mismo porque los dos aparecen en el trabajo.`,
      que_debe_explicar: `En qué se diferencian "${recortar(t[2], 30)}" y "${recortar(t[3], 30)}": qué hace cada uno y por qué no son intercambiables.`,
      simulado: { respuesta: `Se parecen, pero no son lo mismo: cada uno resuelve algo distinto en el trabajo. Igual me cuesta explicar bien la diferencia.`, nivel: 'amarillo', motivo: 'Niega la equivalencia pero no logra explicar la diferencia.' },
    },
    {
      id: 'p4',
      tipo: 'condicion',
      tema: `Y si cambia ${recortar(t[3], 40)}`,
      fragmento: elegidos[3].id,
      apertura: `Oye, y si ahora nos piden cambiar lo de "${recortar(t[3], 40)}" a mitad del curso, ¿tu trabajo igual sirve o hay que rehacerlo?`,
      error_de_carlos: `Supone que cualquier cambio en "${recortar(t[3], 40)}" obliga a rehacer todo el trabajo.`,
      que_debe_explicar: `Qué partes del trabajo aguantan ese cambio y cuáles habría que ajustar, con la razón de por qué el diseño o el método lo permite.`,
      simulado: { respuesta: `No habría que rehacerlo todo: solo ajustar la parte de ${recortar(t[3], 40)}, porque el resto no depende de ese detalle.`, nivel: 'verde', motivo: 'Aplicó su trabajo a una condición nueva y acotó el impacto del cambio.' },
    },
  ];
}

// Genera los 4 puntos con IA (un reintento si el JSON falla) o sin ella.
export async function generarPuntos(datos, fragmentos) {
  if (!proveedorConfigurado()) {
    return { puntos: puntosDeterministas(fragmentos), titulo: '', modoGeneracion: 'simulado' };
  }
  const sistema = promptSistema(datos, fragmentos);
  const doc = documentoParaPrompt(fragmentos);
  let ultimo = null;
  for (let intento = 0; intento < 2; intento++) {
    try {
      const mensajes = [{ role: 'user', content: `Trabajo del estudiante, dividido en fragmentos:\n${doc}` }];
      const salida = await llamarLLM(
        intento ? `${sistema}\n\nTu respuesta anterior no fue JSON válido con 4 puntos. Devuelve solo el JSON pedido.` : sistema,
        mensajes,
        { maxTokens: 3500 },
      );
      const d = extraerJSON(salida);
      return { puntos: normalizarPuntos(d.puntos, fragmentos), titulo: recortar(d.titulo, 120), modoGeneracion: 'ia' };
    } catch (e) {
      ultimo = e;
    }
  }
  console.error('[documentos]', ultimo ? ultimo.message : 'error desconocido');
  const e = new Error('La IA no pudo estructurar los puntos del documento; intenta nuevamente.');
  e.status = 502;
  throw e;
}

/* ---------- caso completo ---------- */

// Texto extraído -> caso con la misma estructura que public/casos/demo.json.
export async function generarCaso({ id, texto, titulo, curso, tarea, criterios, estudiante, universidadId = 'demo' }) {
  const palabras = contarPalabras(normalizar(texto));
  if (palabras < MIN_PALABRAS) {
    const e = new Error(`Solo se leyeron ${palabras} palabras del archivo (mínimo ${MIN_PALABRAS}). Si es un PDF escaneado o de fotos, el texto no se puede extraer: sube el archivo original (.docx o un PDF con texto seleccionable).`);
    e.status = 400;
    throw e;
  }
  if (palabras > MAX_PALABRAS) {
    const e = new Error(`El trabajo tiene ${palabras} palabras y el máximo es ${MAX_PALABRAS}. Sube solo el capítulo o la sección que vas a defender.`);
    e.status = 400;
    throw e;
  }

  const fragmentos = fragmentarTexto(texto);
  const datos = {
    curso: recortar(curso, 80) || 'Curso no indicado',
    tarea: recortar(tarea, 120) || recortar(titulo, 120) || tituloDesdeTexto(texto),
    criterios: recortar(criterios, 600),
  };
  const { puntos, titulo: tituloIA, modoGeneracion } = await generarPuntos(datos, fragmentos);

  return {
    caso: {
      id,
      universidadId,
      curso: datos.curso,
      tarea: datos.tarea,
      estudiante: recortar(estudiante, 80),
      origen: 'documento',
      modoGeneracion,
      palabras,
      creado: new Date().toISOString(),
      carlos: { ...CARLOS },
      documento: {
        titulo: recortar(titulo, 120) || tituloIA || tituloDesdeTexto(texto, datos.tarea),
        fragmentos,
      },
      puntos,
    },
  };
}
