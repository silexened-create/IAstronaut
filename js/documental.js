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

// --- ESTADO GLOBAL ---
let missionChapters = [];
let currentChapterIndex = 0;
let historialDocumental = [];
let isAutoScrolling = false;

const imagesMap = {
    "Introducción": "solar_system.gif",
    "El Sol": "sol.gif",
    "Mercurio": "mercurio.gif",
    "Venus": "venus.gif",
    "La Tierra": "tierra.gif",
    "Marte": "marte.gif",
    "Cinturón de asteroides": "cinturón_de_asteroides.gif",
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
        missionChapters = data.capitulos;
        console.log(`✅ [DATOS] Sincronizando ${missionChapters.length} capítulos.`);

        // Limpiar UI
        elements.menuPlanetas.innerHTML = '<h3>📍 BITÁCORA DE MISIÓN</h3>';
        elements.txtContainer.innerHTML = '';

        missionChapters.forEach((cap, index) => {
            // Crear Botón de Capítulo (Estilo Playlist)
            const btn = document.createElement('button');
            btn.className = 'btn-destino';
            btn.style.width = '100%';
            btn.style.marginBottom = '5px';
            btn.innerHTML = `🚀 ${cap.titulo}`;
            btn.onclick = () => loadChapter(index);
            elements.menuPlanetas.appendChild(btn);

            // Inyectar Spans de Transcripción (Agrupados por capítulo)
            const capDiv = document.createElement('div');
            capDiv.id = `cap-text-${index}`;
            capDiv.style.display = 'none';
            capDiv.className = 'capitulo-transcripcion';

            cap.segmentos.forEach(seg => {
                seg.words.forEach(word => {
                    const span = document.createElement('span');
                    span.className = 'palabra';
                    span.innerText = word.w;
                    span.dataset.start = word.s; // Estos ya vienen en base-cero desde el JSON corregido
                    span.dataset.end = word.e;
                    capDiv.appendChild(span);
                });
            });
            elements.txtContainer.appendChild(capDiv);
        });

        injectUtilityButtons();
        initSyncEngine();

        // Cargar primer capítulo por defecto sin reproducir
        loadChapter(0, false);

    } catch (err) {
        console.error("❌ [CRÍTICO] Datos de Misión Inaccesibles:", err);
    }
}

/**
 * CARGA UN CAPÍTULO ESPECÍFICO (SEGMENTO DE AUDIO)
 */
function loadChapter(index, autoPlay = true) {
    if (index < 0 || index >= missionChapters.length) return;

    currentChapterIndex = index;
    const cap = missionChapters[index];

    console.log(`📡 [MISIÓN] Cambiando a: ${cap.titulo} -> ${cap.audio_source}`);

    // Actualizar Audio
    elements.audio.src = cap.audio_source;
    elements.audio.load();

    // Actualizar UI
    updateVisualAssets(cap.titulo);

    // Mostrar solo la transcripción del capítulo actual
    document.querySelectorAll('.capitulo-transcripcion').forEach(div => div.style.display = 'none');
    const targetDiv = document.getElementById(`cap-text-${index}`);
    if (targetDiv) targetDiv.style.display = 'block';

    // Resaltar botón activo en el menú
    document.querySelectorAll('#menu-planetas .btn-destino').forEach((btn, i) => {
        btn.classList.toggle('activo', i === index);
    });

    if (autoPlay) {
        elements.audio.play();
    }
}

function injectUtilityButtons() {
    const navContainer = document.createElement('div');
    navContainer.style.marginTop = '20px';
    navContainer.style.display = 'flex';
    navContainer.style.flexDirection = 'column';
    navContainer.style.gap = '10px';

    const btnEarth = document.createElement('button');
    btnEarth.className = 'iastronaut-btn';
    btnEarth.style.borderColor = 'var(--earth-blue)';
    btnEarth.innerHTML = '🌍 TIERRA EN VIVO';
    btnEarth.onclick = () => location.href = 'earth_viewer.html';

    const btnHub = document.createElement('button');
    btnHub.className = 'iastronaut-btn';
    btnHub.style.borderColor = '#ff3c3c';
    btnHub.innerHTML = '🏠 CONTROL CENTRAL';
    btnHub.onclick = () => {
        elements.audio.pause();
        location.href = 'astronauta.html';
    };

    navContainer.appendChild(btnEarth);
    navContainer.appendChild(btnHub);
    elements.menuPlanetas.appendChild(navContainer);
}

