/* Defiéndelo — cliente. Sin dependencias. */
'use strict';
const $ = (id) => document.getElementById(id);

const S = {
  caso: null, modo: 'practica', iaOK: false, forzarSim: false,
  i: 0, hist: [], repregunto: false, resultados: {}, t0: 0,
  senales: { pantallaOculta: 0, pegadoBloqueado: 0, leyo: 0, iaCaida: false },
};

/* ---------- utilidades ---------- */
function mostrar(id) {
  document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('on', p.id === id));
  window.scrollTo(0, 0);
}
function norm(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
}
// Qué fracción de los trigramas de la respuesta aparecen tal cual en el texto del trabajo.
function contencion(resp, texto) {
  const a = norm(resp), b = norm(texto);
  if (a.length < 8) return 0;
  const tri = (w) => new Set(w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' ')));
  const A = tri(a), B = tri(b);
  let c = 0; A.forEach((x) => { if (B.has(x)) c++; });
  return A.size ? c / A.size : 0;
}
const frag = (id) => S.caso.documento.fragmentos.find((f) => f.id === id);
const punto = () => S.caso.puntos[S.i];

/* ---------- voz ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, grabando = false, base = '';
function hablar(texto) {
  if (!$('c-voz').checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = 'es-PE';
  const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith('es'));
  if (v) u.voice = v;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}
function toggleMic() {
  if (!SR) return;
  if (grabando) { rec.stop(); return; }
  speechSynthesis && speechSynthesis.cancel();
  rec = new SR();
  rec.lang = 'es-PE'; rec.continuous = true; rec.interimResults = true;
  base = $('resp').value ? $('resp').value.trim() + ' ' : '';
  rec.onresult = (e) => {
    let fin = '', tmp = '';
    for (let k = 0; k < e.results.length; k++) {
      (e.results[k].isFinal ? (fin += e.results[k][0].transcript) : (tmp += e.results[k][0].transcript));
    }
    $('resp').value = base + fin + tmp;
  };
  rec.onend = () => { grabando = false; $('b-mic').textContent = '● Hablar'; $('b-mic').classList.remove('grabando'); };
  rec.onerror = (e) => { $('d-aviso').textContent = 'Micrófono: ' + e.error + '. Puedes escribir tu respuesta.'; };
  rec.start();
  grabando = true; $('b-mic').textContent = '■ Detener'; $('b-mic').classList.add('grabando');
}

/* ---------- documento ---------- */
function pintarDoc(cont, opts) {
  cont.innerHTML = '';
  let sec = '';
  S.caso.documento.fragmentos.forEach((f) => {
    if (f.seccion !== sec) {
      sec = f.seccion;
      const h = document.createElement('p'); h.className = 'sec'; h.textContent = sec; cont.appendChild(h);
    }
    const pId = S.caso.puntos.find((p) => p.fragmento === f.id);
    const r = pId && S.resultados[pId.id];
    const el = document.createElement(opts.clicable && r ? 'button' : 'p');
    if (el.tagName === 'BUTTON') { el.type = 'button'; el.onclick = () => enfocarPunto(pId.id); }
    el.className = 'frag' + (r ? ' ' + r.nivel : '') + (opts.senalado === f.id ? ' senalado' : '');
    el.id = (opts.pref || '') + f.id;
    el.textContent = f.texto;
    cont.appendChild(el);
  });
}

/* ---------- entrada, código y profesor ---------- */
const normCodigo = (c) => {
  c = (c || '').toUpperCase().replace(/[\s_]/g, '');
  return /^[A-Z0-9]{6}$/.test(c) ? c.slice(0, 3) + '-' + c.slice(3) : c;
};

async function iniciar() {
  try {
    const r = await (await fetch('api/carlos')).json();
    S.iaOK = !!r.ia;
  } catch { S.iaOK = false; }
  document.querySelectorAll('.estado-ia').forEach((e) => { e.textContent = S.iaOK ? 'IA conectada' : 'modo simulado (sin IA configurada)'; });
  const pre = new URLSearchParams(location.search).get('codigo');
  if (pre) { $('codigo').value = normCodigo(pre); return entrarConCodigo(); }
  mostrar('rol');
}

