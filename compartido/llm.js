// Adaptador de proveedores de IA. Se elige con variables de entorno:
//   LLM_PROVIDER = anthropic | openai | groq | gemini | openai-compatible
//   LLM_API_KEY  = clave del proveedor
//   LLM_MODEL    = nombre del modelo (obligatorio, cambia con el tiempo)
//   LLM_BASE_URL = solo para openai-compatible (p. ej. un servidor local)
//   LLM_MODEL_RESPALDO = solo para gemini: modelo a usar si LLM_MODEL ya no existe (404).
//                        Por defecto, el alias `gemini-flash-lite-latest`, que Google mantiene vigente.
const P = () => (process.env.LLM_PROVIDER || '').toLowerCase();

export function proveedorConfigurado() {
  return !!(P() && process.env.LLM_API_KEY && process.env.LLM_MODEL);
}

// Cada error lleva `causa` para poder diagnosticar sin mostrar al cliente la respuesta cruda del proveedor:
//   tiempo    → el proveedor no respondió a tiempo
//   red       → no se pudo conectar con el proveedor
//   proveedor → respondió con un error HTTP (status en `status`)
//   cortada   → la respuesta se cortó por el límite de tokens
//   vacia     → respondió sin texto
function errorIA(mensaje, causa, extra = {}) {
  return Object.assign(new Error(mensaje), { causa, ...extra });
}

async function post(url, headers, body, timeoutMs = 25000) {
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1000, timeoutMs)),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw errorIA(`Proveedor ${P()} no respondió en ${Math.round(timeoutMs / 1000)} s`, 'tiempo');
    throw errorIA(`No se pudo conectar con el proveedor ${P()}: ${e.message}`, 'red');
  }
  const txt = await r.text();
  if (!r.ok) {
    throw errorIA(`Proveedor ${P()} respondió ${r.status}: ${txt.slice(0, 200)}`, 'proveedor', { status: r.status, status404: r.status === 404, detalle: txt.slice(0, 500) });
  }
  return JSON.parse(txt);
}

// Los modelos Gemini recientes "piensan" antes de responder, y ese pensamiento gasta el mismo presupuesto
// de tokens que la respuesta: un JSON largo puede llegar cortado o vacío. Se desactiva salvo en los modelos
// "pro", que no lo permiten. Si un modelo antiguo rechaza la opción, se reintenta sin ella.
const admitePensamientoCero = (m) => !/pro/i.test(m) && !/1\.5|2\.0/.test(m);

export async function llamarLLM(sistema, mensajes, opciones = {}) {
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const maxTokens = opciones.maxTokens || 1500;
  const timeoutMs = opciones.timeoutMs || 25000;
  const p = P();

  if (p === 'anthropic') {
    const d = await post('https://api.anthropic.com/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: maxTokens, temperature: 0.4, system: sistema, messages: mensajes }, timeoutMs);
    if (d.stop_reason === 'max_tokens') throw errorIA('La respuesta se cortó por el límite de tokens', 'cortada');
    return d.content.map((c) => c.text || '').join('');
  }

  if (p === 'gemini') {
    const limpiar = (m) => String(m || '').trim().replace(/^models\//, '');
    const modelo = limpiar(model);
    const respaldo = limpiar(process.env.LLM_MODEL_RESPALDO) || 'gemini-flash-lite-latest';
    const cuerpoPara = (m, sinPensar) => {
      const generationConfig = { temperature: 0.3, maxOutputTokens: maxTokens, responseMimeType: 'application/json' };
      if (sinPensar) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      return {
        systemInstruction: { parts: [{ text: sistema }] },
        contents: mensajes.map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
        generationConfig,
      };
    };
    const inicio = Date.now();
    const restante = () => timeoutMs - (Date.now() - inicio);
    const url = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    async function pedir(m) {
      const sinPensar = admitePensamientoCero(m);
      try {
        return await post(url(m), { 'x-goog-api-key': key }, cuerpoPara(m, sinPensar), restante());
      } catch (err) {
        if (!(sinPensar && err.status === 400 && /thinking/i.test(err.detalle || ''))) throw err;
        return post(url(m), { 'x-goog-api-key': key }, cuerpoPara(m, false), restante());
      }
    }
    let d;
    try {
      d = await pedir(modelo);
    } catch (err) {
      // Un 404 significa que el modelo se retiró o el nombre está mal: se prueba una sola vez con el respaldo.
      if (!err.status404 || respaldo === modelo) throw err;
      console.error(`[llm] el modelo ${modelo} no existe; se usa ${respaldo}`);
      d = await pedir(respaldo);
    }
    const cand = d?.candidates?.[0];
    if (cand?.finishReason === 'MAX_TOKENS') throw errorIA('La respuesta de Gemini se cortó por el límite de tokens', 'cortada');
    if (!cand?.content?.parts) {
      throw errorIA(`Gemini no generó contenido (finishReason: ${cand?.finishReason || 'desconocido'})`, 'vacia');
    }
    const textoLimpio = cand.content.parts
      .filter((x) => !x.thought)
      .map((x) => x.text || '')
      .join('');
    return textoLimpio || cand.content.parts.map((x) => x.text || '').join('');
  }

  const bases = {
    openai: 'https://api.openai.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    'openai-compatible': process.env.LLM_BASE_URL,
  };
  if (!(p in bases) || !bases[p]) throw new Error(`LLM_PROVIDER no soportado: ${p}`);
  const d = await post(`${bases[p].replace(/\/$/, '')}/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model, temperature: 0.4, max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sistema }, ...mensajes],
    }, timeoutMs);
  if (d.choices?.[0]?.finish_reason === 'length') throw errorIA('La respuesta se cortó por el límite de tokens', 'cortada');
  return d.choices[0].message.content;
}
