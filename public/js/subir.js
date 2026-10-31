/* Defiéndelo — subida de trabajos. El texto del .pdf o .docx se extrae aquí, en el navegador:
   el archivo original nunca se envía al servidor, solo el texto como JSON a /api/documentos. */
'use strict';
(() => {
  const MAX_BYTES = 10 * 1024 * 1024;
  const MIN_PALABRAS = 50;
  const MAX_PALABRAS = 15000;
  const MIN_PALABRAS_ENUNCIADO = 5;
  const MAX_PALABRAS_ENUNCIADO = 5000;
  const MAX_PALABRAS_TEORIA = 15000;
  const MAX_ARCHIVOS_MATERIAL = 5;
  const CDN_PDF = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const CDN_MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
  const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const estilos = document.createElement('style');
  estilos.textContent = `
    .drop-archivo{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;padding:18px;border:1px dashed #CFCFCA;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:center;cursor:pointer}
    .drop-archivo:hover,.drop-archivo.encima{background:var(--linea2)}
    .drop-archivo:disabled{opacity:.5;cursor:default}
    .enlace-texto{align-self:flex-start;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}
  `;
  document.head.appendChild(estilos);

  const contarPalabras = (t) => (String(t || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const tituloDeArchivo = (nombre) => nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);

  const scripts = new Map();
  function cargarScript(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = () => { scripts.delete(src); mal(new Error('No se pudo cargar el lector de archivos. Revisa tu conexión o pega el texto.')); };
        document.head.appendChild(s);
      }));
    }
    return scripts.get(src);
  }

  function errorDeArchivo(archivo) {
    if (!/\.(pdf|docx)$/i.test(archivo.name)) return 'Formato no compatible. Sube un archivo .pdf o .docx (Word), o usa la opción de pegar texto.';
    if (archivo.size > MAX_BYTES) return `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y supera el límite máximo permitido de 10 MB.`;
    return '';
  }

  // Une los textos de una página respetando sus líneas; un salto vertical grande separa párrafos.
  function textoDePagina(items) {
    let salida = '';
    let yAnterior = null;
    let altoLinea = 0;
    for (const it of items) {
      const y = it.transform[5];
      if (yAnterior !== null && Math.abs(y - yAnterior) > 1) {
        const salto = Math.abs(y - yAnterior);
        altoLinea = altoLinea ? Math.min(altoLinea, salto) : salto;
        salida += salto > altoLinea * 1.5 ? '\n\n' : '\n';
      }
      salida += it.str;
      yAnterior = y;
    }
    return salida;
  }

  async function extraerPDF(archivo) {
    await cargarScript(CDN_PDF + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_PDF + 'pdf.worker.min.js';
    // isEvalSupported: false es la mitigación oficial de CVE-2024-4367 (ejecución de código con fuentes
    // de un PDF malicioso) para esta versión de PDF.js. Aquí solo se extrae texto, pero no cuesta nada.
    const pdf = await window.pdfjsLib.getDocument({ data: await archivo.arrayBuffer(), isEvalSupported: false }).promise;
    const paginas = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const contenido = await (await pdf.getPage(n)).getTextContent();
      paginas.push(textoDePagina(contenido.items));
    }
    return paginas.join('\n\n');
  }

  async function extraerDOCX(archivo) {
    await cargarScript(CDN_MAMMOTH);
    const res = await window.mammoth.extractRawText({ arrayBuffer: await archivo.arrayBuffer() });
    return res.value;
  }

  async function extraerTexto(archivo) {
    try {
      return /\.pdf$/i.test(archivo.name) ? await extraerPDF(archivo) : await extraerDOCX(archivo);
    } catch (e) {
      if (/lector de archivos/.test(e.message)) throw e;
      throw new Error('No se pudo leer el archivo. Puede estar dañado o protegido con contraseña: prueba con otro o pega el texto.');
    }
  }

  // El consejo del PDF escaneado solo tiene sentido si el texto salió de un archivo, no si se pegó.
  function validarPalabras(texto, minimo, maximo, deArchivo) {
    const n = contarPalabras(texto);
    if (n < minimo) {
      return deArchivo
        ? `Solo se leyeron ${n} palabras (mínimo ${minimo}). Si es un PDF escaneado, sube un PDF con texto seleccionable o un archivo .docx.`
        : `El texto tiene ${n} palabras y el mínimo es ${minimo}. Pega tu trabajo completo.`;
    }
    if (n > maximo) return `El documento tiene ${n} palabras y el máximo es ${maximo.toLocaleString('es-PE')}. Sube solo la parte necesaria.`;
    return '';
  }

  // Dibuja la zona de subida. `procesar(texto, titulo, avisar)` hace lo que corresponda con el texto validado.
  function crearCaja(contenedor, { etiqueta, procesar, minimo = MIN_PALABRAS, maximo = MAX_PALABRAS, varios = false }) {
    contenedor.replaceChildren();
    const raiz = document.createElement('div');
    raiz.className = 'pila-c';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = varios;
    input.className = 'oculto';

    const zona = document.createElement('button');
    zona.type = 'button';
    zona.className = 'drop-archivo';
    const zonaTitulo = document.createElement('b');
    zonaTitulo.textContent = etiqueta;
    const zonaDetalle = document.createElement('span');
    zonaDetalle.className = 'chico suave';
    zonaDetalle.textContent = 'Haz clic o arrastra tu .pdf o .docx (máximo 10 MB)';
    zona.append(zonaTitulo, zonaDetalle);

    const abrirPegado = document.createElement('button');
    abrirPegado.type = 'button';
    abrirPegado.className = 'enlace-texto';
    abrirPegado.textContent = '¿Problemas con tu archivo? Pegar texto manualmente';

    const cajaPegado = document.createElement('div');
    cajaPegado.className = 'pila-c oculto';
    const area = document.createElement('textarea');
    area.className = 'claro';
    area.rows = 6;
    area.setAttribute('aria-label', 'Texto del trabajo');
    const pie = document.createElement('div');
    pie.className = 'fila entre';
    const contador = document.createElement('span');
    contador.className = 'mono chico suave';
    contador.textContent = `0 / ${maximo.toLocaleString('es-PE')} palabras`;
    const usar = document.createElement('button');
    usar.type = 'button';
    usar.className = 'btn claro';
    usar.textContent = 'Usar este texto';
    pie.append(contador, usar);
    cajaPegado.append(area, pie);

    const estado = document.createElement('p');
    estado.className = 'mono chico suave';
    estado.setAttribute('aria-live', 'polite');
    const error = document.createElement('p');
    error.className = 'error';
    error.setAttribute('role', 'alert');

    raiz.append(input, zona, abrirPegado, cajaPegado, estado, error);
    contenedor.appendChild(raiz);

    const ocupado = (si) => { [zona, abrirPegado, usar, area].forEach((b) => { b.disabled = si; }); };

    async function ejecutar(obtenerTexto, titulo, archivo) {
      error.textContent = '';
      ocupado(true);
      try {
        const texto = await obtenerTexto();
        const mal = validarPalabras(texto, minimo, maximo, !!archivo);
        if (mal) throw new Error(mal);
        await procesar(texto, titulo, (m) => { estado.textContent = m; }, archivo);
        return true;
      } catch (e) {
        estado.textContent = '';
        error.textContent = e.message;
        return false;
      } finally {
        ocupado(false);
        input.value = '';
      }
    }

    function elegir(archivo) {
      if (!archivo) return false;
      error.textContent = '';
      const mal = errorDeArchivo(archivo);
      if (mal) { estado.textContent = ''; error.textContent = mal; input.value = ''; return false; }
      return ejecutar(() => {
        estado.textContent = '1/2 Leyendo archivo en tu navegador…';
        return extraerTexto(archivo);
      }, tituloDeArchivo(archivo.name), archivo);
    }

    // Se procesan en orden y se para en el primer error, para que su mensaje quede a la vista.
    async function elegirVarios(archivos) {
      for (const archivo of varios ? [...archivos] : [...archivos].slice(0, 1)) {
        if (!(await elegir(archivo))) return;
      }
    }

    zona.onclick = () => input.click();
    input.onchange = () => elegirVarios(input.files);
    zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('encima'); };
    zona.ondragleave = () => zona.classList.remove('encima');
    zona.ondrop = (e) => {
      e.preventDefault();
      zona.classList.remove('encima');
      if (!zona.disabled) elegirVarios(e.dataTransfer.files);
    };
    abrirPegado.onclick = () => { cajaPegado.classList.toggle('oculto'); if (!cajaPegado.classList.contains('oculto')) area.focus(); };
    area.oninput = () => { contador.textContent = `${contarPalabras(area.value).toLocaleString('es-PE')} / ${maximo.toLocaleString('es-PE')} palabras`; };
    usar.onclick = () => ejecutar(async () => area.value, '');

    return {
      listo(mensaje) { estado.textContent = mensaje; zona.classList.add('oculto'); abrirPegado.classList.add('oculto'); cajaPegado.classList.add('oculto'); },
    };
  }

  // Guardar el original es un extra: si falla, la defensa sigue con el texto ya extraído.
  async function guardarOriginal(archivo, tipo, codigo) {
    if (!archivo) return null;
    try {
      const r = await fetch('api/archivos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo, nombre: archivo.name, tamano: archivo.size, codigo }),
      });
      if (!r.ok) throw new Error('sin enlace de subida');
      const d = await r.json();
      const pdf = /\.pdf$/i.test(archivo.name);
      const subida = await fetch(d.subirUrl, {
        method: 'PUT',
        headers: { 'content-type': pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        body: archivo,
      });
      if (!subida.ok) throw new Error('subida rechazada');
      return { ruta: d.ruta, nombre: archivo.name };
    } catch (e) {
      console.warn('[subir] no se guardó el original:', e.message);
      return null;
    }
  }

  async function crearDocumento(datos) {
    const r = await fetch('api/documentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se pudo procesar el trabajo. Intenta de nuevo.');
    return d;
  }

  function botonesDescarga(contenedor, tarea, nombres, tipo) {
    contenedor.replaceChildren(...(nombres || []).map((nombre, indice) => {
      const bajar = document.createElement('button');
      bajar.type = 'button';
      bajar.className = 'enlace-texto';
      bajar.textContent = 'Descargar ' + nombre;
      bajar.onclick = async () => {
        bajar.disabled = true;
        try {
          const q = new URLSearchParams({ codigo: tarea.codigo, indice, tipo });
          const r = await fetch('api/archivos?' + q);
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          location.href = d.url;
        } catch {
          bajar.textContent = 'No se pudo descargar ' + nombre + '. Intenta de nuevo.';
        } finally {
          bajar.disabled = false;
        }
      };
      return bajar;
    }));
  }

  /* ---------- estudiante: entrega su propio trabajo ---------- */
  window.addEventListener('defiendelo:inicio', (ev) => {
    const caja = $('caja-entrega-est');
    const chip = document.querySelector('#inicio .archivo .chip');
    const entrega = ev.detail.casoId === 'estudiante';
    caja.classList.toggle('oculto', !entrega);
    chip.textContent = entrega ? 'pendiente' : 'listo';
    chip.classList.toggle('ok', !entrega);
    $('b-empezar').disabled = entrega;
    window.renovarCasoEntrega = null;
    botonesDescarga($('i-enunciado-archivos'), ev.detail, ev.detail.enunciadoDescargas, 'enunciado');
    botonesDescarga($('i-teoria-archivos'), ev.detail, ev.detail.teoriaDescargas, 'teoria');
    if (!entrega) { caja.replaceChildren(); return; }

    const vista = crearCaja(caja, {
      etiqueta: 'Sube tu resolución',
      async procesar(texto, titulo, avisar, archivo) {
        avisar('Guardando tu archivo…');
        const original = await guardarOriginal(archivo, 'resolucion', S.tarea.codigo);
        avisar('2/2 Carlos está revisando tu trabajo para preparar sus dudas…');
        const t = S.tarea;
        const envio = { archivo: original, codigo: t.codigo, titulo: titulo || t.titulo, curso: t.curso, tarea: t.titulo, criterios: t.criterios, estudiante: $('nombre').value.trim(), texto };
        const d = await crearDocumento(envio);
        // El trabajo es privado: solo se vuelve a abrir con la llave que devolvió el servidor.
        const r = await fetch('api/casos?id=' + encodeURIComponent(d.casoId), { headers: { 'x-llave-caso': d.llave } });
        if (!r.ok) throw new Error('Tu trabajo se procesó, pero no se pudo cargar. Intenta de nuevo.');
        S.caso = await r.json();
        S.casoId = d.casoId;
        S.llave = d.llave;
        S.casoUsado = false;
        // Quien ya ensayó no llega a la entrega con las mismas dudas: se generan otras sobre el mismo trabajo.
        window.renovarCasoEntrega = async () => {
          const nuevo = await crearDocumento({ ...envio, estudiante: S.nombre, casoAnterior: S.casoId, llaveAnterior: S.llave });
          const rc = await fetch('api/casos?id=' + encodeURIComponent(nuevo.casoId), { headers: { 'x-llave-caso': nuevo.llave } });
          if (!rc.ok) throw new Error('Carlos no pudo preparar las dudas nuevas. Intenta de nuevo.');
          S.caso = await rc.json();
          S.casoId = nuevo.casoId;
          S.llave = nuevo.llave;
        };
        $('i-tarea').textContent = S.caso.documento.titulo;
        chip.textContent = 'listo';
        chip.classList.add('ok');
        $('b-empezar').disabled = false;
        vista.listo(`Listo: ${d.fragmentos} partes y ${d.puntos} dudas de Carlos.`);
      },
    });
  });

  /* ---------- profesor: material de la tarea (guías, plantillas y teoría en una sola caja) ---------- */
  // Cada archivo lleva su tipo. Las guías y plantillas le dicen a Carlos qué se pidió; la teoría le da
  // contexto del curso. El servidor admite hasta 5 de cada grupo.
  const TIPOS_MATERIAL = { guia: 'Guía o rúbrica', plantilla: 'Plantilla', teoria: 'Teoría del curso' };
  const MAX_ARCHIVOS_CAJA = MAX_ARCHIVOS_MATERIAL * 2;
  const adivinarTipo = (nombre) => (/teor|lectura|apunte|cap[ií]tulo|clase|separata/i.test(nombre) ? 'teoria'
    : /plantilla|formato|template|modelo/i.test(nombre) ? 'plantilla' : 'guia');
  const esTeoria = (d) => d.tipo === 'teoria';

  function cajaMaterialUnica(idCaja) {
    let documentos = [];
    const lista = document.createElement('div');
    lista.className = 'pila-c';
    function pintar() {
      lista.replaceChildren(...documentos.map((d) => {
        const fila = document.createElement('div');
        fila.className = 'archivo';
        fila.style.flexWrap = 'wrap';
        const nombre = document.createElement('span');
        nombre.textContent = d.nombre;
        nombre.style.flex = '1';
        const tipo = document.createElement('select');
        tipo.setAttribute('aria-label', 'Tipo de ' + d.nombre);
        tipo.style.width = 'auto';
        for (const [valor, texto] of Object.entries(TIPOS_MATERIAL)) {
          const o = document.createElement('option');
          o.value = valor; o.textContent = texto; o.selected = d.tipo === valor;
          tipo.appendChild(o);
        }
        tipo.onchange = () => { d.tipo = tipo.value; };
        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.className = 'enlace-texto';
        quitar.textContent = 'Quitar';
        quitar.setAttribute('aria-label', 'Quitar ' + d.nombre);
        quitar.onclick = () => { documentos = documentos.filter((x) => x !== d); pintar(); };
        fila.append(nombre, tipo, quitar);
        return fila;
      }));
    }
    crearCaja($(idCaja), {
      etiqueta: 'Sube guías, plantillas o teoría',
      minimo: MIN_PALABRAS_ENUNCIADO,
      maximo: MAX_PALABRAS_ENUNCIADO + MAX_PALABRAS_TEORIA,
      varios: true,
      async procesar(texto, titulo, avisar, archivo) {
        if (documentos.length >= MAX_ARCHIVOS_CAJA) throw new Error(`Puedes subir hasta ${MAX_ARCHIVOS_CAJA} archivos.`);
        avisar('Guardando tu archivo…');
        const original = await guardarOriginal(archivo, 'enunciado');
        const nombre = titulo || `Texto pegado ${documentos.filter((d) => !d.original).length + 1}`;
        documentos.push({ texto, nombre, original, tipo: adivinarTipo(archivo?.name || nombre) });
        pintar();
        avisar('');
      },
    });
    $(idCaja).appendChild(lista);

    // Se valida al crear la tarea, porque el profesor puede cambiar el tipo de cada archivo hasta el final.
    function grupo(filtro, max, palabras, nombreGrupo) {
      const docs = documentos.filter(filtro);
      if (docs.length > max) throw new Error(`Puedes subir hasta ${max} archivos de ${nombreGrupo}.`);
      const total = docs.reduce((n, d) => n + contarPalabras(d.texto), 0);
      if (total > palabras) throw new Error(`Los archivos de ${nombreGrupo} suman ${total.toLocaleString('es-PE')} palabras y el máximo es ${palabras.toLocaleString('es-PE')}.`);
      return docs;
    }
    return () => {
      const guias = grupo((d) => !esTeoria(d), MAX_ARCHIVOS_MATERIAL, MAX_PALABRAS_ENUNCIADO, 'guías y plantillas');
      const teoria = grupo(esTeoria, MAX_ARCHIVOS_MATERIAL, MAX_PALABRAS_TEORIA, 'teoría');
      const unir = (docs) => docs.map((d) => `--- ${TIPOS_MATERIAL[d.tipo]}: ${d.nombre} ---\n${d.texto}`).join('\n\n');
      return {
        enunciado: unir(guias),
        enunciadoNombre: guias.map((d) => d.nombre).join(', ').slice(0, 120),
        enunciadoArchivos: guias.map((d) => d.original).filter(Boolean),
        teoria: unir(teoria),
        teoriaArchivos: teoria.map((d) => d.original).filter(Boolean),
      };
    };
  }

  const material = cajaMaterialUnica('caja-material');

  /* ---------- profesor: qué defienden los estudiantes ---------- */
  let base = null; // { casoId, llave, titulo } del documento común ya procesado
  const origen = () => document.querySelector('input[name=t-origen]:checked')?.value || 'estudiante';

  function actualizarOrigen() {
    const comun = origen() === 'comun';
    $('zona-propia').classList.toggle('oculto', comun);
    $('zona-comun').classList.toggle('oculto', !comun);
    // Con documento común, el código se genera recién cuando el documento está procesado.
    $('b-crear').disabled = comun && !base;
    if (comun && !$('caja-base-prof').childElementCount) montarBase();
  }
  document.querySelectorAll('input[name=t-origen]').forEach((r) => r.addEventListener('change', actualizarOrigen));

  function mostrarBase() {
    const caja = $('caja-base-prof');
    const fila = document.createElement('div');
    fila.className = 'archivo';
    const nombre = document.createElement('span');
    nombre.textContent = 'Listo: ' + base.titulo;
    const cambiar = document.createElement('button');
    cambiar.type = 'button';
    cambiar.className = 'enlace-texto';
    cambiar.textContent = 'Cambiar documento';
    cambiar.onclick = () => { base = null; caja.replaceChildren(); montarBase(); actualizarOrigen(); };
    fila.append(nombre, cambiar);
    caja.replaceChildren(fila);
  }

  const montarBase = () => crearCaja($('caja-base-prof'), {
    etiqueta: 'Sube el documento común',
    async procesar(texto, titulo, avisar, archivo) {
      avisar('Guardando tu archivo…');
      const original = await guardarOriginal(archivo, 'base');
      avisar('2/2 Preparando las dudas de Carlos…');
      const d = await crearDocumento({ archivo: original, titulo: titulo || $('t-titulo').value, curso: $('t-curso').value, tarea: $('t-titulo').value, criterios: $('t-crit').value, texto });
      base = { casoId: d.casoId, llave: d.llave, titulo: d.titulo };
      mostrarBase();
      actualizarOrigen();
    },
  });

  // Lo que app.js envía al crear la tarea. Lanza un error con un mensaje claro si algo falta.
  window.datosOrigenTarea = () => {
    if (origen() === 'comun') {
      if (!base) throw new Error('Sube el documento que defenderán tus estudiantes.');
      return { casoId: base.casoId, llaveCaso: base.llave };
    }
    return { casoId: 'estudiante', ...material() };
  };

  /* ---------- profesor: tipo de actividad y fecha límite ---------- */
  const AYUDA_FECHA = {
    evaluacion: 'Después de esta fecha nadie puede empezar a entregar. Quien ya había empezado puede terminar, y su entrega queda marcada como fuera de plazo para que decidas.',
    practica: 'Es una fecha de referencia: se puede entregar después, pero la entrega queda marcada como fuera de plazo.',
  };
  const tipoActividad = () => document.querySelector('input[name=t-tipo]:checked')?.value || '';
  // datetime-local trabaja en la hora local del navegador, sin zona: se arma el texto a mano.
  const aLocal = (fecha) => {
    const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  };
  function fijarMinimo() { $('t-fecha').min = aLocal(new Date()); }
  document.querySelectorAll('input[name=t-tipo]').forEach((r) => r.addEventListener('change', () => {
    $('t-fecha-ayuda').textContent = AYUDA_FECHA[tipoActividad()] || '';
  }));
  document.querySelectorAll('[data-plazo]').forEach((b) => {
    b.onclick = () => {
      const f = new Date();
      if (b.dataset.plazo === 'semana') f.setDate(f.getDate() + 7);
      f.setHours(23, 59, 0, 0);
      $('t-fecha').value = aLocal(f);
    };
  });
  $('t-fecha').addEventListener('focus', fijarMinimo);
  fijarMinimo();

  window.datosPlazoTarea = () => {
    const tipo = tipoActividad();
    if (!tipo) throw new Error('Elige si es una evaluación calificada o una práctica.');
    const valor = $('t-fecha').value;
    if (!valor) throw new Error('Elige la fecha límite.');
    const fecha = new Date(valor); // se interpreta en la hora local del profesor
    if (!(fecha.getTime() > Date.now())) throw new Error('La fecha límite ya pasó: elige una fecha futura.');
    return { tipoActividad: tipo, fechaLimite: fecha.toISOString() };
  };
})();