async function entrarConCodigo(e) {
  if (e) e.preventDefault();
  const codigo = normCodigo($('codigo').value);
  $('codigo-err').textContent = '';
  if (!codigo) { $('codigo-err').textContent = 'Escribe el código.'; return; }
  try {
    const r = await fetch('api/tareas?codigo=' + encodeURIComponent(codigo));
    const t = await r.json();
    if (!r.ok) throw new Error(t.error || 'No se pudo cargar la tarea');
    S.tarea = t;
    S.casoId = t.casoId || 'demo';
    S.caso = await (await fetch(`casos/${S.casoId}.json`)).json();
  } catch (err) {
    $('codigo-err').textContent = err.message; mostrar('rol'); return;
  }
  const t = S.tarea;
  $('i-curso').textContent = t.curso + (t.profesor ? ' · ' + t.profesor : '') + (t.cierre ? ' · cierra ' + t.cierre : '');
  $('i-titulo').textContent = t.titulo;
  $('i-crit').textContent = t.criterios || '';
  $('i-crit-caja').classList.toggle('oculto', !t.criterios);
  $('i-codigo').textContent = t.codigo;
  $('i-tarea').textContent = S.caso.documento.titulo;
  $('i-prov').textContent = S.caso.provisional ? 'caso de ejemplo provisional' : '';
  mostrar('inicio');
}

async function abrirProfe() {
  if (!$('t-caso').options.length) {
    try {
      const lista = await (await fetch('casos/index.json')).json();
      lista.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.titulo; $('t-caso').appendChild(o); });
    } catch { /* sin lista: queda vacío y el servidor usa demo */ }
  }
  $('creada').classList.add('oculto');
  mostrar('profe');
}

async function crearTarea(e) {
  e.preventDefault();
  $('tarea-err').textContent = ''; $('b-crear').disabled = true;
  try {
    const r = await fetch('api/tareas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titulo: $('t-titulo').value, curso: $('t-curso').value, profesor: $('t-prof').value, criterios: $('t-crit').value, cierre: $('t-cierre').value, casoId: $('t-caso').value }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo crear la tarea');
    $('c-codigo').textContent = d.codigo;
    $('c-aviso').textContent = d.persistente ? 'El código queda activo 60 días.' : 'Demo sin base de datos: el código dura mientras el servidor siga encendido.';
    $('creada').classList.remove('oculto');
    $('creada').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    $('tarea-err').textContent = err.message;
  } finally { $('b-crear').disabled = false; }
}

async function copiar(texto, boton) {
  const antes = boton.textContent;
  try { await navigator.clipboard.writeText(texto); boton.textContent = 'Copiado'; } catch { boton.textContent = 'Cópialo a mano'; }
  setTimeout(() => { boton.textContent = antes; }, 1600);
}

function empezar() {
  S.nombre = $('nombre').value.trim();
  if (!S.nombre) { $('nombre-err').textContent = 'Escribe tu nombre para que tu profesor reconozca tu defensa.'; $('nombre').focus(); return; }
  $('nombre-err').textContent = '';
  S.modo = document.querySelector('input[name=modo]:checked').value;
  S.i = 0; S.resultados = {}; S.t0 = Date.now();
  S.senales = { pantallaOculta: 0, pegadoBloqueado: 0, leyo: 0, iaCaida: false };
  $('d-modo').textContent = S.modo === 'practica' ? 'práctica' : 'evaluación';
  $('d-titulo').textContent = S.caso.documento.titulo;
  $('b-sim').classList.toggle('oculto', S.iaOK && !S.forzarSim && S.modo === 'evaluacion');
  $('b-mic').classList.toggle('oculto', !SR);
  if (!SR) $('d-aviso').textContent = 'Tu navegador no permite dictado: escribe tu respuesta (Chrome sí lo permite).';
  mostrar('defensa');
  abrirPunto();
}

