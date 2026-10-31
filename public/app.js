/* Defiendelo — cliente. Sin dependencias. */
'use strict';
const $ = (id) => document.getElementById(id);

const S = {
  caso: null, modo: 'evaluacion', tipo: 'evaluacion', soloVoz: false, iaOK: false, forzarSim: false, intento: null, llave: null,
  i: 0, hist: [], repregunto: false, resultados: {}, t0: 0,
  senales: { pantallaOculta: 0, pegadoBloqueado: 0, leyo: 0, dubitativo: 0, captura: 0, iaCaida: false },
};

/* ---------- utilidades ---------- */
function mostrar(id) {
  document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('on', p.id === id));
  document.body.classList.toggle('protegido', id === 'defensa');
  document.body.classList.remove('velado');
  window.scrollTo(0, 0);
}
// Lectura literal y muletillas: js/senales.js, el mismo código con el que el servidor las recalcula.
const { leyoTrabajo, esDubitativo } = window.Senales;
// Pide un caso con lo que demuestra que se puede abrir: la llave de quien lo subió o el código de la tarea.
const urlCaso = (id) => 'api/casos?id=' + encodeURIComponent(id) + (S.tarea ? '&codigo=' + encodeURIComponent(S.tarea.codigo) : '');
const pedirCaso = (id, llave) => fetch(urlCaso(id), { headers: llave ? { 'x-llave-caso': llave } : {} });
const frag = (id) => S.caso.documento.fragmentos.find((f) => f.id === id);
const punto = () => S.caso.puntos[S.i];
function tipoPunto(p) {
  if (!p) return 'decision';
  if (p.tipo) return p.tipo;
  if (/condici[oó]n|mañana|nuevo canal|cambio/i.test(p.tema || '') || /si mañana/i.test(p.apertura || '')) return 'condicion';
  if (p.error_de_carlos) return 'trampa';
  return 'decision';
}
const HUMOR_TXT = {
  curioso: 'compañero curioso',
  confundido: 'dudando de su teoría',
  ironico: 'modo escéptico',
  convencido: 'convencido por ti',
  pensando: 'procesando tu idea…',
};
function fijarAvatar(estado) {
  const e = HUMOR_TXT[estado] ? estado : 'curioso';
  if ($('av-carlos')) $('av-carlos').dataset.estado = e;
  if ($('d-humor')) $('d-humor').textContent = HUMOR_TXT[e];
}
function actualizarTermometro(ultimoNivel, enRepregunta) {
  if (!S.caso || !$('termo-relleno')) return;
  const total = S.caso.puntos.length || 1;
  const peso = { verde: 1, amarillo: 0.45, rojo: 0 };
  const suma = Object.values(S.resultados).reduce((acc, r) => acc + (peso[r.nivel] ?? 0), 0);
  const pct = Math.min(100, Math.round((suma / total) * 100));
  const barra = $('termo-relleno');
  barra.style.width = pct + '%';
  barra.className = 'termo-relleno' + (pct >= 70 ? ' verde' : ultimoNivel === 'rojo' ? ' rojo' : '');
  let msg = 'esperando tu explicación';
  if (enRepregunta) msg = 'sigue con dudas, aclárale el punto';
  else if (ultimoNivel === 'verde') msg = 'lo convenciste con argumentos';
  else if (ultimoNivel === 'amarillo') msg = 'quedó medio convencido';
  else if (ultimoNivel === 'rojo') {
    msg = 'no lograste convencerlo';
    const caja = $('termo-caja');
    if (caja) { caja.classList.remove('sacudir'); void caja.offsetWidth; caja.classList.add('sacudir'); }
  }
  $('termo-txt').textContent = `${pct}% · ${msg}`;
}

