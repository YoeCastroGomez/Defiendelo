/* Defiéndelo — subida de trabajos. El texto del .pdf o .docx se extrae aquí, en el navegador:
   el archivo original nunca se envía al servidor, solo el texto como JSON a /api/documentos. */
'use strict';
(() => {
  const MAX_BYTES = 10 * 1024 * 1024;
  const MIN_PALABRAS = 50;
  const MAX_PALABRAS = 15000;
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
    const pdf = await window.pdfjsLib.getDocument({ data: await archivo.arrayBuffer() }).promise;
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

  function validarPalabras(texto) {
    const n = contarPalabras(texto);
    if (n < MIN_PALABRAS) return `Solo se leyeron ${n} palabras (mínimo ${MIN_PALABRAS}). Si es un PDF escaneado, sube un PDF con texto seleccionable o un archivo .docx.`;
    if (n > MAX_PALABRAS) return `El trabajo tiene ${n} palabras y el máximo es 15 000. Sube solo la sección que vas a defender.`;
    return '';
  }

  // Dibuja la zona de subida. `procesar(texto, titulo, avisar)` hace lo que corresponda con el texto validado.
  function crearCaja(contenedor, { etiqueta, procesar }) {
    contenedor.replaceChildren();
    const raiz = document.createElement('div');
    raiz.className = 'pila-c';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
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
    contador.textContent = '0 / 15 000 palabras';
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

    async function ejecutar(obtenerTexto, titulo) {
      error.textContent = '';
      ocupado(true);
      try {
        const texto = await obtenerTexto();
        const mal = validarPalabras(texto);
        if (mal) throw new Error(mal);
        await procesar(texto, titulo, (m) => { estado.textContent = m; });
      } catch (e) {
        estado.textContent = '';
        error.textContent = e.message;
      } finally {
        ocupado(false);
        input.value = '';
      }
    }

    function elegir(archivo) {
      if (!archivo) return;
      error.textContent = '';
      const mal = errorDeArchivo(archivo);
      if (mal) { estado.textContent = ''; error.textContent = mal; input.value = ''; return; }
      ejecutar(() => {
        estado.textContent = '1/2 Leyendo archivo en tu navegador…';
        return extraerTexto(archivo);
      }, tituloDeArchivo(archivo.name));
    }

    zona.onclick = () => input.click();
    input.onchange = () => elegir(input.files[0]);
    zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('encima'); };
    zona.ondragleave = () => zona.classList.remove('encima');
    zona.ondrop = (e) => {
      e.preventDefault();
      zona.classList.remove('encima');
      if (!zona.disabled) elegir(e.dataTransfer.files[0]);
    };
    abrirPegado.onclick = () => { cajaPegado.classList.toggle('oculto'); if (!cajaPegado.classList.contains('oculto')) area.focus(); };
    area.oninput = () => { contador.textContent = `${contarPalabras(area.value).toLocaleString('es-PE')} / 15 000 palabras`; };
    usar.onclick = () => ejecutar(async () => area.value, '');

    return {
      listo(mensaje) { estado.textContent = mensaje; zona.classList.add('oculto'); abrirPegado.classList.add('oculto'); cajaPegado.classList.add('oculto'); },
    };
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

  /* ---------- estudiante: entrega su propio trabajo ---------- */
  window.addEventListener('defiendelo:inicio', (ev) => {
    const caja = $('caja-entrega-est');
    const chip = document.querySelector('#inicio .archivo .chip');
    const entrega = ev.detail.casoId === 'estudiante';
    caja.classList.toggle('oculto', !entrega);
    chip.textContent = entrega ? 'pendiente' : 'listo';
    chip.classList.toggle('ok', !entrega);
    $('b-empezar').disabled = entrega;
    if (!entrega) { caja.replaceChildren(); return; }

    const vista = crearCaja(caja, {
      etiqueta: 'Sube tu trabajo',
      async procesar(texto, titulo, avisar) {
        avisar('2/2 Carlos está revisando tu trabajo para preparar sus dudas…');
        const t = S.tarea;
        const d = await crearDocumento({ titulo: titulo || t.titulo, curso: t.curso, tarea: t.titulo, criterios: t.criterios, estudiante: $('nombre').value.trim(), texto });
        const r = await fetch('api/casos?id=' + encodeURIComponent(d.casoId));
        if (!r.ok) throw new Error('Tu trabajo se procesó, pero no se pudo cargar. Intenta de nuevo.');
        S.caso = await r.json();
        S.casoId = d.casoId;
        $('i-tarea').textContent = S.caso.documento.titulo;
        chip.textContent = 'listo';
        chip.classList.add('ok');
        $('b-empezar').disabled = false;
        vista.listo(`Listo: ${d.fragmentos} partes y ${d.puntos} dudas de Carlos.`);
      },
    });
  });

  /* ---------- profesor: elige el origen del trabajo ---------- */
  // app.js solo llena #t-caso si está vacío; por eso la opción se agrega después de que lo llene.
  const selector = $('t-caso');
  new MutationObserver(() => {
    if (selector.querySelector('option[value="estudiante"]')) return;
    const o = document.createElement('option');
    o.value = 'estudiante';
    o.textContent = 'Cada estudiante entrega su propio archivo (.pdf / .docx)';
    selector.prepend(o);
    selector.value = 'estudiante';
  }).observe(selector, { childList: true });

  const vistaBase = crearCaja($('caja-base-prof'), {
    etiqueta: 'Subir un trabajo base propio',
    async procesar(texto, titulo, avisar) {
      avisar('2/2 Preparando las dudas de Carlos…');
      const tituloBase = titulo || $('t-titulo').value;
      const d = await crearDocumento({ titulo: tituloBase, curso: $('t-curso').value, tarea: $('t-titulo').value, criterios: $('t-crit').value, texto });
      const o = document.createElement('option');
      o.value = d.casoId;
      o.textContent = 'Trabajo subido: ' + d.titulo;
      selector.appendChild(o);
      selector.value = d.casoId;
      vistaBase.listo(`Listo: toda la clase defenderá "${d.titulo}".`);
    },
  });
})();
