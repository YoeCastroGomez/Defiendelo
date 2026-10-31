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

async function post(url, headers, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const txt = await r.text();
  if (!r.ok) {
    const e = new Error(`Proveedor ${P()} respondió ${r.status}: ${txt.slice(0, 200)}`);
    e.status404 = r.status === 404;
    throw e;
  }
  return JSON.parse(txt);
}

export async function llamarLLM(sistema, mensajes, opciones = {}) {
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const maxTokens = opciones.maxTokens || 1500;
  const p = P();

  if (p === 'anthropic') {
    const d = await post('https://api.anthropic.com/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: maxTokens, temperature: 0.4, system: sistema, messages: mensajes });
    return d.content.map((c) => c.text || '').join('');
  }

  if (p === 'gemini') {
    const limpiar = (m) => String(m || '').trim().replace(/^models\//, '');
    const modelo = limpiar(model);
    const respaldo = limpiar(process.env.LLM_MODEL_RESPALDO) || 'gemini-flash-lite-latest';
    const cuerpoPara = (m) => {
      const generationConfig = { temperature: 0.3, maxOutputTokens: maxTokens, responseMimeType: 'application/json' };
      // Los modelos 2.5 piensan antes de responder: se desactiva para no superar el tiempo límite.
      if (m.includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      return {
        systemInstruction: { parts: [{ text: sistema }] },
        contents: mensajes.map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
        generationConfig,
      };
    };
    const pedir = (m) => post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
      { 'x-goog-api-key': key }, cuerpoPara(m));
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
    if (!cand?.content?.parts) {
      throw new Error(`Gemini no generó contenido (finishReason: ${cand?.finishReason || 'desconocido'})`);
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
    });
  return d.choices[0].message.content;
}