/* ---------- voz ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, grabando = false, base = '';
const ESCUCHANDO = 'Te escucho. Pulsa Detener cuando termines.';
const ERRORES_MIC = {
  'not-allowed': 'El navegador bloqueó el micrófono. Permítelo con el icono junto a la dirección de la página, o escribe tu respuesta.',
  'service-not-allowed': 'El navegador bloqueó el dictado. Usa Chrome o Edge, o escribe tu respuesta.',
  'audio-capture': 'No se detectó ningún micrófono. Conecta uno o escribe tu respuesta.',
  network: 'El dictado de este navegador no está disponible. Usa Chrome o Edge, o escribe tu respuesta.',
  'no-speech': 'No se escuchó nada. Revisa tu micrófono y pulsa Hablar otra vez.',
};
const LIMITE_RESPUESTA_SEG = 30;
let timerInicioRespuesta = null;
let segundosRestantesResp = LIMITE_RESPUESTA_SEG;
let respuestaIniciada = false;

function iniciarTemporizadorRespuesta() {
  detenerTemporizadorRespuesta(false);
  if ($('d-controles')?.classList.contains('oculto') || $('resp')?.disabled) return;
  respuestaIniciada = false;
  segundosRestantesResp = LIMITE_RESPUESTA_SEG;
  const chip = $('d-tiempo-resp');
  if (!chip) return;
  chip.textContent = '⏱ ' + segundosRestantesResp + 's para responder';
  chip.className = 'mono chico chip-tiempo';
  chip.classList.remove('oculto');

  timerInicioRespuesta = setInterval(() => {
    segundosRestantesResp--;
    if (segundosRestantesResp <= 10 && segundosRestantesResp > 0) {
      chip.classList.add('urgente');
    }
    if (segundosRestantesResp > 0) {
      chip.textContent = '⏱ ' + segundosRestantesResp + 's para responder';
    } else {
      clearInterval(timerInicioRespuesta);
      timerInicioRespuesta = null;
      chip.textContent = '⏱ Tiempo agotado';
      chip.className = 'mono chico chip-tiempo urgente';
      S.senales.tiempoAgotado = (S.senales.tiempoAgotado || 0) + 1;
      $('d-aviso').textContent = 'Se agotaron los 30 segundos para comenzar a responder.';
      responder('No sé. Se me acabaron los 30 segundos para empezar a responder.');
    }
  }, 1000);
}

function marcarInicioRespuesta() {
  if (respuestaIniciada) return;
  respuestaIniciada = true;
  if (timerInicioRespuesta) {
    clearInterval(timerInicioRespuesta);
    timerInicioRespuesta = null;
  }
  const chip = $('d-tiempo-resp');
  if (!chip) return;
  chip.className = 'mono chico chip-tiempo activo';
  chip.textContent = grabando ? '● Grabando...' : '✓ Respondiendo';
}

function detenerTemporizadorRespuesta(iniciado) {
  if (timerInicioRespuesta) {
    clearInterval(timerInicioRespuesta);
    timerInicioRespuesta = null;
  }
  const chip = $('d-tiempo-resp');
  if (!chip) return;
  if (iniciado) {
    marcarInicioRespuesta();
  } else {
    chip.classList.add('oculto');
  }
}

function hablar(texto, esPregunta = false) {
  $('av-carlos')?.classList.remove('hablando');
  if (!$('c-voz').checked || !('speechSynthesis' in window)) {
    if (esPregunta) iniciarTemporizadorRespuesta();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = 'es-PE';
  const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith('es'));
  if (v) u.voice = v;
  u.rate = 1.10;
  let arrancado = false;
  const alTerminarHablar = () => {
    $('av-carlos')?.classList.remove('hablando');
    if (!arrancado) {
      arrancado = true;
      if (esPregunta) iniciarTemporizadorRespuesta();
    }
  };
  u.onstart = () => $('av-carlos')?.classList.add('hablando');
  u.onend = alTerminarHablar;
  u.onerror = alTerminarHablar;
  setTimeout(() => { if (!arrancado && $('av-carlos')?.classList.contains('hablando')) alTerminarHablar(); }, Math.max(5000, texto.length * 90));
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
    marcarInicioRespuesta();
    let fin = '', tmp = '';
    for (let k = 0; k < e.results.length; k++) {
      (e.results[k].isFinal ? (fin += e.results[k][0].transcript) : (tmp += e.results[k][0].transcript));
    }
    $('resp').value = base + fin + tmp;
    actualizarBorrar();
  };
  rec.onend = () => { grabando = false; $('b-mic').textContent = '● Hablar'; $('b-mic').classList.remove('grabando'); if ($('d-aviso').textContent === ESCUCHANDO) $('d-aviso').textContent = ''; };
  rec.onerror = (e) => { $('d-aviso').textContent = ERRORES_MIC[e.error] || 'No se pudo usar el micrófono. Puedes escribir tu respuesta.'; };
  rec.start();
  marcarInicioRespuesta();
  grabando = true; $('b-mic').textContent = '■ Detener'; $('b-mic').classList.add('grabando');
  $('d-aviso').textContent = ESCUCHANDO;
}
// Al enviar se deja de transcribir: una frase que llegue tarde no debe caer en la respuesta del siguiente punto.
function detenerMic() {
  if (!grabando) return;
  rec.onresult = null;
  rec.stop();
}
// En modo voz, el cuadro solo muestra lo que se transcribe: no se puede escribir ni pegar.
// Si el dictado salió mal, se borra y se vuelve a hablar.
function aplicarModoRespuesta() {
  const voz = S.respuesta === 'voz';
  $('b-mic').classList.toggle('oculto', !voz);
  $('b-cambiar').classList.toggle('oculto', !SR || S.soloVoz);
  $('b-cambiar').textContent = voz ? 'Prefiero escribir' : 'Prefiero hablar';
  $('resp').readOnly = voz;
  $('resp').classList.toggle('transcripcion', voz);
  $('resp').placeholder = voz ? 'Pulsa Hablar y explícale a Carlos. Aquí verás lo que vas diciendo.' : 'Escribe tu explicación con tus palabras…';
  actualizarBorrar();
}
function actualizarBorrar() {
  $('b-borrar').classList.toggle('oculto', S.respuesta !== 'voz' || !$('resp').value.trim());
}
function borrarDictado() {
  detenerMic();
  base = '';
  $('resp').value = '';
  $('d-aviso').textContent = '';
  actualizarBorrar();
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
    if (opts.senalado === f.id) {
      const pAct = punto();
      const tp = tipoPunto(pAct);
      const nota = document.createElement('span');
      nota.className = 'frag-nota mono';
      nota.textContent = (tp === 'condicion' ? 'Cambio de condición · ' : tp === 'trampa' ? 'Hipótesis de Carlos · ' : 'Duda de Carlos · ') + (pAct ? pAct.tema : 'Sección señalada');
      const cuerpo = document.createElement('span');
      cuerpo.className = 'frag-texto';
      cuerpo.textContent = f.texto;
      el.append(nota, cuerpo);
    } else {
      el.textContent = f.texto;
    }
    cont.appendChild(el);
  });
}

/* ---------- entrada, código y profesor ---------- */
// Fecha límite legible en la hora local de quien mira: "vie, 7 nov, 23:59".
function formatoFecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const ETIQUETA_ACTIVIDAD = { evaluacion: 'evaluación calificada', practica: 'práctica' };
const plazoVencido = (t) => !!t.fechaLimite && Date.now() > Date.parse(t.fechaLimite);
// DEMO-01 tiene otro formato que los códigos normales (ABC-DEF): "demo01" no debe volverse "DEM-O01".
const normCodigo = (c) => {
  c = (c || '').toUpperCase().replace(/[\s_]/g, '');
  if (c.replace(/-/g, '') === 'DEMO01') return 'DEMO-01';
  return /^[A-Z0-9]{6}$/.test(c) ? c.slice(0, 3) + '-' + c.slice(3) : c;
};

