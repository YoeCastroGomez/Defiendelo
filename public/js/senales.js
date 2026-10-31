/* Señales de una respuesta: lectura literal del trabajo y muletillas de duda.
   Archivo compartido: el navegador lo carga como script y el servidor lo importa para recalcular las señales.
   Sin import/export a propósito, para que funcione en ambos lados. */
(function (raiz) {
  'use strict';

  const palabras = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);

  // Qué fracción de los trigramas de la respuesta aparecen tal cual en el texto del trabajo.
  function contencion(resp, texto) {
    const a = palabras(resp), b = palabras(texto);
    if (a.length < 8) return 0;
    const tri = (w) => new Set(w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' ')));
    const A = tri(a), B = tri(b);
    let c = 0;
    A.forEach((x) => { if (B.has(x)) c++; });
    return A.size ? c / A.size : 0;
  }

  const UMBRAL_LECTURA = 0.6;
  const leyoTrabajo = (resp, texto) => contencion(resp, texto) >= UMBRAL_LECTURA;

  const MULETILLAS = /\b(creo que|me parece|tal vez|quizas|quiza|no estoy segur[oa]|supongo|a lo mejor|no se bien|diria que)\b/g;
  function esDubitativo(texto) {
    const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return (t.match(MULETILLAS) || []).length >= 1;
  }

  raiz.Senales = Object.freeze({ palabras, contencion, leyoTrabajo, esDubitativo, UMBRAL_LECTURA });
})(typeof window !== 'undefined' ? window : globalThis);
