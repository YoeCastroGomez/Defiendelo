/* Defiéndelo — Panel del Profesor y envío de sesiones de evaluación.
 * Diseño limpio, visual y sin ruido: 3 KPIs ejecutivos, filas escaneables con matriz de 4 puntos
 * y visor en 2 columnas con diálogos colapsados en <details>. Sin dependencias.
 */
'use strict';
(function () {
  const CLAVE_STORAGE = 'defiendelo_llaves_profe';
  const casosCache = new Map();
  let estadoPanel = { tarea: null, sesiones: [], seleccionadaId: null };
  let sesionEnviadaT0 = 0;
  let envioEnCurso = false;

  function leerLlavesGuardadas() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_STORAGE) || '{}') || {};
    } catch {
      return {};
    }
  }

  function guardarLlaveLocal(codigo, token) {
    if (!codigo || !token) return;
    try {
      const mapa = leerLlavesGuardadas();
      mapa[codigo] = token;
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(mapa));
    } catch { /* modo incógnito estricto */ }
  }

  function normalizarCodigoPanel(raw) {
    const limpio = String(raw || '').toUpperCase().replace(/[\s_]/g, '');
    if (limpio === 'DEMO01') return 'DEMO-01';
    return typeof normCodigo === 'function' ? normCodigo(limpio) : limpio;
  }

  function contarAlertas(senales) {
    if (!senales || typeof senales !== 'object') return 0;
    return (Number(senales.leyo) || 0)
      + (Number(senales.dubitativo) || 0)
      + (Number(senales.pantallaOculta) || 0)
      + (Number(senales.pegadoBloqueado) || 0)
      + (Number(senales.captura) || 0)
      + (senales.iaCaida ? 1 : 0)
      + (Number(senales.sinRegistro) || 0);
  }

  function formatearDuracion(seg) {
    const s = Math.max(0, Math.round(Number(seg) || 0));
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  }

  const ETIQUETA_NIVEL = {
    verde: 'Nivel alto',
    amarillo: 'Nivel medio',
    rojo: 'Nivel bajo',
  };

  const ETIQUETA_PUNTO = {
    verde: 'explicado',
    amarillo: 'a medias',
    rojo: 'no explicado',
  };

  const ETIQUETA_TIPO = {
    decision: 'decisión',
    trampa: 'trampa',
    condicion: 'condición',
  };

  /* ---------- 1. Hook al crear una tarea (#profe -> #creada) ---------- */
  window.mostrarTokenCreado = function (datos) {
    const caja = $('c-token-caja');
    const txt = $('c-token');
    const btnCopiar = $('b-copiar-token');
    const btnPanel = $('b-ver-reportes-creada');
    if (!caja || !txt) return;
    if (datos && datos.tokenProfesor) {
      txt.textContent = datos.tokenProfesor;
      caja.classList.remove('oculto');
      if (btnCopiar) btnCopiar.classList.remove('oculto');
      if (btnPanel) btnPanel.classList.remove('oculto');
      guardarLlaveLocal(datos.codigo, datos.tokenProfesor);
    } else {
      txt.textContent = '';
      caja.classList.add('oculto');
      if (btnCopiar) btnCopiar.classList.add('oculto');
      if (btnPanel) btnPanel.classList.add('oculto');
    }
  };

  /* ---------- 2. Hook al finalizar defensa en modo evaluación (#reporte) ---------- */
  window.registrarSesionEvaluacion = async function (duracionSegundos) {
    if (!S || S.modo !== 'evaluacion' || !S.tarea) return;
    if (envioEnCurso || (S.t0 && sesionEnviadaT0 === S.t0)) return;
    envioEnCurso = true;

    const nodoEstado = $('r-estado-envio');
    const contenedorSig = $('r-siguiente');
    const previoReintento = $('b-reintentar-envio');
    if (previoReintento) previoReintento.remove();
    if (nodoEstado) nodoEstado.textContent = 'Enviando tu reporte y trabajo marcado al profesor…';

    try {
      const res = await fetch('api/sesiones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Los niveles por punto no se envían: el servidor arma el reporte con lo que registró en el intento.
        // Solo viajan las señales que únicamente el navegador puede observar.
        body: JSON.stringify({
          modo: 'evaluacion',
          intento: S.intento,
          senales: { pantallaOculta: S.senales.pantallaOculta, pegadoBloqueado: S.senales.pegadoBloqueado, captura: S.senales.captura },
        }),
      });
      const d = await res.json();
      if (res.status === 409) {
        if (nodoEstado) nodoEstado.textContent = d.error;
        return;
      }
      if (!res.ok) throw new Error(d.error || 'No se pudo registrar la sesión');

      sesionEnviadaT0 = S.t0;
      if (nodoEstado) {
        nodoEstado.textContent = `Reporte recibido por tu profesor (registro ${d.id}). Tu trabajo marcado y tus respuestas quedaron guardados.`;
      }
      if (d.nivelGeneral && $('r-nivel')) {
        const mapaChip = {
          verde: ['verde', 'Nivel alto sugerido'],
          amarillo: ['amarillo', 'Nivel medio sugerido'],
          rojo: ['rojo', 'Nivel bajo sugerido'],
        }[d.nivelGeneral];
        if (mapaChip) {
          $('r-nivel').className = 'chip grande ' + mapaChip[0];
          $('r-nivel').textContent = mapaChip[1];
        }
      }
    } catch (err) {
      if (nodoEstado) {
        nodoEstado.textContent = `No se pudo enviar automáticamente (${err.message}). Puedes reintentar sin repetir la defensa.`;
      }
      if (contenedorSig && !$('b-reintentar-envio')) {
        const btn = document.createElement('button');
        btn.id = 'b-reintentar-envio';
        btn.type = 'button';
        btn.className = 'btn claro';
        btn.style.marginTop = '8px';
        btn.style.marginRight = '8px';
        btn.textContent = 'Reintentar envío';
        btn.onclick = () => window.registrarSesionEvaluacion(duracionSegundos);
        contenedorSig.insertBefore(btn, contenedorSig.lastElementChild);
      }
    } finally {
      envioEnCurso = false;
    }
  };

  /* ---------- 3. Carga de caso para pintar el documento de cada estudiante ---------- */
  // Un trabajo subido es privado: el profesor lo abre con el código de su tarea y su token.
  async function obtenerCasoParaPanel(casoId) {
    const id = casoId && casoId !== 'estudiante' ? casoId : 'demo';
    if (casosCache.has(id)) return casosCache.get(id);
    try {
      const q = new URLSearchParams({ id, codigo: estadoPanel.tarea?.codigo || '' });
      const rApi = await fetch('api/casos?' + q, { headers: { 'x-token-profesor': ($('p-token').value || '').trim() } });
      if (rApi.ok) {
        const c = await rApi.json();
        casosCache.set(id, c);
        return c;
      }
    } catch { /* sin conexión: el detalle se muestra sin el trabajo marcado */ }
    return null;
  }

  /* ---------- 4. Renderizado limpio en 3 niveles del Panel del Profesor ---------- */
  function diagnosticarTemaDebil(sesiones) {
    const conteo = new Map();
    for (const s of sesiones) {
      for (const [pid, r] of Object.entries(s.resultados || {})) {
        if (r.nivel !== 'verde') {
          const clave = r.tema || pid.toUpperCase();
          conteo.set(clave, (conteo.get(clave) || 0) + (r.nivel === 'rojo' ? 2 : 1));
        }
      }
    }
    if (!conteo.size) return 'Todos los puntos fueron explicados';
    let peorTema = '';
    let maxPeso = -1;
    conteo.forEach((peso, tema) => {
      if (peso > maxPeso) { maxPeso = peso; peorTema = tema; }
    });
    return `Reforzar en clase: ${peorTema}`;
  }

  function entradasOrdenadas(resultados) {
    return Object.entries(resultados || {}).sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }));
  }

  function renderizarKPIs(sesiones) {
    const total = sesiones.length;
    const curso = estadoPanel.tarea?.curso || '';
    $('kpi-total').textContent = String(total);

    if (!total) {
      $('kpi-duracion').textContent = curso ? `${curso} · sin entregas aún` : 'sin sesiones registradas';
      $('kpi-resumen-txt').textContent = '0 alto';
      $('kpi-barra').innerHTML = '';
      $('kpi-desglose').textContent = '0 alto · 0 medio · 0 bajo';
      $('kpi-revision').textContent = '0';
      $('kpi-foco-tema').textContent = 'esperando primeras entregas';
      return;
    }

    const promSeg = Math.round(sesiones.reduce((a, s) => a + (Number(s.duracionSegundos) || 0), 0) / total);
    $('kpi-duracion').textContent = `${curso ? curso + ' · ' : ''}media ${formatearDuracion(promSeg)}`;

    const verdes = sesiones.filter((s) => s.nivelGeneral === 'verde').length;
    const amarillos = sesiones.filter((s) => s.nivelGeneral === 'amarillo').length;
    const rojos = sesiones.filter((s) => s.nivelGeneral === 'rojo').length;

    $('kpi-resumen-txt').textContent = `${verdes} de ${total} en nivel alto`;
    const barra = $('kpi-barra');
    barra.innerHTML = '';
    [
      ['seg-verde', verdes],
      ['seg-amarillo', amarillos],
      ['seg-rojo', rojos],
    ].forEach(([clase, n]) => {
      if (!n) return;
      const seg = document.createElement('span');
      seg.className = clase;
      seg.style.flex = String(n);
      barra.appendChild(seg);
    });
    $('kpi-desglose').textContent = `${verdes} alto · ${amarillos} medio · ${rojos} bajo`;

    const porRevisar = sesiones.filter((s) => s.nivelGeneral === 'rojo' || contarAlertas(s.senales) > 0).length;
    $('kpi-revision').textContent = String(porRevisar);
    $('kpi-foco-tema').textContent = diagnosticarTemaDebil(sesiones);
  }

  function renderizarListaEstudiantes(sesiones) {
    const lista = $('p-lista');
    lista.innerHTML = '';

    if (!sesiones.length) {
      const vacio = document.createElement('div');
      vacio.style.padding = '24px 20px';
      vacio.className = 'suave';
      vacio.textContent = 'Aún no hay entregas para este código.';
      lista.appendChild(vacio);
      $('p-detalle').classList.add('oculto');
      return;
    }

    sesiones.forEach((ses) => {
      const fila = document.createElement('button');
      fila.type = 'button';
      fila.className = 'fila-alumno' + (ses.id === estadoPanel.seleccionadaId ? ' activa' : '');
      fila.onclick = () => seleccionarSesion(ses.id);

      const colNombre = document.createElement('div');
      const bNom = document.createElement('b');
      bNom.textContent = ses.nombre;
      const sMeta = document.createElement('span');
      sMeta.className = 'mono chico suave';
      sMeta.textContent = ` · ${formatearDuracion(ses.duracionSegundos)}`;
      colNombre.append(bNom, sMeta);

      const colMatriz = document.createElement('div');
      colMatriz.className = 'matriz-puntos';
      colMatriz.setAttribute('aria-label', 'Resultado por punto');
      entradasOrdenadas(ses.resultados).forEach(([pid, r], idx) => {
        const celda = document.createElement('span');
        celda.className = 'celda-punto ' + (r.nivel || '');
        celda.title = `P${idx + 1} ${r.tema || pid}: ${ETIQUETA_PUNTO[r.nivel] || r.nivel}`;
        colMatriz.appendChild(celda);
      });

      const nAlertas = contarAlertas(ses.senales);
      const colAlertas = document.createElement('span');
      colAlertas.className = 'mono chico suave';
      colAlertas.textContent = nAlertas ? `${nAlertas} alerta${nAlertas === 1 ? '' : 's'}` : 'sin alertas';

      const colNivel = document.createElement('span');
      colNivel.className = 'chip ' + (ses.nivelGeneral || '');
      colNivel.textContent = ETIQUETA_NIVEL[ses.nivelGeneral] || 'Sin nivel';

      fila.append(colNombre, colMatriz, colAlertas, colNivel);
      lista.appendChild(fila);
    });
  }

  function enfocarPuntoPanel(pid) {
    document.querySelectorAll('#p-det-puntos .r-item').forEach((x) => {
      x.classList.toggle('activo', x.id === 'p-ri-' + pid);
    });
    const destino = $('p-ri-' + pid);
    if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function pintarDocumentoPanel(caso, sesion) {
    const cont = $('p-doc-cuerpo');
    cont.innerHTML = '';

    if (!caso || !caso.documento || !Array.isArray(caso.documento.fragmentos)) {
      $('p-doc-titulo').textContent = estadoPanel.tarea?.titulo || 'Resumen de trabajo evaluado';
      const aviso = document.createElement('p');
      aviso.className = 'suave chico';
      aviso.textContent = 'Vista resumida por evidencias registradas en la sesión:';
      cont.appendChild(aviso);
      entradasOrdenadas(sesion.resultados).forEach(([pid, r]) => {
        const p = document.createElement('button');
        p.type = 'button';
        p.className = 'frag ' + (r.nivel || '');
        p.textContent = `${r.tema || pid}: “${r.evidencia || 'sin cita'}”`;
        p.onclick = () => enfocarPuntoPanel(pid);
        cont.appendChild(p);
      });
      return;
    }

    $('p-doc-titulo').textContent = caso.documento.titulo || estadoPanel.tarea?.titulo || '';
    const puntosCaso = Array.isArray(caso.puntos) ? caso.puntos : [];
    let seccionActual = '';

    caso.documento.fragmentos.forEach((f) => {
      if (f.seccion !== seccionActual) {
        seccionActual = f.seccion;
        const h = document.createElement('p');
        h.className = 'sec';
        h.textContent = seccionActual;
        cont.appendChild(h);
      }
      const pAsoc = puntosCaso.find((p) => p.fragmento === f.id);
      const resPunto = pAsoc && sesion.resultados?.[pAsoc.id];
      const el = document.createElement(resPunto ? 'button' : 'p');
      if (el.tagName === 'BUTTON') {
        el.type = 'button';
        el.onclick = () => enfocarPuntoPanel(pAsoc.id);
      }
      el.className = 'frag' + (resPunto ? ' ' + resPunto.nivel : '');
      el.textContent = f.texto;
      cont.appendChild(el);
    });
  }

  function prepararDescarga(ses) {
    const b = $('b-bajar-entrega');
    b.classList.toggle('oculto', !/^doc-/.test(ses.casoId || ''));
    b.disabled = false;
    b.textContent = 'Descargar archivo original';
    b.onclick = async () => {
      b.disabled = true;
      try {
        const q = new URLSearchParams({ codigo: estadoPanel.tarea.codigo, casoId: ses.casoId });
        const r = await fetch('api/archivos?' + q, { headers: { 'x-token-profesor': ($('p-token').value || '').trim() } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        location.href = d.url;
        b.disabled = false;
      } catch (e) {
        b.textContent = e.message || 'No se pudo descargar. Intenta de nuevo.';
      }
    };
  }

  async function seleccionarSesion(idSesion) {
    const ses = estadoPanel.sesiones.find((s) => s.id === idSesion);
    if (!ses) return;
    estadoPanel.seleccionadaId = ses.id;
    renderizarListaEstudiantes(estadoPanel.sesiones);

    const fecha = ses.creada ? new Date(ses.creada).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
    $('p-doc-meta').textContent = `${ses.nombre} · ${formatearDuracion(ses.duracionSegundos)}${fecha ? ' · ' + fecha : ''}`;
    prepararDescarga(ses);
    $('p-det-nivel').className = 'chip ' + (ses.nivelGeneral || '');
    $('p-det-nivel').textContent = (ETIQUETA_NIVEL[ses.nivelGeneral] || 'Nivel') + ' sugerido';

    const caso = await obtenerCasoParaPanel(ses.casoId || estadoPanel.tarea?.casoId);
    if (estadoPanel.seleccionadaId !== ses.id) return;

    // Columna derecha: tarjeta breve de señales (solo visible cuando existen alertas, cero ruido visual)
    const cajaSen = $('p-det-senales');
    cajaSen.innerHTML = '';
    const s = ses.senales || {};
    const alertas = [];
    if (s.leyo) alertas.push(`${s.leyo} respuesta(s) muy similares al texto escrito`);
    if (s.dubitativo) alertas.push(`${s.dubitativo} respuesta(s) con muletillas de inseguridad`);
    if (s.pantallaOculta) alertas.push(`${s.pantallaOculta} cambio(s) de pestaña`);
    if (s.pegadoBloqueado) alertas.push(`${s.pegadoBloqueado} intento(s) de pegar texto`);
    if (s.captura) alertas.push(`${s.captura} intento(s) de captura o impresión`);
    if (s.iaCaida) alertas.push('evaluada parcialmente en modo respaldo');
    if (s.sinRegistro) alertas.push(`${s.sinRegistro} punto(s) sin evaluación registrada en el servidor (cuentan como rojo)`);

    if (alertas.length) {
      const hSen = document.createElement('h2');
      hSen.textContent = 'Señales de la sesión';
      const pSen = document.createElement('p');
      pSen.className = 'suave chico';
      pSen.textContent = `${alertas.join(' · ')}. Señales informativas para el docente; la nota final la decide el profesor.`;
      cajaSen.append(hSen, pSen);
      cajaSen.classList.remove('oculto');
    } else {
      cajaSen.classList.add('oculto');
    }

    // Columna derecha: puntos concisos con diálogo completo colapsado en <details>
    const cajaPuntos = $('p-det-puntos');
    cajaPuntos.innerHTML = '';
    const hPun = document.createElement('h2');
    hPun.textContent = 'Desempeño por punto';
    cajaPuntos.appendChild(hPun);

    const mapaTemasCaso = new Map((caso?.puntos || []).map((p) => [p.id, p]));

    entradasOrdenadas(ses.resultados).forEach(([pid, r], idx) => {
      const infoBase = mapaTemasCaso.get(pid);
      const item = document.createElement('div');
      item.className = 'r-item';
      item.id = 'p-ri-' + pid;

      const cab = document.createElement('div');
      cab.className = 'fila entre';
      const titWrap = document.createElement('div');
      const bTema = document.createElement('b');
      bTema.textContent = r.tema || infoBase?.tema || `Punto ${idx + 1}`;
      const tipoTxt = ETIQUETA_TIPO[r.tipo || infoBase?.tipo] || '';
      titWrap.appendChild(bTema);
      if (tipoTxt) {
        const sTipo = document.createElement('span');
        sTipo.className = 'mono chico suave';
        sTipo.textContent = ` · ${tipoTxt}`;
        titWrap.appendChild(sTipo);
      }

      const chip = document.createElement('span');
      chip.className = 'chip ' + (r.nivel || '');
      chip.textContent = ETIQUETA_PUNTO[r.nivel] || r.nivel;
      cab.append(titWrap, chip);

      const pMotivo = document.createElement('span');
      pMotivo.className = 'suave';
      pMotivo.textContent = r.motivo || '';

      const pCita = document.createElement('span');
      pCita.className = 'cita';
      pCita.textContent = `“${r.evidencia || 'sin extracto'}”`;

      item.append(cab, pMotivo, pCita);

      const turnos = Array.isArray(r.conversacion) ? r.conversacion : [];
      if (turnos.length) {
        const det = document.createElement('details');
        det.className = 'dialogo-limpio';
        const sum = document.createElement('summary');
        sum.textContent = `Ver diálogo con Carlos (${turnos.length} intervenciones)`;
        det.appendChild(sum);

        turnos.forEach((m) => {
          const msg = document.createElement('div');
          msg.className = 'turno-msg';
          const autor = document.createElement('b');
          autor.textContent = m.rol === 'carlos' ? 'Carlos' : ses.nombre;
          const texto = document.createElement('p');
          texto.textContent = m.texto;
          msg.append(autor, texto);
          det.appendChild(msg);
        });
        item.appendChild(det);
      }

      cajaPuntos.appendChild(item);
    });

    pintarDocumentoPanel(caso, ses);
    $('p-detalle').classList.remove('oculto');
  }

  /* ---------- 5. Consulta HTTP al backend y exportación CSV ---------- */
  async function consultarEntregas(e) {
    if (e) e.preventDefault();
    const codigo = normalizarCodigoPanel($('p-codigo').value);
    const token = ($('p-token').value || '').trim();
    $('panel-err').textContent = '';

    if (!codigo) {
      $('panel-err').textContent = 'Ingresa el código de la tarea.';
      return;
    }
    if (!token) {
      $('panel-err').textContent = 'Ingresa tu llave de profesor para consultar los reportes.';
      return;
    }

    $('b-consultar-panel').disabled = true;
    try {
      const res = await fetch('api/sesiones?codigo=' + encodeURIComponent(codigo), {
        headers: { 'x-token-profesor': token },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudieron obtener las entregas');

      $('p-codigo').value = d.tarea.codigo;
      guardarLlaveLocal(d.tarea.codigo, token);

      estadoPanel = {
        tarea: d.tarea,
        sesiones: Array.isArray(d.sesiones) ? d.sesiones : [],
        seleccionadaId: d.sesiones?.[0]?.id || null,
      };

      $('p-info-curso').textContent = `${d.tarea.curso}${d.tarea.profesor ? ' · ' + d.tarea.profesor : ''} · código ${d.tarea.codigo}`;
      $('p-info-titulo').textContent = d.tarea.titulo;
      $('p-info-foco').textContent = d.tarea.casoId === 'estudiante' ? 'entrega individual por estudiante' : `caso base: ${d.tarea.casoId}`;
      mostrarEstadoTarea(d.tarea);

      renderizarKPIs(estadoPanel.sesiones);
      renderizarListaEstudiantes(estadoPanel.sesiones);

      $('b-refrescar-panel').classList.remove('oculto');
      $('b-exportar-csv').classList.toggle('oculto', estadoPanel.sesiones.length === 0);
      $('panel-contenido').classList.remove('oculto');

      if (estadoPanel.seleccionadaId) {
        await seleccionarSesion(estadoPanel.seleccionadaId);
      }
    } catch (err) {
      $('panel-err').textContent = err.message;
      $('panel-contenido').classList.add('oculto');
      $('b-exportar-csv').classList.add('oculto');
    } finally {
      $('b-consultar-panel').disabled = false;
    }
  }

  /* ---------- 6. Cerrar o reabrir la tarea ---------- */
  function mostrarEstadoTarea(tarea) {
    const demo = tarea.codigo === 'DEMO-01';
    $('p-info-estado').textContent = demo ? '' : tarea.cerrada ? 'cerrada: no recibe entregas nuevas' : 'abierta: recibe entregas';
    $('b-cerrar-tarea').classList.toggle('oculto', demo);
    $('b-cerrar-tarea').textContent = tarea.cerrada ? 'Reabrir entregas' : 'Cerrar entregas';
  }

  async function alternarCierre() {
    const tarea = estadoPanel.tarea;
    if (!tarea) return;
    const cerrar = !tarea.cerrada;
    if (cerrar && !window.confirm('¿Cerrar las entregas? Quien ya empezó puede terminar, pero nadie más podrá entregar. Puedes reabrirla después.')) return;
    const boton = $('b-cerrar-tarea');
    boton.disabled = true;
    try {
      const res = await fetch('api/tareas?codigo=' + encodeURIComponent(tarea.codigo), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-token-profesor': ($('p-token').value || '').trim() },
        body: JSON.stringify({ cerrada: cerrar }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo cambiar el estado de la tarea');
      tarea.cerrada = d.cerrada;
      mostrarEstadoTarea(tarea);
    } catch (err) {
      $('panel-err').textContent = err.message;
    } finally {
      boton.disabled = false;
    }
  }

  function exportarCSV() {
    if (!estadoPanel.tarea || !estadoPanel.sesiones.length) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cab = ['Estudiante', 'Nivel sugerido', 'Duracion (s)', 'Puntos verdes', 'Total puntos', 'Alertas totales', 'Leyo literal', 'Dubitativo', 'Salidas pestana', 'Pegado bloqueado', 'Capturas', 'Fecha ISO'];
    const filas = estadoPanel.sesiones.map((s) => {
      const pts = Object.values(s.resultados || {});
      const verdes = pts.filter((p) => p.nivel === 'verde').length;
      const sen = s.senales || {};
      return [
        s.nombre,
        ETIQUETA_NIVEL[s.nivelGeneral] || s.nivelGeneral,
        s.duracionSegundos || 0,
        verdes,
        pts.length,
        contarAlertas(sen),
        sen.leyo || 0,
        sen.dubitativo || 0,
        sen.pantallaOculta || 0,
        sen.pegadoBloqueado || 0,
        sen.captura || 0,
        s.creada || '',
      ].map(esc).join(',');
    });
    const csv = '\uFEFF' + [cab.map(esc).join(','), ...filas].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defiendelo-${estadoPanel.tarea.codigo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function abrirPanelProfesor(codigoPre, tokenPre) {
    $('panel-err').textContent = '';
    const previo = normalizarCodigoPanel($('p-codigo').value);
    const nuevo = codigoPre ? normalizarCodigoPanel(codigoPre) : previo;
    if (codigoPre && nuevo !== previo) {
      $('p-codigo').value = codigoPre;
      $('p-token').value = '';
      $('panel-contenido').classList.add('oculto');
      $('b-exportar-csv').classList.add('oculto');
      $('b-refrescar-panel').classList.add('oculto');
    } else if (codigoPre) {
      $('p-codigo').value = codigoPre;
    }
    if (tokenPre) {
      $('p-token').value = tokenPre;
    } else if ($('p-codigo').value && !$('p-token').value) {
      const guardado = leerLlavesGuardadas()[normalizarCodigoPanel($('p-codigo').value)];
      if (guardado) $('p-token').value = guardado;
    }
    mostrar('panel-profe');
    if ($('p-codigo').value && $('p-token').value) {
      consultarEntregas();
    } else {
      ($('p-codigo').value ? $('p-token') : $('p-codigo')).focus();
    }
  }

  /* ---------- 6. Enlace de eventos DOM ---------- */
  if ($('b-ir-panel')) {
    $('b-ir-panel').onclick = () => abrirPanelProfesor($('codigo')?.value || '', '');
  }
  if ($('b-copiar-token')) {
    $('b-copiar-token').onclick = (e) => copiar($('c-token').textContent, e.currentTarget);
  }
  if ($('b-ver-reportes-creada')) {
    $('b-ver-reportes-creada').onclick = () => abrirPanelProfesor($('c-codigo').textContent, $('c-token').textContent);
  }
  if ($('b-panel-nueva')) {
    $('b-panel-nueva').onclick = () => { if (typeof abrirProfe === 'function') abrirProfe(); };
  }
  if ($('f-panel')) {
    $('f-panel').addEventListener('submit', consultarEntregas);
  }
  if ($('b-refrescar-panel')) {
    $('b-refrescar-panel').onclick = () => consultarEntregas();
  }
  if ($('b-exportar-csv')) {
    $('b-exportar-csv').onclick = exportarCSV;
  }
  if ($('p-codigo')) {
    $('p-codigo').addEventListener('input', () => {
      $('panel-err').textContent = '';
      const cod = normalizarCodigoPanel($('p-codigo').value);
      const guardado = leerLlavesGuardadas()[cod];
      if (guardado && !$('p-token').value) $('p-token').value = guardado;
    });
  }
  if ($('b-cerrar-tarea')) $('b-cerrar-tarea').onclick = alternarCierre;
  if ($('p-token')) {
    $('p-token').addEventListener('input', () => { $('panel-err').textContent = ''; });
  }
})();