/* ---------- defensa ---------- */
function progreso() {
  $('progreso').innerHTML = '';
  S.caso.puntos.forEach((p, k) => {
    const li = document.createElement('li');
    const r = S.resultados[p.id];
    li.className = r ? r.nivel : (k === S.i ? 'ahora' : '');
    li.title = p.tema;
    $('progreso').appendChild(li);
  });
}
function decir(texto) { $('d-dice').classList.remove('pensando'); $('d-dice').textContent = texto; hablar(texto); }
function abrirPunto() {
  const p = punto();
  S.hist = [{ rol: 'carlos', texto: p.apertura }];
  S.repregunto = false;
  $('d-punto').textContent = `punto ${S.i + 1} de ${S.caso.puntos.length}`;
  $('resp').value = ''; $('d-aviso').textContent = SR ? '' : $('d-aviso').textContent;
  modoRespuesta(true);
  pintarDoc($('d-doc'), { senalado: p.fragmento });
  progreso();
  decir(p.apertura);
  // Desplaza solo el panel del documento (no la página) hasta lo que señala Carlos.
  const f = $(p.fragmento), caja = document.querySelector('.defensa .doc');
  if (f && caja.scrollHeight > caja.clientHeight) caja.scrollTo({ top: f.offsetTop - caja.clientHeight / 3, behavior: 'smooth' });
}
function modoRespuesta(on) {
  ['b-mic', 'b-enviar', 'b-nose', 'b-sim', 'resp'].forEach((id) => { $(id).disabled = !on; });
  $('b-sig').classList.toggle('oculto', on);
}

const corta = (t) => (t.length > 150 ? t.slice(0, 150).replace(/\s+\S*$/, '') + '…' : t);
function simulado(p, texto, leyo) {
  const r = simuladoBase(p, texto, leyo);
  r.evidencia = corta(r.evidencia);
  return r;
}
function simuladoBase(p, texto, leyo) {
  const s = p.simulado;
  if (!texto.trim() || texto === 'No sé.') return { nivel: 'rojo', motivo: 'No dio una explicación para este punto.', evidencia: texto || '(sin respuesta)', repreguntar: false, carlos_dice: 'Ya, tranqui. Lo vemos después.' };
  if (leyo) return { nivel: 'amarillo', motivo: 'Leyó su trabajo casi palabra por palabra, sin explicarlo.', evidencia: texto.slice(0, 120), repreguntar: false, carlos_dice: 'Eso es lo que dice tu informe, ¿pero me lo puedes explicar con tus palabras? Bueno, sigamos.' };
  if (texto.trim() === s.respuesta) {
    const reac = { verde: 'Ahhh, ya entendí. Gracias, causa.', amarillo: 'Mmm, más o menos lo entiendo… sigamos.', rojo: 'Ah ya, entonces sí era como yo decía.' };
    return { nivel: s.nivel, motivo: s.motivo, evidencia: s.respuesta.slice(0, 120), repreguntar: false, carlos_dice: reac[s.nivel] };
  }
  return { nivel: 'amarillo', motivo: 'Modo simulado: respuesta libre sin evaluación de IA.', evidencia: texto.slice(0, 120), repreguntar: false, carlos_dice: 'Ya, creo que te entiendo. Sigamos.' };
}

