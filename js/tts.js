/**
 * tts.js - Motor de voz adaptativo de IAstronaut
 * Selecciona automáticamente la mejor voz femenina disponible
 * según la plataforma (Desktop Chrome, Android, iOS, etc.)
 */
import { showSpinner, hideSpinner } from './ui.js';

let synth = window.speechSynthesis;
let currentUtterance = null;
let cachedBestVoice = null;

// ── Palabras clave para detectar voces femeninas ──
const FEMALE_KEYWORDS = [
  'female', 'mujer', 'femenin', 'helena', 'paulina', 'sabina',
  'mónica', 'monica', 'laura', 'lucia', 'lucía', 'elena',
  'joana', 'conchita', 'penélope', 'penelope', 'lupe',
  'miren', 'ines', 'inés', 'elvira', 'angelica', 'angélica',
  'rosa', 'maria', 'maría', 'carmen', 'nerea', 'silvia',
  'google', 'samantha', 'karen', 'tessa', 'zira', 'sabrina',
  'microsoft helena', 'microsoft sabina', 'microsoft laura'
];

// ── Motores de alta calidad (menos robóticos) ──
const QUALITY_ENGINES = [
  'google', 'microsoft', 'apple', 'samsung', 'eloquence',
  'enhanced', 'premium', 'natural', 'neural', 'wavenet'
];

/**
 * Puntúa una voz según criterios de calidad, género e idioma.
 * Mayor puntaje = mejor voz para IAstronaut.
 */
function scoreVoice(voice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;

  // ── Idioma (máxima prioridad) ──
  if (lang === 'es-us') score += 50;
  else if (lang === 'es-mx') score += 45;
  else if (lang.startsWith('es-')) score += 40;
  else if (lang.startsWith('es')) score += 35;
  else return 0; // Descartamos voces que no sean español

  // ── Género femenino ──
  if (FEMALE_KEYWORDS.some(kw => name.includes(kw))) score += 30;

  // ── Motor de alta calidad ──
  if (QUALITY_ENGINES.some(eng => name.includes(eng))) score += 20;

  // ── Voces de red (generalmente más naturales que las locales) ──
  if (!voice.localService) score += 10;

  // ── Bonus especial para voces conocidas de alta calidad ──
  if (name.includes('google español de estados unidos')) score += 25;
  if (name.includes('microsoft sabina')) score += 15;
  if (name.includes('paulina')) score += 15;
  if (name.includes('google') && lang.startsWith('es')) score += 15;

  return score;
}

/**
 * Selecciona la mejor voz disponible.
 * Se ejecuta cada vez que las voces cambian o se necesitan.
 */
function pickBestVoice() {
  const voices = synth.getVoices();
  if (!voices.length) return null;

  let bestScore = -1;
  let bestVoice = null;

  for (const voice of voices) {
    const s = scoreVoice(voice);
    if (s > bestScore) {
      bestScore = s;
      bestVoice = voice;
    }
  }

  if (bestVoice) {
    console.log(`🎙️ [TTS] Voz seleccionada: "${bestVoice.name}" (${bestVoice.lang}) | Puntuación: ${bestScore} | Local: ${bestVoice.localService}`);
  }

  cachedBestVoice = bestVoice;
  return bestVoice;
}

// Pre-cargar voces (Android/Chrome cargan las voces de forma asíncrona)
pickBestVoice();
if (synth.onvoiceschanged !== undefined) {
  synth.onvoiceschanged = () => {
    pickBestVoice();
  };
}

/**
 * Función principal para que el Astronauta hable.
 * Devuelve una Promesa que se resuelve cuando la locución termina.
 */
export async function speak(text) {
  if (!text) return Promise.resolve();

  // 1. Limpieza profunda de texto (Markdown y etiquetas de pensamiento)
  const cleanText = text.replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/<think>.*?<\/think>/gs, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanText) return Promise.resolve();

  // 2. Control de flujo: Detener cualquier voz activa antes de empezar
  if (synth.speaking) {
    synth.cancel();
    await new Promise(r => setTimeout(r, 100));
  }

  return new Promise((resolve) => {
    currentUtterance = new SpeechSynthesisUtterance(cleanText);

    // 3. Seleccionar la mejor voz disponible
    const voice = cachedBestVoice || pickBestVoice();

    if (voice) {
      currentUtterance.voice = voice;
      currentUtterance.lang = voice.lang;
    } else {
      currentUtterance.lang = 'es-US';
    }

    // 4. Ajustar tono y velocidad según el tipo de dispositivo
    //    En móvil las voces locales tienden a sonar más rápidas,
    //    así que bajamos la velocidad un poco.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    currentUtterance.rate = isMobile ? 1.35 : 1.50;
    currentUtterance.pitch = 1.1;

    // 5. Eventos de la locución
    currentUtterance.onstart = () => {
      console.log("🔊 [TTS] IAstronaut transmitiendo mensaje de audio...");
    };

    currentUtterance.onend = () => {
      console.log("🤫 [TTS] Transmisión finalizada.");
      currentUtterance = null;
      resolve();
    };

    currentUtterance.onerror = (event) => {
      // 'interrupted' y 'canceled' no son errores reales
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        console.error("❌ [TTS] Error en la síntesis de voz:", event.error);
      }
      currentUtterance = null;
      resolve();
    };

    // 6. Workaround: Chrome tiene un bug donde utterances largas se cortan
    //    a los ~15 segundos. Usamos un timer de "keep-alive" para mantenerlo.
    let keepAlive;
    if ('chrome' in window) {
      keepAlive = setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        } else {
          clearInterval(keepAlive);
        }
      }, 12000);

      const origOnEnd = currentUtterance.onend;
      currentUtterance.onend = (e) => {
        clearInterval(keepAlive);
        origOnEnd(e);
      };
      const origOnError = currentUtterance.onerror;
      currentUtterance.onerror = (e) => {
        clearInterval(keepAlive);
        origOnError(e);
      };
    }

    // 7. Ejecutar
    synth.speak(currentUtterance);
  });
}

/**
 * Detiene la voz inmediatamente
 */
export function stopSpeaking() {
  if (synth.speaking) {
    synth.cancel();
  }
}
