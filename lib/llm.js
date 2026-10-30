// Adaptador de proveedores de IA. Se elige con variables de entorno:
//   LLM_PROVIDER = anthropic | openai | groq | gemini | openai-compatible
//   LLM_API_KEY  = clave del proveedor
//   LLM_MODEL    = nombre del modelo (obligatorio, cambia con el tiempo)
//   LLM_BASE_URL = solo para openai-compatible (p. ej. un servidor local)
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
  if (!r.ok) throw new Error(`Proveedor ${P()} respondió ${r.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

export async function llamarLLM(sistema, mensajes) {
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const p = P();

  if (p === 'anthropic') {
    const d = await post('https://api.anthropic.com/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: 400, temperature: 0.4, system: sistema, messages: mensajes });
    return d.content.map((c) => c.text || '').join('');
  }

  if (p === 'gemini') {
    const d = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': key },
      {
        systemInstruction: { parts: [{ text: sistema }] },
        contents: mensajes.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 400, responseMimeType: 'application/json' },
      });
    return d.candidates[0].content.parts.map((x) => x.text || '').join('');
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
      model, temperature: 0.4, max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sistema }, ...mensajes],
    });
  return d.choices[0].message.content;
}
