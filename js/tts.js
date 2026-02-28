/**
 * tts.js - Motor de voz de IAstronaut
 * Configuración: Google español de Estados Unidos (Voz Femenina)
 */
import { showSpinner, hideSpinner } from './ui.js';

let synth = window.speechSynthesis;
let currentUtterance = null;

/**
 * Función principal para que el Astronauta hable.
 * Devuelve una Promesa que se resuelve cuando la locución termina.
 */
export async function speak(text) {
  if (!text) return Promise.resolve();

  // 1. Limpieza profunda de texto (Markdown y etiquetas de pensamiento)
  const cleanText = text.replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/<think>.*?<\/think>/gs, '') // Elimina lo que la IA "piensa" en silencio
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 2. Control de flujo: Detener cualquier voz activa antes de empezar
  if (synth.speaking) {
    synth.cancel();
    // Pequeña pausa tras cancelar para limpiar el buffer del navegador
    await new Promise(r => setTimeout(r, 50));
  }

  return new Promise((resolve) => {
    currentUtterance = new SpeechSynthesisUtterance(cleanText);

    /**
     * CONFIGURACIÓN DE PERSONALIDAD
     * rate: 1.15 (Ajustado de 1.3 a 1.15 para que no suene acelerado y se entienda mejor)
     * pitch: 1.1 (Tono femenino claro)
     */
    currentUtterance.lang = 'es-US';
    currentUtterance.rate = 1.15;
    currentUtterance.pitch = 1.1;

    // 3. Selección de la voz específica
    const setVoice = () => {
      const voices = synth.getVoices();
      const selectedVoice = voices.find(v => v.name.includes('Google español de Estados Unidos'))
        || voices.find(v => v.name.includes('Google') && v.lang.includes('es'))
        || voices.find(v => v.lang.includes('es-US'))
        || voices.find(v => v.lang.includes('es'));

      if (selectedVoice) {
        currentUtterance.voice = selectedVoice;
      }
    };

    setVoice();
    // Si las voces aún no cargan (común en Chrome), esperamos a que cambien
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = setVoice;
    }

    // 4. Eventos de la locución
    currentUtterance.onstart = () => {
      console.log("🔊 [TTS] IAstronaut transmitiendo mensaje de audio...");
    };

    currentUtterance.onend = () => {
      console.log("🤫 [TTS] Transmisión finalizada.");
      currentUtterance = null;
      resolve(); // Crucial para que el recognition.js sepa que puede volver a escuchar
    };

    currentUtterance.onerror = (event) => {
      console.error("❌ [TTS] Error en la síntesis de voz:", event.error);
      currentUtterance = null;
      resolve(); // Resolvemos siempre para no dejar el sistema "congelado"
    };

    // 5. Ejecutar
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