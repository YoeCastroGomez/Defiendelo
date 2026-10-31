# Defiéndelo

> No te vamos a examinar. Vas a enseñarle tu trabajo a Carlos.

Proyecto para **DSC HACK 2026** · Reto *Educación 2036* · Grieta 02 *“Aprender sin pensar”*.

**Demo:** https://defiendelo-six.vercel.app · código de prueba: `DEMO-01`
**Pitch:** [https://canva.link/qw88nukvephvhf1](https://canva.link/qw88nukvephvhf1)

---

## 🎯 Problema y solución

### El problema
Con la IA generativa, un estudiante puede entregar un trabajo impecable sin entenderlo. El trabajo entregado deja de ser evidencia de aprendizaje, y el profesor no tiene una forma escalable de comprobarlo:

- **Prohibir la IA** no funciona y además va contra lo que el estudiante necesitará en su vida profesional.
- **Los detectores de IA** son poco confiables y generan acusaciones injustas.
- **Una defensa oral manual** sí funciona, pero no escala: a unos 15 minutos por alumno, una clase de 40 son 10 horas por tarea.

### Aprendizajes con usuarios reales
Probamos Defiéndelo con **1 estudiante** de **Ingeniería de telecomunicaciones** (validando que la detección de lectura literal y el acompañamiento de Carlos activan el razonamiento propio en vez de recitar el informe).

### La solución
Defiéndelo convierte cada trabajo entregado en una conversación de unos 5 a 7 minutos. El estudiante no responde a un examinador: **le enseña su trabajo a Carlos**, un compañero de IA que no lo entiende y que a veces se equivoca con mucha seguridad.

- Las dudas de Carlos salen de los **puntos débiles del propio trabajo** del estudiante, no de un temario genérico.
- Carlos comete **errores a propósito**. Para corregirlos hay que entender, no recordar.
- Carlos también trae **cambios de condición** (“¿y si mañana piden avisar por WhatsApp?”), para medir si el estudiante puede aplicar su diseño, no solo describirlo.
- El trabajo está **a la vista todo el tiempo**. Carlos señala la parte de la que habla y, al final, el reporte es **el mismo trabajo marcado** en verde, amarillo o rojo según lo que el estudiante pudo explicar.

### Cómo llega la tarea al estudiante
1. El **profesor** crea la tarea: curso, título, qué deben poder explicar, **tipo de actividad** y **fecha límite** (obligatorios, con calendario). Recibe un **código** tipo `KXS-3NT` y un **token privado** para ver los reportes.
   - **Evaluación calificada:** al vencer la fecha límite nadie puede empezar a entregar. Quien ya había empezado puede terminar, y su entrega queda marcada *fuera de plazo* para que el profesor decida.
   - **Práctica:** la fecha es de referencia. Se puede entregar después, pero la entrega queda marcada *fuera de plazo*.
2. Elige qué defenderán sus estudiantes, y el formulario muestra solo la caja que corresponde:
   - **Su propia tarea** (cada estudiante sube su resolución): una sola caja de **material** para guías, rúbricas, plantillas y teoría, hasta 10 archivos. El profesor no tiene que clasificarlos: la app separa por el nombre del archivo las guías y plantillas (le dicen a Carlos qué se pidió) de la teoría (le da contexto del curso).
   - **Un documento que el profesor les da** (una lectura, un caso): una caja para subir ese documento. Todos lo estudian y lo defienden; nadie sube nada.
3. Comparte el código con la clase, o el enlace directo `…/?codigo=KXS-3NT`.
4. El **estudiante** ingresa el código, lee las instrucciones y la teoría, escribe su nombre y elige el modo. Si la tarea lo pide, sube su resolución en `.pdf` o `.docx` (hasta 10 MB) o pega su texto.

Los códigos usan un alfabeto sin caracteres confusos (sin `0/O` ni `1/I/L`) para que se puedan dictar en clase, y se aceptan en minúsculas o sin guion. El código `DEMO-01` siempre abre la tarea de demostración.

### Rendir práctica o rendir evaluación
El estudiante no elige entre ensayar y entregar: la tarea define cómo se rinde, según el tipo que eligió el profesor.

| | Práctica | Evaluación calificada |
|---|---|---|
| Botón | *Rendir práctica* | *Rendir evaluación* |
| Intentos | Los que quiera | Uno por estudiante |
| Cómo responde | Hablando o escribiendo | Solo hablando, salvo que el profesor marque *Permitir responder por escrito* |
| Qué ve el profesor | Todos los intentos, numerados | La entrega única |
| Fecha límite | De referencia: se puede rendir después, marcado *fuera de plazo* | Al vencer, ya no se puede empezar |
| Salir a mitad | Lo respondido queda como un intento, y puede volver a rendir | Se entrega lo respondido |
| Pegar texto | Bloqueado (se registra el intento) | Bloqueado (se registra el intento) |

En una evaluación solo por voz, la transcripción no se puede editar y el servidor rechaza una respuesta que el navegador marque como escrita. Es una barrera para el uso normal, no una garantía frente a alguien que modifique la página. Si el navegador no permite dictado (solo funciona bien en Chrome y Edge), la app avisa antes de empezar. `DEMO-01` funciona como una práctica.

El profesor siempre decide la nota. Defiéndelo solo **sugiere un nivel** y entrega la evidencia.

### Diferencia con lo que ya existe
Existen herramientas de evaluación oral con IA (Viva de NYU Stern, Viva de InitialView, FeedbackFruits Oral Assessment, Socratic Mind, Breakout Learning). Todas siguen la lógica de *“la IA examina y el profesor recibe una evaluación”*. Defiéndelo cambia el formato: **el estudiante enseña a un compañero que se equivoca**, y el resultado es **su propio trabajo marcado**, no una nota.

### Qué lo distingue de un chatbot
Un chatbot intercambia mensajes. Defiéndelo es un entorno de simulación con cinco mecánicas que trabajan sobre el propio trabajo del estudiante:

1. **Carlos con cara y voz.** Un avatar vectorial cambia entre 5 estados (`curioso`, `confundido`, `ironico`, `convencido` y `pensando`) y se anima mientras habla con la voz del navegador.
2. **Termómetro de convencimiento.** Una barra de 0 a 100 % sube con cada punto que el estudiante logra explicar (verde suma 1, amarillo 0,45 y rojo 0) y se sacude cuando no logra convencer a Carlos.
3. **Cambio de condición.** Cada punto es una `decisión`, una `trampa` (Carlos sostiene un error a propósito) o una `condición`. En el punto de condición aparece una cinta que avisa de un cambio imprevisto: “¿y si mañana piden avisar por WhatsApp?”.
4. **Detección de inseguridad y de lectura literal.** El navegador detecta muletillas (“creo que”, “tal vez”, “no estoy seguro”, “supongo”) y respuestas que copian el trabajo. Ambas quedan guardadas por punto y como señales para el profesor. En modo simulado, Carlos reacciona a ellas con ironía amistosa.
5. **Anotación sobre el fragmento.** Carlos no habla en abstracto: el documento se desplaza al párrafo en discusión y lo etiqueta con `Duda de Carlos`, `Hipótesis de Carlos` o `Cambio de condición`, más el tema.

### Panel del profesor
Está pensado para entenderse en segundos, sin muros de texto:

- **Resumen:** entregas recibidas con la duración media, cuántos estudiantes quedaron en nivel alto, medio y bajo (en una barra segmentada), cuántas entregas piden revisión y el tema más débil de la clase.
- **Lista:** una fila por estudiante con su nombre, cuatro celdas de color (una por punto), el nivel sugerido y, solo si las hay, el número de alertas.
- **Detalle:** a la izquierda, el trabajo del estudiante marcado en verde, amarillo o rojo; a la derecha, un resumen de una oración y una cita por punto. El diálogo completo con Carlos queda cerrado hasta que el docente lo abre.

Las señales (salidas de la pestaña, intentos de pegar, lectura literal y muletillas) son informativas. La nota final la decide siempre el profesor.

---

## ⚙️ Arquitectura y tecnologías

Monolito modular de 3 capas. Las dependencias van en una sola dirección: `api/` → `modulos/` → `compartido/`.

```
Navegador (public/)
  app.js · js/profesor.js · js/subir.js
  Extrae el texto del .pdf/.docx, dicta por voz y detecta lectura literal
        │ JSON
        ▼
Capa 1 · Entrada HTTP (api/)
  carlos · casos · tareas · intentos · sesiones · documentos · archivos
        │
        ▼
Capa 2 · Lógica de negocio (modulos/)
  defensa · casos · tareas · reportes · documentos · archivos
        │
        ▼
Capa 3 · Infraestructura (compartido/)
  llm.js ──▶ proveedor de IA      almacen.js ──▶ Upstash Redis o memoria
  archivos.js ──▶ Supabase Storage
```

| Componente | Tecnología | Decisión |
|---|---|---|
| Frontend | HTML, CSS y JavaScript sin frameworks | Carga instantánea y cero dependencias para una demo confiable. |
| Subida de trabajos | PDF.js y Mammoth.js en el navegador | El texto se extrae en el cliente; el archivo no pasa por nuestro servidor. |
| Archivos originales | Supabase Storage (bucket privado) | Subida y descarga directas con enlaces firmados de 5 minutos. Es opcional: sin configurarlo, la defensa funciona con el texto. |
| Dictado | Web Speech API (`es-PE`) | Gratis y en el navegador; no se envía audio a nuestro servidor. |
| Voz de Carlos | `speechSynthesis` del navegador | Sin costo; se puede apagar. |
| Backend | Funciones serverless de Vercel sobre Node.js 18+ | Sin dependencias npm; la API key nunca llega al navegador. |
| IA | Adaptador propio; en la demo, Gemini Flash-Lite | El proveedor se cambia con variables de entorno, sin tocar código. |
| Persistencia | Upstash Redis (60 días), con respaldo en memoria | Funciona en Vercel y también en local sin configurar nada. |
| Reportes | `tokenProfesor` por tarea | Protege los reportes sin construir un sistema de cuentas. |
| Pruebas | `node:test` | Se ejecutan con `node --test`, sin instalar nada. |

### Cómo funciona un turno
1. Cada **punto** del caso está atado a un fragmento del trabajo. Carlos abre el punto con una pregunta (y, si corresponde, con un error a propósito) y ese fragmento se resalta.
2. El estudiante responde hablando o escribiendo.
3. El servidor mide qué parte de la respuesta es **copia literal del trabajo** (trigramas de palabras). Si supera el 60 %, se marca como “leyó su trabajo”. También detecta muletillas de duda. Las dos marcas (`leyo` y `dubitativo`) se calculan con `public/js/senales.js`, el mismo archivo que usa el navegador para avisar en vivo, pero las que mande el navegador no cuentan.
4. El backend envía al modelo el trabajo, el punto, lo que una buena explicación debería cubrir (oculto para el estudiante) y la conversación. En una entrega, esa conversación la arma el servidor con lo que registró, no con lo que mande el navegador. El modelo responde **un solo JSON**:
   ```json
   { "nivel": "verde|amarillo|rojo", "motivo": "...", "evidencia": "...", "repreguntar": false, "carlos_dice": "..." }
   ```
5. Si la respuesta fue parcial, Carlos **repregunta una sola vez**. Luego el fragmento se pinta con el nivel y se pasa al siguiente punto.
6. Sin IA configurada, o si la IA falla, el **servidor** evalúa en modo simulado y lo marca en la respuesta (`simulado`, `iaCaida`).

Una sola llamada por turno mantiene el costo en centavos por defensa.

### Cómo se preparan las dudas de un documento
- **Dos prompts distintos.** El trabajo propio de un estudiante se analiza como una resolución. El documento común que deja el profesor (una lectura, un caso) se analiza para comprobar que el estudiante lo entendió.
- **Presupuesto de tiempo.** La IA tiene 26 s en total, dentro de los 30 s de Vercel. Si el primer intento falla y queda tiempo, se reintenta; si la respuesta llegó cortada, el reintento pide campos más breves.
- **Gemini sin "pensamiento".** En los modelos que lo permiten, incluidos los alias `-latest`, se desactiva el razonamiento interno, que gasta el mismo presupuesto de tokens que la respuesta y podía cortar el JSON. Si un modelo no lo admite, se reintenta sin esa opción.
- **Respaldo.** Si aun así la IA no devuelve los 4 puntos, Carlos usa dudas básicas armadas a partir del texto y se muestra un aviso para volver a intentarlo. Nadie queda bloqueado. En los registros del servidor queda la causa: `tiempo`, `red`, `proveedor`, `cortada`, `vacia` o `formato`.

### Cómo se registra una entrega
1. Al pulsar *Empezar* en modo **Entregar**, el navegador pide un intento a `POST /api/intentos`. El servidor rechaza ahí una segunda entrega con el mismo nombre (409) o una tarea cerrada (403), y fija qué trabajo se defiende.
   - **Hay un solo intento vigente por estudiante y tarea.** Si el estudiante ya había respondido algo y vuelve a empezar, se entrega lo que llevaba (marcado como *abandonada*) y no se abre otro. Un intento sin ninguna respuesta sí se puede reemplazar, y el anterior deja de servir.
   - El botón *Salir* entrega en el acto lo respondido. Si el estudiante cierra la pestaña (el navegador avisa antes), la entrega se cierra cuando vuelve a empezar o, si no vuelve, cuando el profesor abre su panel y lleva 20 minutos sin actividad.
   - Si sale mientras Carlos le repregunta, ese punto se entrega con la evaluación de su primera respuesta y queda marcado como *pendiente*.
   - Solo se marca como *abandonada* si quedaron puntos sin responder. Si respondió todo y únicamente falló el envío final, la entrega cuenta como completa.
2. Cada respuesta va a `/api/carlos` con ese intento. El servidor guarda la evaluación de cada punto y no deja volver a evaluarlo: un punto admite una respuesta y, como mucho, una repregunta. Si el navegador repite la petición (por ejemplo, porque se perdió la respuesta), recibe lo que ya se registró.
3. Al terminar, `POST /api/sesiones` solo envía el intento y las señales que únicamente el navegador puede ver (salidas de la pestaña, intentos de pegar y de captura). El reporte del profesor se arma **con lo registrado en el servidor**. Un punto sin registro, por ejemplo porque se evaluó sin conexión, cuenta como rojo y queda marcado para revisión. La entrega se marca de forma atómica: dos cierres simultáneos guardan una sola sesión.

### Seguridad
- Lo que el estudiante debe explicar y los errores a propósito de Carlos **nunca llegan al navegador**: `/api/casos` arma la copia pública con una lista blanca de campos.
- Las respuestas del estudiante se tratan como datos a evaluar, no como instrucciones. Pedirle a Carlos “ponme verde” se califica en rojo.
- **El nivel de cada punto lo decide el servidor**, no el navegador: el reporte se arma con las evaluaciones registradas en el intento (ver *Cómo se registra una entrega*). Mandar a mano un reporte todo en verde no sirve.
- **Los trabajos subidos son privados.** `/api/documentos` devuelve una `llave`, y el trabajo solo se abre con ella (cabecera `x-llave-caso`). También lo abren quien tenga el código de una tarea que lo use como trabajo base, y el profesor, con su token, si su tarea recibió una entrega sobre él. Para crear una tarea sobre un trabajo subido también hace falta su llave. Conocer el id no basta.
- Una entrega solo puede usar un trabajo subido **para esa misma tarea** y con su llave.
- **El trabajo del estudiante entra a los prompts como datos.** Va entre marcas `<<<TRABAJO … TRABAJO>>>` (las marcas que traiga el propio texto se neutralizan) y la IA tiene orden de ignorar cualquier instrucción, "nota para el evaluador" o pauta escrita dentro de él, tanto al generar los puntos como al evaluar cada respuesta. Las dudas del intento anterior, que no deben repetirse, las lee el servidor del caso anterior; el navegador no puede mandar texto propio al prompt. Sin IA, la respuesta de ejemplo de un trabajo subido no da verde, porque la generó la IA a partir de un texto del estudiante.
- **Límites por minuto, por IP y globales**, pensados para que un aula de unas 60 personas detrás de una sola IP funcione sin cortes:

  | Endpoint | Por IP | Global |
  |---|---|---|
  | `/api/carlos` | 240 | 2000 |
  | `/api/intentos` | 120 | 600 |
  | `/api/documentos` (el que más gasta en IA) | 90 | 300 |
  | `/api/archivos` | 90 | 300 |
  | Crear tareas (`POST /api/tareas`) | 10 | 100 |

  Se ajustan con `LIMITE_<NOMBRE>_IP` y `LIMITE_<NOMBRE>_GLOBAL` (por ejemplo, `LIMITE_DOCUMENTOS_GLOBAL=100`). La IP sale de la conexión. `x-forwarded-for` solo se usa en Vercel o con `CONFIAR_PROXY=1`, porque fuera de un proxy de confianza cualquiera puede falsificarla. Los errores crudos del proveedor nunca llegan al cliente.
- **Un estudiante solo puede subir su archivo a una tarea abierta de entrega individual**, con su código. El profesor sube instrucciones, teoría y trabajo base sin código, porque todavía no ha creado la tarea; esas subidas quedan acotadas por los límites de arriba.
- Los reportes exigen el token del profesor en la cabecera `x-token-profesor`, y los tokens se comparan en tiempo constante. `DEMO-01` **no tiene token por defecto**: sus reportes solo se abren si se configura `DEMO_TOKEN_PROFESOR`.
- Saber si un nombre ya entregó ya no se puede consultar sin token: esa comprobación solo ocurre al abrir un intento, que tiene límite por IP.
- El CSV del panel neutraliza las celdas que empiezan con `= + - @`, para que un nombre como `=HYPERLINK(...)` no se ejecute como fórmula en Excel.
- PDF.js se usa con `isEvalSupported: false`, la mitigación oficial de CVE-2024-4367 para la versión 3.11.174.
- `server.js` responde 400 a una dirección malformada y 500 a un error inesperado, en vez de terminar el proceso.
- `DEMO-01` admite entregas ilimitadas, pero solo guarda las últimas 200.

### Estructura
```
api/                  Entrada HTTP: carlos, casos, tareas, intentos, sesiones, documentos, archivos
modulos/defensa/      Prompt de Carlos, evaluación del turno y reintento de JSON
modulos/casos/        Carga y sanitización de casos; datos/ guarda los casos base
modulos/tareas/       Códigos, tokenProfesor y tarea pública
modulos/reportes/     Intentos de entrega, registro de evaluaciones y reporte final
modulos/documentos/   Fragmentación del trabajo y generación de los 4 puntos
modulos/archivos/     Quién puede subir y descargar cada archivo original
compartido/           almacen.js (Redis o memoria), llm.js (proveedores de IA), archivos.js (Supabase Storage) y http.js (errores, saneamiento, secretos y límites por IP)
public/               Pantallas, estilos y lógica del navegador; js/senales.js lo comparten navegador y servidor
tests/                Pruebas de contratos con node:test
server.js             Servidor local sin dependencias
vercel.json           Incluye los casos en las funciones y fija maxDuration
```

---

## 🔗 Demo desplegada

https://defiendelo-six.vercel.app

**Uso:**
1. Como profesor: *Crear tarea* → *Generar código*, y guarda el token. Como estudiante: ingresa ese código (o `DEMO-01`) y tu nombre.
2. Si la tarea lo pide, sube tu `.pdf` o `.docx`. Elige **Ensayar** o **Entregar** y pulsa *Empezar con Carlos*.
3. Carlos te hace una pregunta y resalta la parte de tu trabajo de la que habla.
4. Elige responder **por voz** (en Chrome o Edge) o **por escrito**, explica y pulsa **Responder**. Puedes cambiar de modo durante la conversación.
5. Al final verás tu trabajo marcado. Si entregaste, el profesor lo ve en *Ver reportes* con su código y su token, y desde ahí puede cerrar o reabrir las entregas.

Si la IA no está configurada, la app funciona en **modo simulado**: el botón *Simular respuesta* llena una respuesta de ejemplo y el servidor la evalúa con resultados predefinidos.

---

## ✅ Funcionalidades implementadas

- El profesor crea una tarea y obtiene un código, un enlace para compartir y un token privado.
- Tareas con entrega individual o con un trabajo base común.
- Instrucciones y teoría del curso: hasta 5 archivos por apartado, para leer y descargar.
- Archivos originales guardados en un almacén privado y descargables con enlaces temporales.
- Generación de 4 puntos específicos a partir del texto del trabajo, con IA o con un respaldo sin IA.
- Subida de `.pdf` y `.docx` de hasta 10 MB, o texto pegado, de 50 a 15 000 palabras.
- Flujo completo: código → defensa con Carlos → reporte.
- Modos práctica y evaluación.
- Carlos conducido por IA real, con repregunta y evaluación por punto.
- Dictado por voz y voz de Carlos en el navegador.
- Documento visible con el fragmento señalado y pintado en vivo.
- Reporte con el trabajo marcado, evidencia por punto y nivel sugerido.
- Panel del profesor con entregas, señales, conversación por punto y trabajo marcado.
- Señales de sesión: respuestas leídas del trabajo, salidas de la pestaña, intentos de pegar y de captura.
- Respaldo automático a modo simulado, en el servidor, si la IA falla en medio de la sesión.
- El profesor puede **cerrar y reabrir** las entregas desde su panel. Cerrada, la tarea no acepta entregas nuevas; quien ya había empezado puede terminar.
- Mecánicas interactivas: avatar expresivo, termómetro de convencimiento, cinta de cambio de condición, detección de muletillas y anotación del fragmento en discusión.
- Panel del profesor con resumen de la clase, lista escaneable por estudiante y detalle con el diálogo colapsado.
- Pruebas automáticas de los contratos de la API, de la seguridad y del despliegue.

**Limitaciones actuales**
- **Los PDF escaneados no se leen** porque no hay OCR: hace falta texto seleccionable o un `.docx`.
- **El alcance actual son trabajos de texto**, como informes y ensayos. Carlos no ve imágenes ni diagramas: el original se puede descargar, pero la defensa se basa en el texto extraído.
- **Carlos no usa toda la teoría**: para preparar sus dudas toma los primeros 12 000 caracteres de teoría y 8 000 de instrucciones. El estudiante sí puede leerlas completas.
- **El estudiante entrega un solo archivo** por defensa.
- **Los archivos originales no se borran solos**: a diferencia de los datos en Redis, no expiran a los 60 días.
- **No hay cuentas**: cualquiera con el código entra a la tarea, y el estudiante se identifica solo con su nombre. Por eso, el límite de una entrega se puede evadir escribiendo otro nombre, y el profesor no ve quién falta si no compara con su lista.
- **Salir a mitad de una entrega sí gasta el intento**: se entrega lo respondido. Solo un intento sin ninguna respuesta se puede volver a empezar.
- **Las dudas nuevas solo aplican a trabajos subidos por el estudiante**: en un documento común, cada intento de práctica usa las mismas dudas.
- **La fecha límite se interpreta en la hora del navegador del profesor** y se muestra a cada estudiante en su propia hora local. Además de la fecha, el profesor puede cerrar o reabrir las entregas a mano desde su panel.
- **Un punto evaluado sin conexión no cuenta**: si el navegador no logra hablar con el servidor, el punto queda en rojo y marcado como “sin registro” para que el profesor lo revise.
- **El token del profesor se muestra una sola vez** y no se puede recuperar.
- **Los límites globales son por minuto, no un presupuesto mensual**: protegen contra ráfagas, pero no reemplazan un tope de gasto en la consola del proveedor de IA ni la cuota de Upstash.
- **Carga de librerías cliente**: Los scripts de PDF.js y Mammoth se cargan directamente desde el CDN oficial de cdnjs.
- **Sin Upstash, los datos viven en memoria**: en Vercel pueden perderse cuando la función se reinicia. `DEMO-01` funciona siempre.
- El dictado depende del navegador (funciona en Chrome y Edge; en otros, se escribe).
- Las señales de sesión son alertas para revisar, no prueban nada por sí solas. Ninguna web puede impedir una foto a la pantalla.
- No se graba audio ni video.

---

## 📖 Instrucciones de ejecución

Requisitos: **Node.js 18 o superior**. No hay dependencias que instalar.

```bash
git clone https://github.com/YoeCastroGomez/Defiendelo.git
cd Defiendelo
node server.js           # http://localhost:3000 (funciona en modo simulado sin .env)
node --test              # pruebas, sin red ni .env
```

### Pruebas
`node --test` corre las pruebas sin red, sin `.env` y sin instalar nada: usa el almacén en memoria y un proveedor de IA simulado.

- `tests/contratos.test.js` cubre:
  - el almacén;
  - los endpoints `tareas`, `casos`, `carlos`, `intentos`, `sesiones`, `documentos` y `archivos`;
  - que el reporte salga de lo registrado en el servidor y no de lo que mande el navegador;
  - que los trabajos subidos sean privados;
  - el cierre de tareas;
  - la protección de lo que el estudiante no debe ver (`que_debe_explicar`, `error_de_carlos`, llaves, tokens y rutas de archivos);
  - los tipos de punto, los límites por IP y globales, y que un aula entera detrás de una IP pueda subir sus trabajos;
  - que el trabajo del estudiante entre a los prompts como datos;
  - el intento único (abandono, reemplazo, cierre automático y cierres simultáneos) y el recorte de `DEMO-01`;
  - que una dirección malformada no tumbe `server.js`;
  - el respaldo de Gemini;
  - la configuración de despliegue.
- `tests/entrega.test.js` cubre el límite de una entrega por estudiante.
- `tests/senales.test.js` cubre la detección de lectura literal y de muletillas que usan el navegador y el servidor.

### Configurar la IA
En `.env` (local) o en las variables de entorno de Vercel:

| Variable | Valores |
|---|---|
| `LLM_PROVIDER` | `anthropic`, `openai`, `groq`, `gemini` u `openai-compatible` |
| `LLM_API_KEY` | Clave del proveedor |
| `LLM_MODEL` | Nombre exacto del modelo. Usamos `gemini-flash-lite-latest`: los modelos más lentos pueden superar el tiempo límite al generar los puntos de un documento |
| `LLM_BASE_URL` | Solo para `openai-compatible` |
| `LLM_MODEL_RESPALDO` | Solo para `gemini`: modelo que se usa si `LLM_MODEL` responde 404 (por ejemplo, porque se retiró). Por defecto, `gemini-flash-lite-latest` |

### Reportes de la demo
| Variable | Valor |
|---|---|
| `DEMO_TOKEN_PROFESOR` | Token para ver los reportes de `DEMO-01`. Sin esta variable, esos reportes quedan cerrados |

### Límites de uso (opcional)
| Variable | Valor |
|---|---|
| `LIMITE_<NOMBRE>_IP` / `LIMITE_<NOMBRE>_GLOBAL` | Cambia los límites por minuto (`CARLOS`, `INTENTOS`, `DOCUMENTOS`, `ARCHIVOS`, `TAREAS`). Ver la tabla en *Seguridad* |
| `CONFIAR_PROXY` | `1` para usar `x-forwarded-for` detrás de un proxy propio (en Vercel no hace falta) |

### Guardar los datos (recomendado en Vercel)
Crea una base Redis gratuita en [Upstash](https://upstash.com) y agrega:

| Variable | Valor |
|---|---|
| `UPSTASH_REDIS_REST_URL` | URL REST de la base |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST |

Sin estas variables, los datos se guardan en memoria.

### Guardar los archivos originales (opcional)
Crea un bucket privado en [Supabase](https://supabase.com) con límite de 10 MB y agrega:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_SERVICE_KEY` | Clave secreta del proyecto; nunca llega al navegador |
| `SUPABASE_BUCKET` | Nombre del bucket |

### Desplegar en Vercel
1. Importa el repositorio en Vercel (no necesita configuración de build).
2. Agrega las variables de entorno de arriba.
3. Despliega. El frontend se sirve desde `public/` y los endpoints quedan en `/api/`.

### Agregar un caso base
Crea `modulos/casos/datos/<id>.json` con la misma estructura de `demo.json` (fragmentos del trabajo y puntos con `fragmento`, `apertura`, `error_de_carlos` y `que_debe_explicar`) y agrégalo a `modulos/casos/datos/index.json`. El formulario del profesor ya no ofrece casos base: se usan por API (`casoId`) o para `DEMO-01`.

---

## 💼 Modelo de negocio (resumen)
- **Quién paga:** la universidad, con una licencia por estudiante activo por semestre. El estudiante lo usa gratis.
- **Cómo se entra:** gratis para profesores individuales hasta cierto número de defensas; la licencia se vende cuando varios profesores de una facultad ya lo usan.
- **Costo:** una llamada a la IA por turno y voz procesada en el navegador, del orden de centavos de dólar por defensa.
- **Ingreso secundario:** práctica de sustentación de tesis pagada por el estudiante.
- **Estructura de precios proyectada:** USD 3 por estudiante activo al semestre en universidades privadas, USD 1.50 en públicas y USD 4 para docentes particulares.

## 🚀 Pasos a futuro
Este es un plan, no algo ya logrado. El nicho son los universitarios de Lima.

1. Piloto con estudiantes de la PUCP.
2. Otras universidades de Lima, luego de todo el Perú.
3. Pruebas con colegios.
4. Ecuador y Colombia.

También queremos leer imágenes, diagramas y PDF escaneados, sumar cuentas y hora de cierre, y conectarnos con Classroom.

## 👥 Equipo
- **William:** tareas, almacenamiento, reportes y panel del profesor.
- **Yoe:** defensa con Carlos, protección de casos y seguridad de la IA.
- **Andre:** subida de documentos y generación de puntos.
- **Javier:** infraestructura, pruebas, validación con usuarios y pitch.
