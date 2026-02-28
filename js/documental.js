/**
 * js/documental.js - MOTOR DE TRANSCRIPCIÓN DE BITÁCORA DE MISIÓN
 * Implementación de Tecnólogo Creativo
 */
import { speak } from './tts.js';

console.log("🚀 [SISTEMA] Inicializando Motor de Bitácora de Misión...");

// --- ELEMENTOS DEL DOM ---
const elements = {
    audio: document.getElementById('audio-doc'),
    txtContainer: document.getElementById('contenedor-texto'),
    gifPlaneta: document.getElementById('planeta-gif'),
    tituloCap: document.getElementById('titulo-capitulo'),
    chatDisplay: document.getElementById('chat-ia'),
    preguntaInput: document.getElementById('pregunta-input'),
    menuPlanetas: document.getElementById('menu-planetas')
};

let historialDocumental = [];
let isAutoScrolling = false;

const imagesMap = {
    "Introducción": "solar_system.gif",
    "El Sol": "sol.gif",
    "Mercurio": "mercurio.gif",
    "Venus": "venus.gif",
    "La Tierra": "tierra.gif",
    "Marte": "marte.gif",
    "Cinturón de Asteroides": "cinturón_de_asteroides.gif",
    "Júpiter": "jupiter.gif",
    "Saturno": "saturno.png",
    "Urano": "urano.png",
    "Neptuno": "neptuno.png",
    "Plutón": "pluton.gif",
    "Más allá": "mas_alla.gif",
    "Cinturón de Kuiper": "kuiper_belt.png"
};

/**
 * 1. CARGAR DATOS Y GENERAR TRANSCRIPCIÓN
 */
async function loadMissionLog() {
    console.log("📂 [FETCH] Accediendo a Telemetría de Misión...");
    try {
        const res = await fetch('sistema_solar_data.json?v=' + Date.now());
        if (!res.ok) throw new Error(`Status: ${res.status}`);

        const data = await res.json();
        console.log(`✅ [DATOS] Sincronizando ${data.capitulos.length} capítulos.`);

        // Limpiar UI
        elements.menuPlanetas.innerHTML = '<h3>📍 BITÁCORA DE MISIÓN</h3>';
        elements.txtContainer.innerHTML = '';

        data.capitulos.forEach(cap => {
            // Crear Botón de Capítulo
            const btn = document.createElement('button');
            btn.className = 'iastronaut-btn';
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.style.marginBottom = '5px';
            btn.innerHTML = `🚀 ${cap.titulo}`;
            btn.onclick = () => jumpTo(cap.inicio_seg, cap.titulo);
            elements.menuPlanetas.appendChild(btn);

            // Inyectar Spans de Transcripción
            cap.segmentos.forEach(seg => {
                const segmentWrapper = document.createElement('div');
                segmentWrapper.className = 'segment-log';
                segmentWrapper.style.marginBottom = '20px';

                seg.words.forEach(word => {
                    const span = document.createElement('span');
                    span.className = 'palabra';
                    span.innerText = word.w;
                    span.dataset.start = word.s;
                    span.dataset.end = word.e;
                    span.dataset.cap = cap.titulo;
                    elements.txtContainer.appendChild(span);
                });
            });
        });

        // Añadir Botones Secundarios del Hub
        injectUtilityButtons();

        // Iniciar Motor de Resaltado
        initSyncEngine();

    } catch (err) {
        console.error("❌ [CRÍTICO] Datos de Misión Inaccesibles:", err);
    }
}

function injectUtilityButtons() {
    const btnEarth = document.createElement('button');
    btnEarth.className = 'iastronaut-btn';
    btnEarth.style.marginTop = '20px';
    btnEarth.style.borderColor = 'var(--earth-blue)';
    btnEarth.innerHTML = '🌍 TIERRA EN VIVO';
    btnEarth.onclick = () => location.href = 'earth_viewer.html';
    elements.menuPlanetas.appendChild(btnEarth);

    const btnHub = document.createElement('button');
    btnHub.className = 'iastronaut-btn';
    btnHub.style.marginTop = '10px';
    btnHub.style.borderColor = '#ff3c3c';
    btnHub.innerHTML = '🏠 CONTROL CENTRAL';
    btnHub.onclick = () => {
        elements.audio.pause();
        location.href = 'astronauta.html';
    };
    elements.menuPlanetas.appendChild(btnHub);
}

