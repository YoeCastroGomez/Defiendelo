// Evaluación de respaldo, sin IA: se usa cuando no hay proveedor configurado o cuando falla.
// Vive en el servidor para que el nivel de cada punto nunca lo decida el navegador.
const corta = (t, n = 150) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t);

const REACCION = {
  verde: 'Manya, ahora sí tiene todo el sentido. Me dejaste sin argumentos, buena.',
  amarillo: 'Mmm, más o menos te capto la idea, aunque me queda una duda… sigamos.',
  amarilloDuda: '¿"Creo"? Con ese "creo" el profe nos baja puntos ah… más o menos te capto, sigamos.',
  rojo: '¿Ves? Entonces sí era como yo decía… aunque suena medio peligroso dejarlo así.',
};
const ESTADO = { verde: 'convencido', amarillo: 'confundido', rojo: 'ironico' };

export function evaluacionSimulada(punto, texto, { leyo = false, dubitativo = false, usarEjemplo = true } = {}) {
  const t = String(texto || '').trim();
  const s = punto.simulado;
  if (!t || t === 'No sé.' || t === '(silencio)') {
    return { nivel: 'rojo', estado_carlos: 'ironico', motivo: 'No dio una explicación para este punto.', evidencia: t || '(sin respuesta)', repreguntar: false, carlos_dice: 'Asu, si tú que hiciste el informe no sabes, mañana en la sustentación nos comen vivos. Sigamos.' };
  }
  if (leyo) {
    return { nivel: 'amarillo', estado_carlos: 'ironico', motivo: 'Leyó su trabajo casi palabra por palabra, sin explicarlo.', evidencia: corta(t, 120), repreguntar: false, carlos_dice: 'Ya, bacán, me leíste el párrafo igualito… pero yo quería que me lo traduzcas en cristiano. Sigamos.' };
  }
  if (usarEjemplo && s && t === String(s.respuesta || '').trim() && ['verde', 'amarillo', 'rojo'].includes(s.nivel)) {
    const dice = s.nivel === 'amarillo' && dubitativo ? REACCION.amarilloDuda : REACCION[s.nivel];
    return { nivel: s.nivel, estado_carlos: ESTADO[s.nivel], motivo: String(s.motivo || ''), evidencia: corta(t, 120), repreguntar: false, carlos_dice: dice };
  }
  return {
    nivel: 'amarillo',
    estado_carlos: dubitativo ? 'ironico' : 'confundido',
    motivo: 'Modo simulado: respuesta libre sin evaluación de IA.',
    evidencia: corta(t, 120),
    repreguntar: false,
    carlos_dice: dubitativo ? 'Te noto dudando con ese "creo"… igual capto por dónde vas. Sigamos.' : 'Ya, creo que te capto la idea general. Sigamos con el otro punto.',
  };
}
