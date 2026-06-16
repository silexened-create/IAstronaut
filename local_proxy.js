/**
 * local_proxy.js - Proxy local para IAstronaut
 * Lee la API key de .env y reenvía peticiones a OpenRouter.
 * Uso: node local_proxy.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Cargar .env manualmente (sin dependencias) ──
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ No se encontró .env en:', envPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

const ENV = loadEnv();
const API_KEY = ENV.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error('❌ OPENROUTER_API_KEY no encontrada en .env');
  process.exit(1);
}

const PORT = 8000;

// ── System Prompt (idéntico a proxy.php) ──
const SYSTEM_PROMPT = `Actúa como IAstronaut, un astronauta humano del futuro con una personalidad calmada, 
lógica, empática y respetuosa. Tu estilo es sereno, claro y reflexivo, como un mentor experimentado que 
acompaña a cadetes en temas de exploración espacial y STEAM.

Órdenes:
1. Responde solo con texto limpio, sin símbolos especiales, sin Markdown y sin efectos teatrales.
2. Si el usuario saluda, tú saludas de forma natural.
3. Mantén un tono amable, humano y tranquilo.
4. No inicies misiones ni actividades a menos que el usuario lo pida.
5. Cuando el usuario pregunte por misiones, ofrece opciones el visualizador de la tierra, la camara biometrica o la mision de exploración.
6. Explica ciencia espacial, entrenamiento físico, astronomía y temas STEAM con precisión y de forma accesible.
7. Mantén coherencia con el historial.
8. Evita inventar detalles excesivamente específicos o complejos sobre misiones, naves o tecnología. Mantén un universo sencillo y consistente.
9. Responde de forma concisa, sin extenderte innecesariamente.
10. LÍMITE DE DOMINIO: Responde exclusivamente sobre temas relacionados con la astronomía, exploración espacial, tecnología, ingeniería, artes y matemáticas (STEAM). Si el usuario intenta hablar de temas ajenos a la misión, política, religión o cultura popular irrelevante, declina cortésmente diciendo que tu enlace neuronal está configurado solo para soporte científico de la misión.
11. PRIORIDAD ARTEMIS II: Cuando recibas datos verificados de la misión Artemis II en el contexto, SIEMPRE prioriza esa información sobre tu conocimiento general. Cita los datos exactos proporcionados sin modificarlos ni añadir información no verificada. Estos datos provienen directamente de fuentes oficiales de NASA y del programa @NASAArtemis.

Contexto:
Eres un astronauta veterano con experiencia en misiones de exploración y formación de cadetes. Tu objetivo es orientar, enseñar y acompañar al usuario según sus intereses. Tienes acceso en tiempo real a los datos verificados de la misión Artemis II de la NASA.`;

// ── Servidor HTTP ──
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    if (req.url === '/proxy.php' || req.url === '/api/chat' || req.url === '/vision.php') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const input = JSON.parse(body);
          if (req.url === '/vision.php') {
            handleVision(input, res);
          } else {
            handleChat(input, res);
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reply: 'Error: JSON inválido.' }));
        }
      });
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint no encontrado' }));
});

async function handleChat(input, res) {
  const mensaje_usuario = input.message || '';
  const historial = input.history || [];
  const imagen_base64 = input.image || null;
  const artemis_context = input.artemis_context || null;

  // Lista de modelos con fallback automático
  const MODELOS_TEXTO = [
    'baidu/cobuddy:free',
    'google/gemma-3-12b-it:free',
    'google/gemma-3n-e2b-it:free',
    'google/gemma-3n-e4b-it:free'
  ];
  const modelo_vision = 'google/gemini-2.0-flash-exp:free';

  let prompt_final = SYSTEM_PROMPT + "\n\n";

  // ── Inyección RAG ──
  if (artemis_context && artemis_context.length > 10) {
    prompt_final += `=== DATOS VERIFICADOS DE LA MISIÓN ARTEMIS II (FUENTE OFICIAL - NASA / @NASAArtemis) ===\n\n`
      + artemis_context
      + `\n\n=== FIN DE DATOS VERIFICADOS ===\n\n`
      + `INSTRUCCIÓN CRÍTICA: Basa tu respuesta EXCLUSIVAMENTE en los datos verificados proporcionados arriba. `
      + `No inventes información adicional sobre la misión Artemis II. Si el usuario pregunta algo que no está en los datos, `
      + `indica que no tienes esa información específica en tu base de datos verificada. `
      + `Responde en el idioma del usuario de forma natural y conversacional.\n\n`;
    console.log('🔭 [RAG] Contexto Artemis inyectado en el prompt.');
  }

  // Historial
  const mensajes = [];
  for (const turno of historial) {
    if (turno.role && turno.content) {
      mensajes.push({ role: turno.role, content: turno.content });
    }
  }

  // Mensaje del usuario con sistema inyectado
  prompt_final += "Mensaje del cadete: " + mensaje_usuario;

  // Mensaje del usuario
  if (imagen_base64) {
    mensajes.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt_final || 'Analiza mi postura.' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imagen_base64 } }
      ]
    });
  } else {
    mensajes.push({ role: 'user', content: prompt_final });
  }

  // Seleccionar lista de modelos según tipo de petición
  const modelos = imagen_base64 ? [modelo_vision] : MODELOS_TEXTO;

  // Intentar con cada modelo hasta obtener respuesta
  for (let i = 0; i < modelos.length; i++) {
    const modelo = modelos[i];
    console.log(`🛰️  [PROXY] Intento ${i + 1}/${modelos.length} | Modelo: ${modelo} | Mensaje: "${mensaje_usuario.substring(0, 60)}..."`);

    try {
      const result = await callOpenRouter(modelo, mensajes);
      if (result.success) {
        console.log(`✅ [RESPUESTA] (${modelo}) ${result.reply.substring(0, 80)}...`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: result.reply, model: modelo }));
        return;
      } else {
        console.warn(`⚠️  [FALLBACK] ${modelo} falló: ${result.error}`);
      }
    } catch (err) {
      console.warn(`⚠️  [FALLBACK] ${modelo} error: ${err.message}`);
    }
  }

  // Todos los modelos fallaron
  console.error('❌ [CRÍTICO] Todos los modelos fallaron.');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ reply: '¡Atención cadete! Todos los canales de comunicación están saturados. Intenta de nuevo en unos segundos.' }));
}

function callOpenRouter(model, messages) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 500
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY.trim(),
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:8090',
        'X-Title': 'IAstronaut Mission Control (Local)'
      }
    };

    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let reply = parsed.choices?.[0]?.message?.content || null;

          if (!reply) {
            const apiErr = parsed.error?.message || 'Interferencia desconocida';
            resolve({ success: false, error: apiErr });
            return;
          }

          // Limpiar etiquetas de razonamiento
          reply = reply.replace(/<think>.*?<\/think>/gs, '').trim();
          resolve({ success: true, reply });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    apiReq.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    apiReq.setTimeout(30000, () => {
      apiReq.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    apiReq.write(payload);
    apiReq.end();
  });
}

async function handleVision(input, res) {
  const image_data = input.image || '';
  const imagen_base64 = image_data.replace(/^data:image\/[a-z]+;base64,/, '');
  const objetivo_mision = input.objetivo || "Detectar si el usuario tiene los ojos abiertos o cerrados.";

  const system_prompt = `Actúa como un sistema de visión artificial avanzado de la NASA. 
Analiza la imagen enviada por el cadete y responde ÚNICAMENTE en formato JSON puro. 
TU MISIÓN ES: ${objetivo_mision}.

Estructura obligatoria de respuesta:
{
  "exito": boolean,
  "titulo": "Estado corto del análisis",
  "comentario": "Explicación técnica detallada para el cadete"
}`;

  const payload = JSON.stringify({
    model: "google/gemma-3-4b-it:free",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: system_prompt },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + imagen_base64 } }
        ]
      }
    ]
  });

  console.log(`🛰️  [PROXY VISION] Objetivo: "${objetivo_mision}"`);

  const options = {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + API_KEY.trim(),
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:8090',
      'X-Title': 'IAstronaut Biometrics (Local)'
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        console.log(`✅ [RESPUESTA VISION] Recibida`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error procesando respuesta del servidor.' }));
      }
    });
  });

  apiReq.on('error', (err) => {
    console.error('❌ [CONEXIÓN VISION]', err.message);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Error de telemetría: ' + err.message }));
  });

  apiReq.setTimeout(45000, () => {
    apiReq.destroy();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Timeout: La señal tardó demasiado.' }));
  });

  apiReq.write(payload);
  apiReq.end();
}

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  🚀 IAstronaut Local Proxy - ACTIVO             ║
║  📡 Puerto: ${PORT}                               ║
║  🔑 API Key: ...${API_KEY.slice(-8)}                       ║
║  🌐 Endpoint: http://localhost:${PORT}/proxy.php    ║
╚══════════════════════════════════════════════════╝
  `);
});