async function responder(texto) {
  texto = (texto || '').trim();
  if (grabando) rec.stop();
  const p = punto();
  const leyo = contencion(texto, frag(p.fragmento).texto) >= 0.6;
  if (leyo) S.senales.leyo++;
  S.hist.push({ rol: 'estudiante', texto: texto || '(silencio)' });
  modoRespuesta(false); $('b-sig').classList.add('oculto');
  $('d-dice').classList.add('pensando'); $('d-dice').textContent = 'Carlos está pensando…';

  let r;
  if (S.iaOK && !S.forzarSim) {
    try {
      const res = await fetch('api/carlos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ casoId: S.casoId, puntoId: p.id, historial: S.hist, yaRepregunto: S.repregunto, leyo }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      r = await res.json();
    } catch (e) {
      S.senales.iaCaida = true; S.forzarSim = true;
      $('d-aviso').textContent = 'La IA no respondió; seguimos en modo simulado.';
      r = simulado(p, texto, leyo);
    }
  } else {
    r = simulado(p, texto, leyo);
  }

  if (r.repreguntar && !S.repregunto) {
    S.repregunto = true;
    S.hist.push({ rol: 'carlos', texto: r.carlos_dice });
    $('resp').value = '';
    modoRespuesta(true);
    decir(r.carlos_dice);
    return;
  }
  S.resultados[p.id] = { nivel: r.nivel, motivo: r.motivo, evidencia: r.evidencia, leyo, conversacion: S.hist.slice() };
  pintarDoc($('d-doc'), {});
  progreso();
  decir(r.carlos_dice);
  $('b-sig').textContent = S.i < S.caso.puntos.length - 1 ? 'Siguiente' : 'Ver mi resultado';
  $('b-sig').classList.remove('oculto');
  $('b-sig').focus();
}
function siguiente() {
  if (S.i < S.caso.puntos.length - 1) { S.i++; abrirPunto(); } else { reporte(); }
}

/* ---------- reporte ---------- */
function reporte() {
  speechSynthesis && speechSynthesis.cancel();
  const ps = S.caso.puntos;
  const val = { verde: 2, amarillo: 1, rojo: 0 };
  const prom = ps.reduce((a, p) => a + val[S.resultados[p.id].nivel], 0) / ps.length;
  const nivel = prom >= 1.5 ? ['verde', 'Nivel alto sugerido'] : prom >= 0.8 ? ['amarillo', 'Nivel medio sugerido'] : ['rojo', 'Nivel bajo sugerido'];
  const seg = Math.round((Date.now() - S.t0) / 1000);
  $('r-meta').textContent = `${S.nombre} · ${S.tarea.codigo} · ${Math.floor(seg / 60)} min ${seg % 60} s`;
  $('r-modo').textContent = S.modo === 'practica' ? 'práctica · solo tú ves este resultado' : 'evaluación · reporte para el profesor';
  const verdes = ps.filter((p) => S.resultados[p.id].nivel === 'verde').length;
  $('r-titulo').textContent = `Le explicaste bien ${verdes} de ${ps.length} puntos a Carlos.`;
  $('r-nota').textContent = S.modo === 'evaluacion' ? 'La nota final la decide tu profesor. Este nivel es solo una sugerencia.' : 'Haz clic en una parte marcada del trabajo para ver qué dijiste.';
  $('r-nivel').className = 'chip grande ' + nivel[0]; $('r-nivel').textContent = nivel[1];
  pintarDoc($('r-doc'), { clicable: true, pref: 'r-' });

  const cont = $('r-puntos'); cont.innerHTML = '<h2>Por punto</h2>';
  ps.forEach((p) => {
    const r = S.resultados[p.id];
    const d = document.createElement('div'); d.className = 'r-item'; d.id = 'ri-' + p.id;
    const etiqueta = { verde: 'explicado', amarillo: 'a medias', rojo: 'no explicado' }[r.nivel];
    d.innerHTML = '<div class="fila"><b></b><span class="chip"></span></div><span class="suave"></span><span class="cita"></span>';
    d.querySelector('b').textContent = p.tema;
    d.querySelector('.chip').className = 'chip ' + r.nivel; d.querySelector('.chip').textContent = etiqueta;
    d.querySelector('.suave').textContent = r.motivo;
    d.querySelector('.cita').textContent = '“' + r.evidencia + '”';
    cont.appendChild(d);
  });

  const sen = [];
  if (S.senales.leyo) sen.push(`${S.senales.leyo} respuesta(s) casi idénticas al texto del trabajo.`);
  if (S.senales.pantallaOculta) sen.push(`Salió de la pestaña ${S.senales.pantallaOculta} vez/veces.`);
  if (S.senales.pegadoBloqueado) sen.push(`Intentó pegar texto ${S.senales.pegadoBloqueado} vez/veces.`);
  if (S.senales.iaCaida) sen.push('La IA falló durante la sesión; parte se evaluó en modo simulado.');
  $('r-senales').innerHTML = '<h2>Señales de la sesión</h2>';
  const ps2 = document.createElement('p'); ps2.className = 'suave';
  ps2.textContent = sen.length ? sen.join(' ') + ' Son alertas para revisar, no acusaciones.' : 'Sin señales que revisar.';
  $('r-senales').appendChild(ps2);

  const pend = ps.filter((p) => S.resultados[p.id].nivel !== 'verde');
  const sig = $('r-siguiente');
  sig.innerHTML = '';
  const h = document.createElement('h2'); const t = document.createElement('p'); const b = document.createElement('button');
  b.className = 'btn amarillo'; b.type = 'button'; b.style.marginTop = '12px';
  if (S.modo === 'practica') {
    h.textContent = pend.length ? 'Qué repasar' : 'Listo para la evaluación';
    t.textContent = pend.length ? 'Repasa: ' + pend.map((p) => p.tema.toLowerCase()).join(', ') + '. Luego vuelve a intentarlo con Carlos.' : 'Explicaste todos los puntos. Ya puedes hacer la defensa en modo evaluación.';
    b.textContent = 'Intentar de nuevo'; b.onclick = () => mostrar('inicio');
  } else {
    h.textContent = 'Reporte para el profesor';
    t.textContent = 'En el producto, este reporte (con el trabajo marcado y la conversación) llega al profesor. En esta demo no se envía a ningún lado.';
    b.textContent = 'Volver al inicio'; b.onclick = () => mostrar('inicio');
  }
  sig.append(h, t, b);
  mostrar('reporte');
}
function enfocarPunto(pid) {
  document.querySelectorAll('.r-item').forEach((x) => x.classList.toggle('activo', x.id === 'ri-' + pid));
  const el = $('ri-' + pid); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- eventos ---------- */
$('f-codigo').addEventListener('submit', entrarConCodigo);
$('b-ir-profe').onclick = abrirProfe;
$('nombre').addEventListener('input', () => { $('nombre-err').textContent = ''; });
$('codigo').addEventListener('input', () => { $('codigo-err').textContent = ''; });
$('f-tarea').addEventListener('submit', crearTarea);
$('b-copiar').onclick = (e) => copiar($('c-codigo').textContent, e.currentTarget);
$('b-copiar-link').onclick = (e) => copiar(location.origin + location.pathname + '?codigo=' + $('c-codigo').textContent, e.currentTarget);
$('b-probar').onclick = () => { $('codigo').value = $('c-codigo').textContent; entrarConCodigo(); };
document.querySelectorAll('[data-ir]').forEach((b) => { b.onclick = () => mostrar(b.dataset.ir); });
$('b-empezar').onclick = empezar;
$('b-mic').onclick = toggleMic;
$('b-enviar').onclick = () => responder($('resp').value);
$('b-nose').onclick = () => responder('No sé.');
$('b-sim').onclick = () => { $('resp').value = punto().simulado.respuesta; };
$('b-sig').onclick = siguiente;
$('resp').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) responder($('resp').value); });
$('resp').addEventListener('paste', (e) => {
  if (S.modo === 'evaluacion') { e.preventDefault(); S.senales.pegadoBloqueado++; $('d-aviso').textContent = 'En evaluación no se puede pegar texto.'; }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && $('defensa').classList.contains('on')) S.senales.pantallaOculta++;
});
setInterval(() => {
  if (!$('defensa').classList.contains('on')) return;
  const s = Math.floor((Date.now() - S.t0) / 1000);
  $('reloj').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}, 1000);
iniciar();
