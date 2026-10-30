# Defiéndelo

> No te vamos a examinar. Vas a enseñarle tu trabajo a Carlos.

Proyecto para **DSC HACK 2026** · Reto *Educación 2036* · Grieta 02 *“Aprender sin pensar”*.

**Demo:** `<!-- TODO: enlace de Vercel -->`
**Pitch:** `<!-- TODO: enlace a las diapositivas -->`

---

## 🎯 Problema y solución

### El problema
Con la IA generativa, un estudiante puede entregar un trabajo impecable sin entenderlo. El trabajo entregado deja de ser evidencia de aprendizaje, y el profesor no tiene una forma escalable de comprobarlo:

- **Prohibir la IA** no funciona y además va contra lo que el estudiante necesitará en su vida profesional.
- **Los detectores de IA** son poco confiables y generan acusaciones injustas.
- **Una defensa oral manual** sí funciona, pero no escala: a unos 15 minutos por alumno, una clase de 40 son 10 horas por tarea.

<!-- TODO: agregar aquí lo aprendido con usuarios reales (entrevistas a estudiantes y profesores, citas, números). Es el 30 % de la evaluación. -->

### La solución
Defiéndelo convierte cada trabajo entregado en una conversación de unos 5 a 7 minutos. El estudiante no responde a un examinador: **le enseña su trabajo a Carlos**, un compañero de IA que no lo entiende y que a veces se equivoca con mucha seguridad.

- Las dudas de Carlos salen de los **puntos débiles del propio trabajo** del estudiante, no de un temario genérico.
- Carlos comete **errores a propósito**. Para corregirlos hay que entender, no recordar.
- Carlos también trae **cambios de condición** (“¿y si mañana piden avisar por WhatsApp?”), para medir si el estudiante puede aplicar su diseño, no solo describirlo.
- El trabajo está **a la vista todo el tiempo**. Carlos señala la parte de la que habla y, al final, el reporte es **el mismo trabajo marcado** en verde, amarillo o rojo según lo que el estudiante pudo explicar.

### Cómo llega la tarea al estudiante
1. El **profesor** crea la tarea (curso, título, qué deben poder explicar, trabajo base y cierre) y recibe un **código** tipo `KXS-3NT`.
2. Lo comparte con la clase, o comparte el enlace directo `…/?codigo=KXS-3NT`.
3. El **estudiante** ingresa el código, ve qué espera su profesor que pueda explicar, escribe su nombre y elige el modo.

Los códigos usan un alfabeto sin caracteres confusos (sin `0/O` ni `1/I/L`) para que se puedan dictar en clase, y se aceptan en minúsculas o sin guion. El código `DEMO-01` siempre abre la tarea de demostración.

### Dos modos
| | Práctica | Evaluación |
|---|---|---|
| Quién la inicia | El estudiante, cuando quiera | El profesor, con un enlace |
| Quién ve el reporte | Solo el estudiante | El estudiante y el profesor |
| Al terminar | Qué repasar y reintento | Queda registrado |
| Pegar texto | Permitido | Bloqueado (y se registra el intento) |

El profesor siempre decide la nota. Defiéndelo solo **sugiere un nivel** y entrega la evidencia.

### Diferencia con lo que ya existe
Existen herramientas de evaluación oral con IA (Viva de NYU Stern, Viva de InitialView, FeedbackFruits Oral Assessment, Socratic Mind, Breakout Learning). Todas siguen la lógica de *“la IA examina y el profesor recibe una evaluación”*. Defiéndelo cambia el formato: **el estudiante enseña a un compañero que se equivoca**, y el resultado es **su propio trabajo marcado**, no una nota.

---

## ⚙️ Arquitectura y tecnologías