/**
 * 2. MOTOR DE RESALTADO EN TIEMPO REAL Y AUTO-SCROLL
 */
function initSyncEngine() {
    console.log("🛰️ [SISTEMA] Sincronizando Transcripción Neuronal...");

    elements.audio.ontimeupdate = () => {
        const now = elements.audio.currentTime;
        const spans = elements.txtContainer.querySelectorAll('.palabra');
        let currentChapter = "";

        spans.forEach(span => {
            const start = parseFloat(span.dataset.start);
            const end = parseFloat(span.dataset.end);

            if (now >= start && now <= end) {
                if (!span.classList.contains('highlight-word')) {
                    // Quitar resaltados previos
                    elements.txtContainer.querySelectorAll('.highlight-word').forEach(el => el.classList.remove('highlight-word'));

                    // Añadir nuevo resaltado
                    span.classList.add('highlight-word');

                    // AUTO-SCROLL
                    span.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
                currentChapter = span.dataset.cap;
            }
        });

        // Sincronizar Título y Activos Visuales
        if (currentChapter && elements.tituloCap.innerText !== currentChapter) {
            updateVisualAssets(currentChapter);
        }
    };
}

function jumpTo(seconds, title) {
    elements.audio.currentTime = seconds;
    elements.audio.play();
    updateVisualAssets(title);
}

function updateVisualAssets(title) {
    elements.tituloCap.innerText = title;
    const imgFile = imagesMap[title] || "solar_system.gif";
    elements.gifPlaneta.src = `Image/${imgFile}`;

    // Resaltar botón activo
    document.querySelectorAll('#menu-planetas .iastronaut-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(title));
    });
}

/**
 * 3. INTERFAZ DE IA (CONTROL DE MISIÓN)
 */
async function processQuestion() {
    const question = elements.preguntaInput.value.trim();
    if (!question) return;

    elements.audio.pause();
    elements.chatDisplay.innerHTML += `<div class="chat-msg user-msg"><b>COMANDANTE:</b> ${question}</div>`;

    const loadingId = `load-${Date.now()}`;
    elements.chatDisplay.innerHTML += `<div id="${loadingId}" class="chat-msg ai-msg pulse">> CONECTANDO CON CONTROL DE MISIÓN...</div>`;
    elements.preguntaInput.value = "";
    elements.chatDisplay.scrollTop = elements.chatDisplay.scrollHeight;

    // Extracción de Contexto (Últimas 30 palabras)
    const now = elements.audio.currentTime;
    const recentWords = Array.from(elements.txtContainer.querySelectorAll('.palabra'))
        .filter(s => parseFloat(s.dataset.end) <= now)
        .slice(-30)
        .map(s => s.innerText.trim())
        .join(" ");

    const context = recentWords ? `Telemetría Reciente: "...${recentWords}"` : "Inicio de misión.";

    const prompt = `Rol: Control de Misión IAstronauta. Contexto: ${elements.tituloCap.innerText}. ${context}. Pregunta del Cadete: "${question}". Responde como una IA espacial servicial. Sé conciso y educativo.`;

    try {
        const BACKEND_URL = "https://iastronaut-backend.onrender.com"; // CAMBIAR POR URL REAL DE RENDER
        const response = await fetch(`${BACKEND_URL}/proxy.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: prompt,
                history: historialDocumental
            })
        });

        if (!response.ok) throw new Error(`Pérdida de señal: ${response.status}`);
        const data = await response.json();

        document.getElementById(loadingId).remove();
        elements.chatDisplay.innerHTML += `<div class="chat-msg ai-msg"><b>IASTRONAUTA:</b> ${data.reply}</div>`;
        elements.chatDisplay.scrollTop = elements.chatDisplay.scrollHeight;

        await speak(data.reply);

        historialDocumental.push({ role: "user", content: question });
        historialDocumental.push({ role: "assistant", content: data.reply });

    } catch (err) {
        console.error("Error de Comms de IA:", err);
        const loadEl = document.getElementById(loadingId);
        if (loadEl) loadEl.innerHTML = `<span style="color:#ff3c3c">> INTERFERENCIA DETECTADA: NO SE PUEDE SINCRONIZAR</span>`;
    }
}

// --- EXPORTACIÓN DE GLOBALES E INIT ---
window.procesarPregunta = processQuestion;
window.saltarA = jumpTo;

document.addEventListener('DOMContentLoaded', loadMissionLog);