/**
 * 2. MOTOR DE RESALTADO Y AUTO-ADVANCE (ZERO-BASE)
 */
function initSyncEngine() {
    elements.audio.ontimeupdate = () => {
        // CERO-BASE: Ya no sumamos inicio_seg porque los archivos y el JSON están sincronizados a 0
        const now = elements.audio.currentTime;
        const currentCapDiv = document.getElementById(`cap-text-${currentChapterIndex}`);
        if (!currentCapDiv) return;

        const spans = currentCapDiv.querySelectorAll('.palabra');

        spans.forEach(span => {
            const start = parseFloat(span.dataset.start);
            const end = parseFloat(span.dataset.end);

            if (now >= start && now <= end) {
                if (!span.classList.contains('highlight-word')) {
                    currentCapDiv.querySelectorAll('.highlight-word').forEach(el => el.classList.remove('highlight-word'));
                    span.classList.add('highlight-word');
                    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });
    };

    // AUTO-PLAY CHAIN: Al terminar el audio, cargar el siguiente segmento
    elements.audio.onended = () => {
        console.log(`🏁 [FIN] Segmento terminado: ${missionChapters[currentChapterIndex].titulo}`);
        if (currentChapterIndex + 1 < missionChapters.length) {
            console.log("🚀 [AUTO-ADVANCE] Cargando siguiente etapa...");
            loadChapter(currentChapterIndex + 1);
        } else {
            console.log("🏁 [MISIÓN] Documental finalizado.");
        }
    };
}

function updateVisualAssets(title) {
    elements.tituloCap.innerText = title;
    const imgFile = imagesMap[title] || "solar_system.gif";
    elements.gifPlaneta.src = `Image/${imgFile}`;
}

/**
 * 3. INTERFAZ DE IA (CONTROL DE MISIÓN) - CONTEXTO MODULAR
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

    // Contexto basado en el segmento actual (tiempo relativo)
    const topic = missionChapters[currentChapterIndex].titulo;
    const relativeTime = elements.audio.currentTime.toFixed(2);

    // Extraer fragmento de texto reciente del capítulo actual
    const currentCapDiv = document.getElementById(`cap-text-${currentChapterIndex}`);
    const recentWords = Array.from(currentCapDiv.querySelectorAll('.palabra'))
        .filter(s => parseFloat(s.dataset.end) <= elements.audio.currentTime)
        .slice(-30)
        .map(s => s.innerText.trim())
        .join(" ");

    const context = `Estamos en ${topic}. Telemetría reciente (T+${relativeTime}s): "...${recentWords}"`;
    const prompt = `Rol: Control de Misión IAstronauta. Contexto: ${context}. Pregunta del Cadete: "${question}". Responde como una IA espacial. Sé conciso y educativo.`;

    try {
        const BACKEND_URL = "http://iastronaut-api.ct.ws";
        const response = await fetch(`${BACKEND_URL}/api/proxy.php`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: prompt,
                history: historialDocumental
            })
        });

        if (!response.ok) throw new Error(`Pérdida de señal: ${response.status}`);
        const data = await response.json();

        const loadEl = document.getElementById(loadingId);
        if (loadEl) loadEl.remove();
        
        // Ajustamos para leer 'reply' que es lo que envía tu proxy.php
        const respuestaTexto = data.reply || "Interferencia detectada en el enlace neuronal.";
        
        elements.chatDisplay.innerHTML += `<div class="chat-msg ai-msg"><b>IASTRONAUTA:</b> ${respuestaTexto}</div>`;
        elements.chatDisplay.scrollTop = elements.chatDisplay.scrollHeight;
        
        await speak(respuestaTexto);
        
        historialDocumental.push({ role: "user", content: question });
        historialDocumental.push({ role: "assistant", content: respuestaTexto });

    } catch (err) {
        console.error("Error de Comms de IA:", err);
        const loadEl = document.getElementById(loadingId);
        if (loadEl) loadEl.innerHTML = `<span style="color:#ff3c3c">> INTERFERENCIA DETECTADA</span>`;
    }
}

// --- EXPORTACIÓN DE GLOBALES E INIT ---
window.procesarPregunta = processQuestion;
window.saltarA = (index) => loadChapter(index);


document.addEventListener('DOMContentLoaded', loadMissionLog);