```
Navegador (public/)                         Servidor (api/ + lib/)
┌──────────────────────────────┐            ┌─────────────────────────────┐
│ index.html + app.js          │  POST      │ api/carlos.js               │
│ - Documento por fragmentos   │ ─────────▶ │  └ lib/turno.js             │
│ - Dictado (Web Speech API)   │  JSON      │     - arma el prompt de     │
│ - Voz de Carlos (TTS nativo) │ ◀───────── │       Carlos con el caso    │
│ - Detección de lectura       │            │     - valida el JSON        │
│ - Reporte y documento marcado│            │  └ lib/llm.js               │
│ - Modo simulado de respaldo  │            │     - adaptador de          │
└──────────────────────────────┘            │       proveedores de IA     │
            │                               └─────────────────────────────┘
            ▼
  public/casos/<caso>.json  (trabajo en fragmentos + puntos que explora Carlos)
```

| Componente | Tecnología | Decisión |
|---|---|---|
| Frontend | HTML, CSS y JavaScript sin frameworks | Carga instantánea y cero dependencias para una demo confiable. |
| Dictado | Web Speech API (`SpeechRecognition`, `es-PE`) | Gratis y en el navegador; no se envía audio a nuestro servidor. |
| Voz de Carlos | `speechSynthesis` del navegador | Sin costo; se puede apagar. |
| Backend | Función serverless de Vercel (`api/carlos.js`) | La API key nunca llega al navegador. |
| IA | Adaptador propio: Anthropic, OpenAI, Groq, Gemini o cualquier API compatible con OpenAI | El proveedor se cambia con variables de entorno, sin tocar código. |
| Caso | JSON (`public/casos/*.json`) | El trabajo viene dividido en fragmentos con ID, así lo que señala Carlos siempre se puede resaltar. |
| Tareas y códigos | `api/tareas.js` + Redis de Upstash (opcional) | Sin configurar, las tareas viven en memoria del servidor; con Upstash, persisten 60 días y funcionan en Vercel. |

### Cómo funciona un turno
1. Cada **punto** del caso está atado a un fragmento del trabajo. Carlos abre el punto con una pregunta (y, si corresponde, con un error a propósito) y ese fragmento se resalta.
2. El estudiante responde hablando o escribiendo.
3. Antes de enviar, el navegador mide qué parte de la respuesta es **copia literal del trabajo** (trigramas de palabras). Si supera el 60 %, se marca como “leyó su trabajo”.
4. El backend envía al modelo el trabajo, el punto, lo que una buena explicación debería cubrir (oculto para el estudiante) y la conversación. El modelo responde **un solo JSON**:
   ```json
   { "nivel": "verde|amarillo|rojo", "motivo": "...", "evidencia": "...", "repreguntar": false, "carlos_dice": "..." }
   ```
5. Si la respuesta fue parcial, Carlos **repregunta una sola vez**. Luego el fragmento se pinta con el nivel y se pasa al siguiente punto.

Una sola llamada por turno mantiene el costo en centavos por defensa.

### Estructura
```
api/carlos.js          Endpoint serverless (GET: estado de la IA, POST: turno)
api/tareas.js          POST: el profesor crea una tarea y recibe el código · GET ?codigo=: el estudiante la carga
lib/turno.js           Prompt de Carlos, evaluación y validación del JSON
lib/llm.js             Adaptador de proveedores de IA
lib/almacen.js         Almacenamiento de tareas (Upstash Redis o memoria)
public/casos/index.json Lista de trabajos base que puede elegir el profesor
public/index.html      Pantallas: inicio, defensa, reporte
public/app.js          Lógica del cliente
public/estilos.css     Estilos
public/casos/demo.json Caso de ejemplo
server.js              Servidor local sin dependencias
vercel.json            Incluye los casos en la función serverless
```

---

## 🔗 Demo desplegada

`<!-- TODO: enlace de Vercel -->`

**Uso:**
0. Como profesor: *Crear tarea* → *Generar código*. Como estudiante: ingresa ese código (o `DEMO-01`) y tu nombre.
1. Elige **Práctica** o **Evaluación** y pulsa *Empezar con Carlos*.
2. Carlos te hace una pregunta y resalta la parte de tu trabajo de la que habla.
3. Pulsa **● Hablar** (en Chrome) o escribe tu explicación, y luego **Responder**.
4. Al final verás tu trabajo marcado. Haz clic en una parte marcada para ver qué dijiste.