async function iniciar() {
  try {
    const r = await (await fetch('api/carlos')).json();
    S.iaOK = !!r.ia;
  } catch { S.iaOK = false; }
  document.querySelectorAll('.estado-ia').forEach((e) => { e.textContent = S.iaOK ? '' : 'modo demostración, sin IA'; });
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
    S.casoUsado = false;
    S.llave = null;
    S.casoId = t.casoId || 'demo';
    if (S.casoId === 'estudiante') {
      S.caso = null;
    } else {
      const rc = await pedirCaso(S.casoId);
      if (!rc.ok) throw new Error('No se pudo cargar el trabajo');
      S.caso = await rc.json();
    }
  } catch (err) {
    $('codigo-err').textContent = err.message; mostrar('rol'); return;
  }
  const t = S.tarea;
  $('i-curso').textContent = t.curso + (t.profesor ? ' · ' + t.profesor : '') + (t.tipoActividad ? ' · ' + ETIQUETA_ACTIVIDAD[t.tipoActividad] : '');
  $('i-plazo').textContent = t.fechaLimite ? (plazoVencido(t) ? 'Venció el ' : 'Fecha límite: ') + formatoFecha(t.fechaLimite) : '';
  $('i-plazo').classList.toggle('vencido', plazoVencido(t));
  $('i-titulo').textContent = t.titulo;
  $('i-crit').textContent = t.criterios || '';
  $('i-crit-caja').classList.toggle('oculto', !t.criterios);
  $('i-enunciado-caja').classList.toggle('oculto', !t.enunciado);
  $('i-enunciado-nombre').textContent = 'Leer las instrucciones de la tarea';
  $('i-enunciado').textContent = t.enunciado || '';
  $('i-teoria-caja').classList.toggle('oculto', !t.teoria);
  $('i-teoria').textContent = t.teoria || '';
  $('i-codigo').textContent = t.codigo;
  $('i-tarea').textContent = S.caso ? S.caso.documento.titulo : 'Aún no subes tu resolución';
  $('i-prov').textContent = S.caso?.provisional ? 'caso de ejemplo provisional' : '';
  prepararRendir(t);
  window.dispatchEvent(new CustomEvent('defiendelo:inicio', { detail: t }));
  mostrar('inicio');
}

async function abrirProfe() {
  $('creada').classList.add('oculto');
  mostrar('profe');
}

