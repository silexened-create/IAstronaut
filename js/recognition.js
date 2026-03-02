import { addMsg, showSpinner, hideSpinner } from './ui.js';
import { speak } from './tts.js';

const BASE_URL = "https://iastronaut.onrender.com";

let modo = "idle";
let preguntaPendiente = "";
let escuchando = false;
let recognitionRunning = false;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const recog = new SR();
recog.lang = "es-MX";
recog.interimResults = false;
recog.continuous = true;

// --- EXPORTACIONES ---
export async function activarEscucha() {
  if (escuchando) return;
  escuchando = true;
  const micBtn = document.getElementById("mic-btn");
  if (micBtn) micBtn.style.background = "#ff4c4c";
  await speak("Canal de telemetría abierto. Diga Houston adelante para iniciar.");
  iniciarReconocimiento();
}

export function desactivarEscucha() {
  escuchando = false;
  modo = "idle";
  const micBtn = document.getElementById("mic-btn");
  if (micBtn) micBtn.style.background = "#208cff";
  detenerReconocimiento();
}

export function iniciarReconocimiento() {
  if (recognitionRunning || modo === "processing" || window.speechSynthesis.speaking) return;
  try { recog.start(); recognitionRunning = true; } catch (e) { }
}

export function detenerReconocimiento() {
  if (!recognitionRunning) return;
  try { recog.stop(); recognitionRunning = false; } catch (e) { }
}

recog.onresult = async (evt) => {
  let text = evt.results[evt.results.length - 1][0].transcript.trim().toLowerCase();
  console.log("🟩 [Señal]:", text);

  if (text.includes("houston adelante") || text.includes("oye astronauta")) {
    modo = "keyword";
    preguntaPendiente = "";
    detenerReconocimiento();
    await speak("Adelante, le escucho.");
    iniciarReconocimiento();
    return;
  }

  if (modo !== "keyword") return;

  // 2. Lógica Inteligente de "Cambio"
  const disparadores = ["cambio", "responde", "envía", "enviar"];
  const contieneDisparador = disparadores.some(d => text.includes(d));

  if (contieneDisparador) {
    // Limpiamos la frase del disparador (ej: "cómo estás cambio" -> "cómo estás")
    let limpia = text;
    disparadores.forEach(d => limpia = limpia.replace(d, ""));

    const mensajeFinal = (preguntaPendiente + " " + limpia).trim();

    if (mensajeFinal.length > 2) {
      console.log("📤 Procesando:", mensajeFinal);
      preguntaPendiente = "";
      modo = "idle";
      procesarEntrada(mensajeFinal);
    }
    return;
  }

  // 3. Acumular si no ha dicho cambio
  preguntaPendiente += " " + text;
  console.log("✍️ Acumulando telemetría:", preguntaPendiente);
};

recog.onend = () => {
  recognitionRunning = false;
  if (escuchando && modo !== "processing" && !window.speechSynthesis.speaking) {
    setTimeout(iniciarReconocimiento, 400);
  }
};

// --- PROCESAR ENTRADA (CORREGIDO EXPORT) ---
export async function procesarEntrada(texto, imagenB64 = null) {
  if (!texto && !imagenB64) return;
  if (modo === "processing") return;
  modo = "processing";
  detenerReconocimiento();
  showSpinner();
  if (texto) addMsg('Tú', texto);

  try {
    const history = (window.conversationHistory || []).map(m => ({
      role: m.who === 'Tú' ? 'user' : 'assistant',
      content: m.texto
    }));

    console.log("🛰️ Conectando con IAstronaut Command Center en Render...");
    const r = await fetch(`${BASE_URL}/proxy.php`, {
      method: "POST",
      mode: 'cors',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: texto, history: history, image: imagenB64 })
    });

    const data = await r.json();
    const respuesta = data.reply || "Sin señal.";
    addMsg('Astronauta', respuesta);

    if (!window.conversationHistory) window.conversationHistory = [];
    window.conversationHistory.push({ who: 'Tú', texto: texto }, { who: 'Astronauta', texto: respuesta });

    await speak(respuesta);
  } catch (err) {
    addMsg("Error", "Fallo de enlace.");
  } finally {
    hideSpinner();
    modo = "idle";
    if (escuchando) iniciarReconocimiento();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById("mic-btn");
  if (btn) btn.addEventListener("click", () => {
    if (!escuchando) activarEscucha();
    else desactivarEscucha();
  });

});