Si la IA no está configurada, la app funciona en **modo simulado**: el botón *Simular respuesta* llena una respuesta de ejemplo y la evaluación usa resultados predefinidos.

---

## ✅ Funcionalidades implementadas

**Funciona de verdad**
- El profesor crea una tarea y obtiene un código y un enlace para compartir.
- El estudiante entra con el código y ve lo que su profesor espera que explique.
- Flujo completo: código → defensa con Carlos → reporte.
- Modos práctica y evaluación.
- Carlos conducido por IA real, con repregunta y evaluación por punto (al configurar un proveedor).
- Dictado por voz y voz de Carlos en el navegador.
- Documento visible con el fragmento señalado y pintado en vivo.
- Reporte con el trabajo marcado, evidencia por punto y nivel sugerido.
- Señales de sesión: respuestas leídas del trabajo, salidas de la pestaña e intentos de pegar en evaluación.
- Respaldo automático a modo simulado si la IA falla en medio de la sesión.

**Limitaciones actuales**
- El trabajo y sus puntos vienen de un **caso preparado** (`casos/demo.json`). Aún no se sube un PDF propio: la extracción de fragmentos con PDF.js y la generación automática de puntos con IA están en el plan.
- **No hay cuentas**: cualquiera con el código entra a la tarea, y el estudiante se identifica solo con su nombre.
- **Sin Upstash configurado, las tareas viven en memoria**: en local duran mientras el servidor esté encendido; en Vercel pueden perderse cuando la función se reinicia. `DEMO-01` funciona siempre.
- **Los reportes no se guardan**: el reporte de evaluación no llega aún al profesor; se muestra al final de la sesión.
- El dictado depende del navegador (funciona en Chrome y Edge; en otros, se escribe).
- Las señales de sesión son alertas para revisar, no prueban nada por sí solas.
- No se graba audio ni video.

---

## 📖 Instrucciones de ejecución

Requisitos: **Node.js 18 o superior**. No hay dependencias que instalar.

```bash
git clone <repo>
cd defiendelo
cp .env.example .env     # opcional: sin .env funciona en modo simulado
node server.js           # http://localhost:3000
```

### Configurar la IA
En `.env` (local) o en las variables de entorno de Vercel:

| Variable | Valores |
|---|---|
| `LLM_PROVIDER` | `anthropic`, `openai`, `groq`, `gemini` u `openai-compatible` |
| `LLM_API_KEY` | Clave del proveedor |
| `LLM_MODEL` | Nombre exacto del modelo del proveedor |
| `LLM_BASE_URL` | Solo para `openai-compatible` |

### Guardar las tareas (recomendado en Vercel)
Crea una base Redis gratuita en [Upstash](https://upstash.com) (o desde el marketplace de Vercel) y agrega:

| Variable | Valor |
|---|---|
| `UPSTASH_REDIS_REST_URL` | URL REST de la base |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST |

Sin estas variables, las tareas se guardan en memoria.

### Desplegar en Vercel
1. Importa el repositorio en Vercel (no necesita configuración de build).
2. Agrega las variables de entorno de arriba.
3. Despliega. El frontend se sirve desde `public/` y el endpoint queda en `/api/carlos`.

### Agregar un caso
Crea `public/casos/<id>.json` con la misma estructura de `demo.json` (fragmentos del trabajo y puntos con `fragmento`, `apertura`, `error_de_carlos`, `que_debe_explicar` y `simulado`) y agrégalo a `public/casos/index.json` para que el profesor pueda elegirlo al crear la tarea.

---

## 💼 Modelo de negocio (resumen)
- **Quién paga:** la universidad, con una licencia por estudiante activo por semestre. El estudiante lo usa gratis.
- **Cómo se entra:** gratis para profesores individuales hasta cierto número de defensas; la licencia se vende cuando varios profesores de una facultad ya lo usan.
- **Costo:** una llamada a la IA por turno y voz procesada en el navegador, del orden de centavos de dólar por defensa.
- **Ingreso secundario:** práctica de sustentación de tesis pagada por el estudiante.

## 👥 Equipo
<!-- TODO: nombres y roles -->