async function crearTarea(e) {
  e.preventDefault();
  $('tarea-err').textContent = ''; $('b-crear').disabled = true;
  try {
    const r = await fetch('api/tareas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // datosPlazoTarea y datosOrigenTarea (js/subir.js) lanzan un error con un mensaje claro si falta algo.
      body: JSON.stringify({ titulo: $('t-titulo').value, curso: $('t-curso').value, profesor: $('t-prof').value, criterios: $('t-crit').value, ...window.datosPlazoTarea(), ...window.datosOrigenTarea() }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo crear la tarea');
    $('c-codigo').textContent = d.codigo;
    const plazo = window.datosPlazoTarea();
    $('c-resumen').textContent = `${ETIQUETA_ACTIVIDAD[plazo.tipoActividad]} · fecha límite: ${formatoFecha(plazo.fechaLimite)}`;
    $('c-aviso').textContent = d.persistente ? 'El código queda activo 60 días.' : 'Sin base de datos conectada: el código dura mientras el servidor siga encendido.';
    if (window.mostrarTokenCreado) window.mostrarTokenCreado(d);
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

// Abre la entrega en el servidor. Ahí quedan registradas las evaluaciones de Carlos, y con ellas se
// arma el reporte. El servidor rechaza aquí una segunda entrega o una tarea cerrada.
async function abrirIntento() {
  const r = await fetch('api/intentos', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ codigo: S.tarea.codigo, nombre: S.nombre, casoId: S.casoId, llave: S.llave }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo empezar la entrega. Intenta de nuevo.');
  return d.intento;
}

// La tarea define cómo se rinde: una práctica, las veces que se quiera y por voz o escrito; una evaluación,
// una sola vez y solo por voz (salvo que el profesor permita responder por escrito).
function prepararRendir(t) {
  const practica = t.tipoActividad === 'practica' || t.codigo === 'DEMO-01';
  S.tipo = practica ? 'practica' : 'evaluacion';
  S.soloVoz = !practica && !t.permitirEscrito;
  const vencida = plazoVencido(t);
  const sinEntregas = !!t.cerrada || (!practica && vencida);
  const sinDictado = S.soloVoz && !SR;

  $('reglas-titulo').textContent = practica ? 'Práctica' : 'Evaluación calificada';
  $('reglas-intentos').textContent = practica ? 'intentos ilimitados' : '1 solo intento';
  $('reglas-intentos').className = 'chip' + (practica ? '' : ' amarillo');
  const reglas = practica
    ? ['Puedes rendirla las veces que quieras: tu profesor ve cada intento.', 'Puedes responder hablando o escribiendo.', 'Carlos te hará 4 preguntas sobre tu trabajo (unos 5 a 7 minutos).']
    : ['Tienes un solo intento: si sales a mitad, se entrega lo que llevas.',
      S.soloVoz ? 'Respondes hablando: lo que dices se transcribe y no se puede editar.' : 'Puedes responder hablando o escribiendo.',
      'Carlos te hará 4 preguntas sobre tu trabajo (unos 5 a 7 minutos).'];
  if (t.cerrada) reglas.unshift('El profesor cerró esta tarea: ya no recibe entregas.');
  else if (sinEntregas) reglas.unshift('El plazo de esta evaluación ya venció: ya no recibe entregas.');
  else if (vencida) reglas.unshift('La fecha de referencia ya pasó: puedes rendirla, pero llegará fuera de plazo.');
  $('reglas-lista').replaceChildren(...reglas.map((r) => Object.assign(document.createElement('li'), { textContent: r })));

  // Solo voz: no se ofrece responder por escrito.
  $('op-texto').classList.toggle('oculto', S.soloVoz);
  $('f-respuesta').classList.toggle('oculto', S.soloVoz); // con una sola forma de responder, no hay nada que elegir
  if (S.soloVoz && SR) document.querySelector('input[name=respuesta][value=voz]').checked = true;
  $('aviso-voz').classList.toggle('oculto', !sinDictado);
  $('aviso-voz').textContent = sinDictado ? 'Esta evaluación se rinde hablando y este navegador no permite dictado. Ábrela en Chrome o Edge, con micrófono.' : '';

  $('b-empezar').textContent = practica ? 'Rendir práctica' : 'Rendir evaluación';
  $('b-empezar').dataset.bloqueado = sinEntregas || sinDictado ? '1' : '';
  $('b-empezar').dataset.motivo = t.cerrada ? 'El profesor cerró esta tarea: ya no recibe entregas.'
    : sinEntregas ? 'El plazo de esta evaluación ya venció.'
      : sinDictado ? 'Abre esta página en Chrome o Edge, con micrófono, para rendir la evaluación.' : '';
}

async function empezar() {
  if ($('b-empezar').dataset.bloqueado) { $('nombre-err').textContent = $('b-empezar').dataset.motivo; return; }
  if (!S.caso) { $('nombre-err').textContent = 'Primero sube y procesa tu trabajo (.pdf o .docx).'; return; }
  S.nombre = $('nombre').value.trim();
  if (!S.nombre) { $('nombre-err').textContent = 'Escribe tu nombre para que tu profesor reconozca tu defensa.'; $('nombre').focus(); return; }
  $('nombre-err').textContent = '';
  // Todo intento se registra: en una práctica se puede repetir; en una evaluación, una sola vez.
  S.modo = 'evaluacion';
  S.intento = null;
  {
    const boton = $('b-empezar');
    const textoBoton = boton.textContent;
    boton.disabled = true;
    try {
      // Primero se abre el intento: si ya entregó o la tarea está cerrada, no se gasta IA en dudas nuevas.
      S.intento = await abrirIntento();
      if (S.casoUsado && window.renovarCasoEntrega) {
        boton.textContent = 'Carlos prepara dudas nuevas…';
        await window.renovarCasoEntrega();
        // El intento recién abierto no tiene respuestas, así que se reemplaza por uno con el trabajo nuevo.
        S.intento = await abrirIntento();
      }
    } catch (err) {
      S.intento = null;
      $('nombre-err').textContent = err.message;
      return;
    } finally {
      boton.disabled = false;
      boton.textContent = textoBoton;
    }
  }
  S.casoUsado = true;
  S.respuesta = document.querySelector('input[name=respuesta]:checked').value;
  S.i = 0; S.resultados = {}; S.t0 = Date.now(); S.respondio = false; S.entregaConfirmada = false;
  S.senales = { pantallaOculta: 0, pegadoBloqueado: 0, leyo: 0, dubitativo: 0, captura: 0, iaCaida: false, tiempoAgotado: 0 };
  $('marca-agua').textContent = `${S.nombre} · ${S.tarea.codigo}   `.repeat(120);
  $('d-modo').textContent = S.tipo === 'practica' ? 'práctica' : 'evaluación';
  $('d-titulo').textContent = S.caso.documento.titulo;
  S.forzarSim = false;
  $('b-sim').classList.toggle('oculto', S.iaOK);
  aplicarModoRespuesta();
  actualizarTermometro(null, false);
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
function decir(texto, esPregunta = false) { $('d-dice').classList.remove('pensando'); $('d-dice').textContent = texto; hablar(texto, esPregunta); }
function abrirPunto() {
  const p = punto();
  const tp = tipoPunto(p);
  S.hist = [{ rol: 'carlos', texto: p.apertura }];
  S.repregunto = false;
  $('d-punto').textContent = `punto ${S.i + 1} de ${S.caso.puntos.length}`;
  $('resp').value = ''; $('d-aviso').textContent = ''; actualizarBorrar();
  if ($('cinta-condicion')) $('cinta-condicion').classList.toggle('oculto', tp !== 'condicion');
  fijarAvatar(tp === 'trampa' ? 'confundido' : 'curioso');
  modoRespuesta(true);
  pintarDoc($('d-doc'), { senalado: p.fragmento });
  progreso();
  decir(p.apertura, true);
  // Desplaza solo el panel del documento (no la página) hasta lo que señala Carlos.
  const f = $(p.fragmento), caja = document.querySelector('.defensa .doc');
  if (f && caja.scrollHeight > caja.clientHeight) caja.scrollTo({ top: f.offsetTop - caja.clientHeight / 3, behavior: 'smooth' });
}
function modoRespuesta(on) {
  ['b-mic', 'b-enviar', 'b-nose', 'b-sim', 'b-cambiar', 'b-borrar', 'resp'].forEach((id) => { $(id).disabled = !on; });
  if (on) $('d-controles').classList.remove('oculto');
  $('b-sig').classList.toggle('oculto', on);
}

const corta = (t) => (t.length > 150 ? t.slice(0, 150).replace(/\s+\S*$/, '') + '…' : t);
function simulado(p, texto, leyo, dubitativo) {
  const r = simuladoBase(p, texto, leyo, dubitativo);
  r.evidencia = corta(r.evidencia);
  return r;
}
function simuladoBase(p, texto, leyo, dubitativo) {
  const s = p.simulado;
  if (!texto.trim() || texto === 'No sé.') return { nivel: 'rojo', estado_carlos: 'ironico', motivo: 'No dio una explicación para este punto.', evidencia: texto || '(sin respuesta)', repreguntar: false, carlos_dice: 'Asu, si tú que hiciste el informe no sabes, mañana en la sustentación nos comen vivos. Sigamos.' };
  if (leyo) return { nivel: 'amarillo', estado_carlos: 'ironico', motivo: 'Leyó su trabajo casi palabra por palabra, sin explicarlo.', evidencia: texto.slice(0, 120), repreguntar: false, carlos_dice: 'Ya, bacán, me leíste el párrafo igualito… pero yo quería que me lo traduzcas en cristiano. Sigamos.' };
  if (s && texto.trim() === s.respuesta) {
    const reac = {
      verde: 'Manya, ahora sí tiene todo el sentido. Me dejaste sin argumentos, buena.',
      amarillo: dubitativo ? '¿"Creo"? Con ese "creo" el profe nos baja puntos ah… más o menos te capto, sigamos.' : 'Mmm, más o menos te capto la idea, aunque me queda una duda… sigamos.',
      rojo: '¿Ves? Entonces sí era como yo decía… aunque suena medio peligroso dejarlo así.',
    };
    const est = { verde: 'convencido', amarillo: 'confundido', rojo: 'ironico' };
    return { nivel: s.nivel, estado_carlos: est[s.nivel], motivo: s.motivo, evidencia: s.respuesta.slice(0, 120), repreguntar: false, carlos_dice: reac[s.nivel] };
  }
  return {
    nivel: 'amarillo',
    estado_carlos: dubitativo ? 'ironico' : 'confundido',
    motivo: 'Modo simulado: respuesta libre sin evaluación de IA.',
    evidencia: texto.slice(0, 120),
    repreguntar: false,
    carlos_dice: dubitativo ? 'Te noto dudando con ese "creo"… igual capto por dónde vas. Sigamos.' : 'Ya, creo que te capto la idea general. Sigamos con el otro punto.',
  };
}

async function responder(texto, via) {
  detenerTemporizadorRespuesta(false);
  texto = (texto || '').trim();
  detenerMic();
  const p = punto();
  let leyo = leyoTrabajo(texto, frag(p.fragmento).texto);
  let dubitativo = esDubitativo(texto);
  S.hist.push({ rol: 'estudiante', texto: texto || '(silencio)' });
  modoRespuesta(false); $('b-sig').classList.add('oculto');
  fijarAvatar('pensando');
  $('d-dice').classList.add('pensando'); $('d-dice').textContent = 'Carlos está pensando…';

  // El servidor evalúa siempre, incluso sin IA (modo simulado). En una entrega, además registra el
  // resultado: el reporte del profesor sale de ese registro. Solo si no hay conexión se evalúa aquí.
  let r;
  try {
    const res = await fetch('api/carlos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ casoId: S.casoId, puntoId: p.id, historial: S.hist, yaRepregunto: S.repregunto, intento: S.intento, llave: S.llave, codigo: S.tarea.codigo, via: via || (S.respuesta === 'voz' ? 'voz' : 'texto') }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.error || 'Carlos no respondió'), { status: res.status });
    r = d;
    S.respondio = true; // el servidor ya registró algo de esta entrega
    leyo = !!r.leyo; dubitativo = !!r.dubitativo;
    if (r.iaCaida && !S.forzarSim) {
      S.senales.iaCaida = true; S.forzarSim = true;
      $('b-sim').classList.remove('oculto');
      $('d-aviso').textContent = 'La IA no respondió; seguimos en modo simulado.';
    }
  } catch (e) {
    // Un 4xx es una respuesta del servidor (sin acceso, intento vencido, demasiadas peticiones):
    // se muestra y se deja reintentar, sin evaluar por nuestra cuenta.
    if (e.status && e.status < 500) {
      S.hist.pop();
      $('d-aviso').textContent = e.message;
      modoRespuesta(true);
      decir(S.hist[S.hist.length - 1].texto);
      return;
    }
    $('d-aviso').textContent = S.modo === 'evaluacion'
      ? 'Sin conexión con el servidor: este punto no quedará registrado en tu entrega.'
      : (e.message || 'Carlos no respondió; seguimos en modo simulado.');
    r = simulado(p, texto, leyo, dubitativo);
  }
  if (leyo) S.senales.leyo++;
  if (dubitativo) S.senales.dubitativo++;

  const estadoSugerido = r.estado_carlos || (r.repreguntar ? (dubitativo || leyo ? 'ironico' : 'confundido') : r.nivel === 'verde' ? 'convencido' : r.nivel === 'rojo' ? 'ironico' : 'confundido');
  fijarAvatar(estadoSugerido);

  if (r.repreguntar && !S.repregunto) {
    S.repregunto = true;
    S.hist.push({ rol: 'carlos', texto: r.carlos_dice });
    $('resp').value = '';
    actualizarBorrar();
    actualizarTermometro(r.nivel, true);
    modoRespuesta(true);
    decir(r.carlos_dice, true);
    return;
  }
  S.resultados[p.id] = { tema: p.tema, tipo: tipoPunto(p), nivel: r.nivel, motivo: r.motivo, evidencia: r.evidencia, leyo, dubitativo, conversacion: S.hist.slice() };
  actualizarTermometro(r.nivel, false);
  pintarDoc($('d-doc'), {});
  progreso();
  detenerTemporizadorRespuesta(false);
  decir(r.carlos_dice, false);
  $('d-controles').classList.add('oculto');
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
  $('r-modo').textContent = S.tipo === 'practica' ? 'práctica · tu profesor recibe este intento' : 'evaluación · reporte para el profesor';
  const verdes = ps.filter((p) => S.resultados[p.id].nivel === 'verde').length;
  $('r-titulo').textContent = `Le explicaste bien ${verdes} de ${ps.length} puntos a Carlos.`;
  $('r-nota').textContent = S.tipo === 'evaluacion' ? 'La nota final la decide tu profesor. Este nivel es solo una sugerencia.' : 'Haz clic en una parte marcada del trabajo para ver qué dijiste. Puedes rendir la práctica otra vez.';
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
  if (S.senales.dubitativo) sen.push(`${S.senales.dubitativo} respuesta(s) con lenguaje dubitativo ("creo que", "tal vez").`);
  if (S.senales.tiempoAgotado) sen.push(`${S.senales.tiempoAgotado} pregunta(s) superaron los 30 s para empezar a responder.`);
  if (S.senales.pantallaOculta) sen.push(`Salió de la pestaña ${S.senales.pantallaOculta} vez/veces.`);
  if (S.senales.pegadoBloqueado) sen.push(`Intentó pegar texto ${S.senales.pegadoBloqueado} vez/veces.`);
  if (S.senales.captura) sen.push(`Intentó capturar o imprimir la pantalla ${S.senales.captura} vez/veces.`);
  if (S.senales.iaCaida) sen.push('La IA falló durante la sesión; parte se evaluó en modo simulado.');
  $('r-senales').innerHTML = '<h2>Señales de la sesión</h2>';
  const ps2 = document.createElement('p'); ps2.className = 'suave';
  ps2.textContent = sen.length ? sen.join(' ') + ' Son alertas para revisar, no acusaciones.' : 'Sin señales que revisar.';
  $('r-senales').appendChild(ps2);

  const pend = ps.filter((p) => S.resultados[p.id].nivel !== 'verde');
  const esTrabajoPropio = S.tarea && S.tarea.casoId === 'estudiante';
  const esComun = !esTrabajoPropio;
  const sig = $('r-siguiente');
  sig.innerHTML = '';
  const h = document.createElement('h2'); const t = document.createElement('p'); const b = document.createElement('button');
  b.className = 'btn amarillo'; b.type = 'button'; b.style.marginTop = '12px';
  if (S.tipo === 'practica' || S.modo === 'practica') {
    if (pend.length === 0) {
      h.textContent = '¡Práctica superada: explicaste todos los puntos!';
      t.textContent = esTrabajoPropio
        ? 'Explicaste todos los puntos de tu trabajo con argumentos sólidos y convenciste a Carlos. Puedes rendir la práctica otra vez o consultar con tu profesor.'
        : 'Explicaste todos los puntos del documento común con claridad y convenciste a Carlos. Puedes rendir la práctica otra vez.';
      b.textContent = 'Rendir otra vez';
      b.onclick = () => mostrar('inicio');
      const bRe = document.createElement('button');
      bRe.className = 'btn claro';
      bRe.type = 'button';
      bRe.textContent = 'Repetir ahora';
      bRe.onclick = () => { empezar(); };
      const fBotones = document.createElement('div');
      fBotones.className = 'fila';
      fBotones.style.marginTop = '14px';
      fBotones.append(b, bRe);
      sig.append(h, t, fBotones);
    } else {
      h.textContent = `Aspectos a repasar (${pend.length} de ${ps.length} pendientes)`;
      t.textContent = esTrabajoPropio
        ? 'Carlos encontró dudas en tus explicaciones sobre tu trabajo. Revisa estos puntos en tu informe antes de volver a rendir:'
        : 'Carlos encontró dudas en tu comprensión del texto común. Revisa estos puntos en el documento antes de volver a rendir:';

      const guia = document.createElement('div');
      guia.className = 'guia-repaso';

      pend.forEach((p) => {
        const res = S.resultados[p.id];
        const item = document.createElement('div');
        item.className = 'guia-item ' + (res.nivel === 'rojo' ? 'rojo' : 'amarillo');

        const tit = document.createElement('div');
        tit.className = 'guia-item-tit';
        const tagNivel = res.nivel === 'rojo' ? 'No superado' : 'A reforzar';
        tit.innerHTML = `<span>${p.tema}</span><span class="chip ${res.nivel}">${tagNivel}</span>`;

        const duda = document.createElement('div');
        duda.className = 'guia-item-txt';
        duda.innerHTML = `<b>Lo que preguntó Carlos:</b> ${corta(p.apertura, 130)}`;

        const motivo = document.createElement('div');
        motivo.className = 'guia-item-txt';
        motivo.innerHTML = `<b>Por qué no convenció:</b> ${res.motivo || 'Faltó mayor profundidad o claridad técnica.'}`;

        const tip = document.createElement('div');
        tip.className = 'guia-item-tip';
        let consejo = '';
        if (p.tipo === 'trampa') {
          consejo = 'Carlos intentó confundirte con una premisa errónea. No aceptes el error por cortesía: identifica la falla y corrígela con argumentos firmes.';
        } else if (p.tipo === 'condicion') {
          consejo = 'Carlos te cambió las condiciones o requisitos. Explica paso a paso cómo se adapta la propuesta sin romper lo que diseñaste antes.';
        } else {
          consejo = 'Fundamenta el porqué: explica las ventajas técnicas de esta decisión y por qué es superior a otras alternativas.';
        }
        if (esTrabajoPropio) {
          consejo += ' Revisa en tu informe la sección resaltada y ten claras tus decisiones de diseño.';
        } else {
          consejo += ' Revisa el párrafo del documento del profesor para respaldar tu respuesta con las ideas del autor.';
        }
        if (res.leyo) {
          consejo += ' Traduce la idea a tus propias palabras en vez de leer el texto.';
        }
        if (res.dubitativo) {
          consejo += ' Responde con seguridad; evita muletillas como "creo que" o "tal vez".';
        }
        tip.textContent = '💡 Recomendación: ' + consejo;

        item.append(tit, duda, motivo, tip);
        guia.appendChild(item);
      });

      const alertas = [];
      if (S.senales.leyo) alertas.push(`📖 Se detectó lectura casi literal en ${S.senales.leyo} punto(s). En la entrega, explica con tus propias palabras.`);
      if (S.senales.dubitativo) alertas.push(`🤔 Usaste lenguaje dubitativo en ${S.senales.dubitativo} respuesta(s). Argumenta con mayor convicción.`);
      if (S.senales.tiempoAgotado) alertas.push(`⏱️ En ${S.senales.tiempoAgotado} pregunta(s) se agotaron los 30 s para empezar a responder. Arranca con tu idea de inmediato.`);

      let cAlertas = null;
      if (alertas.length) {
        cAlertas = document.createElement('div');
        cAlertas.className = 'guia-alertas';
        alertas.forEach((al) => {
          const pa = document.createElement('div');
          pa.textContent = al;
          cAlertas.appendChild(pa);
        });
      }

      b.textContent = 'Rendir otra vez';
      b.onclick = () => mostrar('inicio');

      const bRepetir = document.createElement('button');
      bRepetir.className = 'btn claro';
      bRepetir.type = 'button';
      bRepetir.textContent = 'Repetir de inmediato';
      bRepetir.onclick = () => { empezar(); };

      const fBotones = document.createElement('div');
      fBotones.className = 'fila';
      fBotones.style.marginTop = '14px';
      fBotones.append(b, bRepetir);

      sig.append(h, t);
      if (cAlertas) sig.append(cAlertas);
      sig.append(guia, fBotones);
    }
  } else {
    h.textContent = 'Reporte para el profesor';
    t.id = 'r-estado-envio';
    t.textContent = 'Enviando tu reporte y trabajo marcado al profesor…';
    b.textContent = 'Volver al inicio';
    b.onclick = () => mostrar('rol');
    sig.append(h, t, b);
  }
  if (S.modo === 'evaluacion' && window.registrarSesionEvaluacion) window.registrarSesionEvaluacion(seg);
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
// Enviar vacío contaría como rojo: el estudiante debe decir algo o pulsar "No sé".
function enviarRespuesta() {
  if (!$('resp').value.trim()) { $('d-aviso').textContent = 'Primero explícale algo a Carlos, o pulsa "No sé".'; return; }
  responder($('resp').value);
}
$('b-enviar').onclick = enviarRespuesta;
$('b-borrar').onclick = borrarDictado;
$('resp').addEventListener('input', () => { actualizarBorrar(); if ($('resp').value.trim()) marcarInicioRespuesta(); });
$('b-cambiar').onclick = () => {
  detenerMic();
  S.respuesta = S.respuesta === 'voz' ? 'texto' : 'voz';
  aplicarModoRespuesta();
  if (S.respuesta === 'texto') $('resp').focus();
};
// Solo hay un intento: salir de una entrega con respuestas la entrega con lo que se respondió.
// Cuenta también un punto en repregunta (S.respondio) y el reporte final mientras no se confirme su envío.
const enDefensaOReporte = () => $('defensa').classList.contains('on') || $('reporte').classList.contains('on');
const entregaEnCurso = () => S.modo === 'evaluacion' && S.intento && S.respondio && !S.entregaConfirmada && enDefensaOReporte();
$('b-salir').onclick = async () => {
  detenerTemporizadorRespuesta(false);
  const aviso = !S.respondio ? '¿Salir? Aún no respondiste nada, así que podrás empezar de nuevo.'
    : S.tipo === 'practica' ? '¿Salir de la práctica? Lo que llevas respondido le llega a tu profesor como un intento, y podrás rendirla otra vez.'
      : '¿Salir de la evaluación? Solo tienes un intento: tu profesor recibirá lo que llevas respondido y no podrás volver a empezar.';
  if (!window.confirm(aviso)) return;
  detenerMic();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (entregaEnCurso()) {
    try {
      S.entregaConfirmada = true;
      await fetch('api/sesiones', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modo: 'evaluacion', intento: S.intento, abandonada: true, senales: { pantallaOculta: S.senales.pantallaOculta, pegadoBloqueado: S.senales.pegadoBloqueado, captura: S.senales.captura } }),
      });
    } catch { /* si no se pudo enviar, el servidor la cierra sola al rato o al volver a empezar */ }
  }
  mostrar('inicio');
};
// Cerrar la pestaña a mitad de una entrega también gasta el intento: se avisa antes.
window.addEventListener('beforeunload', (e) => { if (entregaEnCurso()) { e.preventDefault(); e.returnValue = ''; } });
if (!SR) {
  document.querySelector('input[name=respuesta][value=voz]').disabled = true;
  document.querySelector('input[name=respuesta][value=texto]').checked = true;
  $('op-voz').classList.add('deshabilitada');
  $('op-voz-txt').textContent = 'Este navegador no permite dictado. Para hablar, abre la página en Chrome o Edge.';
}
$('b-nose').onclick = () => { detenerTemporizadorRespuesta(false); responder('No sé.', 'boton'); };
$('b-sim').onclick = () => { $('resp').value = punto()?.simulado?.respuesta || `Explicación con mis propias palabras sobre ${punto()?.tema || 'este punto'} justificando la decisión del diseño.`; actualizarBorrar(); };
$('b-sig').onclick = siguiente;
$('resp').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarRespuesta(); });
$('resp').addEventListener('paste', (e) => {
  if (S.modo === 'evaluacion') { e.preventDefault(); S.senales.pegadoBloqueado++; $('d-aviso').textContent = 'No se puede pegar texto: explícalo con tus palabras.'; }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && $('defensa').classList.contains('on')) S.senales.pantallaOculta++;
});
/* ---------- protección contra capturas (disuasión: el navegador no puede impedirlas del todo) ---------- */
const enDefensa = () => $('defensa').classList.contains('on');
function intentoCaptura() {
  S.senales.captura++;
  document.body.classList.add('velado');
  setTimeout(() => { if (document.hasFocus()) document.body.classList.remove('velado'); }, 1500);
  $('d-aviso').textContent = 'Durante la defensa no se permiten capturas. Queda registrado en las señales.';
}
document.addEventListener('keydown', (e) => {
  if (!enDefensa()) return;
  const k = e.key.toLowerCase();
  const recorte = (e.metaKey || e.ctrlKey) && e.shiftKey && ['s', '3', '4', '5'].includes(k);
  const imprimir = (e.metaKey || e.ctrlKey) && (k === 'p' || k === 's');
  if (recorte || imprimir || k === 'printscreen') { e.preventDefault(); intentoCaptura(); }
});
// PrintScreen solo llega al soltar la tecla en varios navegadores; se intenta vaciar el portapapeles.
document.addEventListener('keyup', (e) => {
  if (!enDefensa() || e.key !== 'PrintScreen') return;
  intentoCaptura();
  if (navigator.clipboard) navigator.clipboard.writeText('').catch(() => {});
});
window.addEventListener('beforeprint', () => { if (enDefensa()) S.senales.captura++; });
// Las herramientas de recorte quitan el foco a la ventana: se vela el contenido mientras tanto.
window.addEventListener('blur', () => { if (enDefensa()) document.body.classList.add('velado'); });
window.addEventListener('focus', () => { document.body.classList.remove('velado'); });
['copy', 'cut', 'contextmenu', 'dragstart'].forEach((ev) => {
  document.addEventListener(ev, (e) => { if (enDefensa() && e.target.id !== 'resp') e.preventDefault(); });
});

setInterval(() => {
  if (!$('defensa').classList.contains('on')) return;
  const s = Math.floor((Date.now() - S.t0) / 1000);
  $('reloj').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}, 1000);
iniciar();
