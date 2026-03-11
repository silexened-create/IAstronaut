import { speak } from './tts.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const BASE_URL = "https://iastronaut.onrender.com";

console.log("🚀 [SISTEMA] Inicializando Motor de Bitácora de Misión...");

// --- ELEMENTOS DEL DOM ---
const elements = {
    audio: document.getElementById('audio-doc'),
    txtContainer: document.getElementById('contenedor-texto'),
    gifPlaneta: document.getElementById('planeta-gif'),
    tituloCap: document.getElementById('titulo-capitulo'),
    chatDisplay: document.getElementById('chat-ia'),
    preguntaInput: document.getElementById('pregunta-input'),
    menuPlanetas: document.getElementById('menu-planetas'),
    hamburger: document.getElementById('hamburger-menu'),
    indiceContainer: document.querySelector('.indice-navegacion')
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

// --- WEBXR STATE & MAPS ---
let scene, camera, renderer;
let currentPlanetModel = null;
let planetGroup;
let starField, starVerticesBase;
let vrHUD;
let instructionsVisible = true;
let controller1, controller2;
let prevButtonState = { A: false, B: false, X: false, Y: false };
let labelMesh = null;
let animTime = 0;

// Audio Global & Transiciones
let globalAudio, audioListener;
let sunPointLight = null;
let isWarping = false;
let warpProgress = 0;
let pendingChapterIndex = null;
let currentLoadedTitle = "";
let clock = new THREE.Clock();

const modelMap = {
    "Introducción": "solar_system_animation.glb",
    "El Sol": "sun.glb",
    "Mercurio": "mercury.glb",
    "Venus": "venus.glb",
    "La Tierra": "earth.glb",
    "Marte": "mars.glb",
    "Cinturón de asteroides": "solar_system_custom.glb",
    "Júpiter": "jupiter.glb",
    "Saturno": "saturn.glb",
    "Urano": "uranus.glb",
    "Neptuno": "neptune.glb",
    "Plutón": "pluton.glb",
    "Cinturón de Kuiper": "solar_system_custom.glb"
};

const manager = new THREE.LoadingManager();
manager.onStart = function ( url, itemsLoaded, itemsTotal ) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.classList.remove('hidden');
};
manager.onLoad = function ( ) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
};
const gltfLoader = new GLTFLoader(manager);

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

            // Use touchstart for mobile, click for desktop
            const interactionEvent = 'ontouchstart' in window ? 'touchstart' : 'click';
            btn.addEventListener(interactionEvent, (e) => {
                loadChapter(index);
                if (window.innerWidth <= 768) {
                    elements.indiceContainer.classList.remove('active');
                    elements.hamburger.querySelector('span').innerText = '☰';
                }
            });

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
        setupMobileMenu();

        // Cargar primer capítulo por defecto sin reproducir
        loadChapter(0, false);

    } catch (err) {
        console.error("❌ [CRÍTICO] Datos de Misión Inaccesibles:", err);
    }
}

function setupMobileMenu() {
    if (!elements.hamburger) return;

    elements.hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.indiceContainer.classList.toggle('active');
        elements.hamburger.querySelector('span').innerText =
            elements.indiceContainer.classList.contains('active') ? '✖' : '☰';
    });

    // Close on click outside
    document.addEventListener('touchstart', (e) => {
        if (elements.indiceContainer.classList.contains('active') &&
            !elements.indiceContainer.contains(e.target) &&
            !elements.hamburger.contains(e.target)) {
            elements.indiceContainer.classList.remove('active');
            elements.hamburger.querySelector('span').innerText = '☰';
        }
    }, { passive: true });
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
        elements.audio.play()
            .then(() => { if (!globalAudio.isPlaying) globalAudio.play(); })
            .catch(e => console.log("Auto-play prevenido:", e));
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
        location.href = 'index.html';
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
    
    // Iniciar el Salto Espacial (Warp) si estamos en WebXR
    if(renderer && renderer.xr.isPresenting) {
        if (!isWarping && title !== currentLoadedTitle) {
            isWarping = true;
            warpProgress = 0;
            pendingChapterIndex = currentChapterIndex;
        }
    } else {
        loadPlanetModel(title);
    }
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
        console.log("🛰️ Conectando con IAstronaut Command Center en Render...");
        const response = await fetch(`${BASE_URL}/proxy.php`, {
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


document.addEventListener('DOMContentLoaded', () => {
    loadMissionLog();
    initVR();
});

// --- WEBXR ENGINE ---
function initVR() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '-1';
    document.body.appendChild(renderer.domElement);

    const vrBtn = VRButton.createButton(renderer);
    vrBtn.style.zIndex = '9999';
    vrBtn.style.position = 'absolute';
    vrBtn.style.bottom = '20px';
    document.body.appendChild(vrBtn);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    planetGroup = new THREE.Group();
    planetGroup.position.set(0, 1.6, -3); 
    scene.add(planetGroup);

    // Audio Espacial WebXR
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    createStars();
    createVRHUD();
    setupControllers();

    // Vincular Global Audio al elemento HTML <audio>
    globalAudio = new THREE.Audio(audioListener);
    globalAudio.setMediaElementSource(elements.audio);

    // FIX AUTOPLAY EN OCULUS QUEST: Reanudar AudioContext al entrar en VR
    renderer.xr.addEventListener('sessionstart', () => {
        if (audioListener && audioListener.context && audioListener.context.state === 'suspended') {
            audioListener.context.resume();
        }
    });

    renderer.setAnimationLoop(renderVR);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function createStars() {
    starVerticesBase = [];
    const vertices = [];
    for ( let i = 0; i < 3000; i ++ ) {
        const x = THREE.MathUtils.randFloatSpread( 200 );
        const y = THREE.MathUtils.randFloatSpread( 200 );
        const z = THREE.MathUtils.randFloatSpread( 200 );
        if(Math.sqrt(x*x + y*y + z*z) < 10) continue;
        starVerticesBase.push( x, y, z );
        vertices.push( x, y, z );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
    const material = new THREE.PointsMaterial( { color: 0xffffff, size: 0.1, transparent: true, opacity: 0.8 } );
    starField = new THREE.Points( geometry, material );
    scene.add( starField );
}

function loadPlanetModel(title) {
    if (currentPlanetModel) {
        planetGroup.remove(currentPlanetModel);
        currentPlanetModel.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material) {
                    if (child.material.isMaterial) {
                        cleanMaterial(child.material);
                    } else if (Array.isArray(child.material)) {
                        for (const material of child.material) cleanMaterial(material);
                    }
                }
            }
        });
        currentPlanetModel = null;
    }

    if (sunPointLight) {
        planetGroup.remove(sunPointLight);
        sunPointLight.dispose();
        sunPointLight = null;
    }

    const modelFile = modelMap[title];
    if (!modelFile) {
        if (labelMesh) {
            planetGroup.remove(labelMesh);
            labelMesh.geometry.dispose();
            labelMesh.material.map.dispose();
            labelMesh.material.dispose();
            labelMesh = null;
        }
        return; 
    }

    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.innerText = `Sincronizando con ${title}...`;
    
    gltfLoader.load(`models/${modelFile}`, (gltf) => {
        currentPlanetModel = gltf.scene;

        // Auto-Scale y Fix Visibilidad por material
        currentPlanetModel.traverse((child) => {
            if (child.isMesh) {
                if (child.material) {
                    // Fix anillos de saturno o mallas huecas
                    if (child.material.isMaterial) child.material.side = THREE.DoubleSide;
                    else if (Array.isArray(child.material)) child.material.forEach(m => m.side = THREE.DoubleSide);
                }
            }
        });

    // Restaurar posición y escala base dependiendo del cuerpo celeste
    if (title === "Introducción") {
        currentPlanetModel.scale.set(1, 1, 1);
        currentPlanetModel.position.set(0, 0, -15);
    } else if (title === "Cinturón de asteroides" || title === "Cinturón de Kuiper") {
        currentPlanetModel.scale.set(2, 2, 2);
        currentPlanetModel.position.set(0, -1.1, 0); // Rodea al usuario (camera.y es 1.6, por tanto y=0.5 global)
    } else if (title === "El Sol") {
        currentPlanetModel.scale.set(0.1, 0.1, 0.1);
        currentPlanetModel.position.set(0, 0, -8);
        
        sunPointLight = new THREE.PointLight(0xffffee, 5, 100);
        sunPointLight.position.set(0, 0, -8);
        planetGroup.add(sunPointLight);
    } else {
        // Escala dinámica (Fix Marte/Plutón pequeños)
            const box = new THREE.Box3().setFromObject(currentPlanetModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            let scaleFact = 1.0;
            if (maxDim > 0 && maxDim < 1.0) scaleFact = 4.0 / maxDim; // Expandir
            if (maxDim > 6.0) scaleFact = 4.0 / maxDim;               // Achicar

            currentPlanetModel.scale.set(scaleFact, scaleFact, scaleFact);
            currentPlanetModel.position.set(0, 0, -3);
        }

        planetGroup.add(currentPlanetModel);
        updatePlanetLabel(title);
        currentLoadedTitle = title;
    }, undefined, (error) => {
        console.error("Error cargando el modelo:", error);
    });
}

function cleanMaterial(material) {
    material.dispose();
    if (material.map) material.map.dispose();
    if (material.lightMap) material.lightMap.dispose();
    if (material.bumpMap) material.bumpMap.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.specularMap) material.specularMap.dispose();
    if (material.envMap) material.envMap.dispose();
}

function updatePlanetLabel(title) {
    if(labelMesh) {
        planetGroup.remove(labelMesh);
        labelMesh.geometry.dispose();
        labelMesh.material.map.dispose();
        labelMesh.material.dispose();
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = 'bold 60px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 15;
    ctx.fillText(title.toUpperCase(), canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(1.5, 0.375);
    
    labelMesh = new THREE.Mesh(geometry, material);
    labelMesh.position.set(0, -1.2, 0); 
    planetGroup.add(labelMesh);
}

function createVRHUD() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(8, 12, 32, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, canvas.width-8, canvas.height-8);
    
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 28px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('INSTRUCCIONES VR:', canvas.width/2, 50);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('• Mano Der (A): Siguiente Planeta', 40, 110);
    ctx.fillText('• Mano Der (B): Planeta Anterior', 40, 150);
    ctx.fillText('• Mano Izq (X): Reiniciar Audio', 40, 190);
    ctx.fillText('• Mano Izq (Y): Play/Pause Audio', 40, 230);

    const texture = new THREE.CanvasTexture(canvas);
    vrHUD = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.4375),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
    );
    vrHUD.position.set(-1.5, 1.5, -2);
    vrHUD.rotation.y = Math.PI / 6;
    vrHUD.visible = true;
    scene.add(vrHUD);
}

function setupControllers() {
    controller1 = renderer.xr.getController(0); 
    scene.add(controller1);
    
    controller2 = renderer.xr.getController(1); 
    scene.add(controller2);
}

function triggerHaptic(source, intensity, duration) {
    if (source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators.length > 0) {
        source.gamepad.hapticActuators[0].pulse(intensity, duration);
    }
}

function handleGamepads() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const bt = source.gamepad.buttons;
        const ax = source.gamepad.axes;
        
        if (source.handedness === 'right') { 
            const btnA = bt[4] && bt[4].pressed;
            const btnB = bt[5] && bt[5].pressed;

            if (btnA && !prevButtonState.A) {
                if (currentChapterIndex + 1 < missionChapters.length) {
                    triggerHaptic(source, 0.5, 100);
                    loadChapter(currentChapterIndex + 1);
                }
            }
            if (btnB && !prevButtonState.B) {
                if (currentChapterIndex - 1 >= 0) {
                    triggerHaptic(source, 0.5, 100);
                    loadChapter(currentChapterIndex - 1);
                }
            }
            
            // Escalar "Introducción" con el Joystick Y (Index 3)
            if (currentLoadedTitle === "Introducción" && planetGroup) {
                if (Math.abs(ax[3]) > 0.1) {
                    // Escala el grupo completo suavemente
                    const scaleFactor = 1 - ax[3] * 0.02;
                    const newScale = THREE.MathUtils.clamp(planetGroup.scale.x * scaleFactor, 0.1, 5);
                    planetGroup.scale.set(newScale, newScale, newScale);
                }
            }
            
            prevButtonState.A = btnA;
            prevButtonState.B = btnB;
        }

        if (source.handedness === 'left') { 
            const btnX = bt[4] && bt[4].pressed;
            const btnY = bt[5] && bt[5].pressed;

            if (btnX && !prevButtonState.X) {
                elements.audio.currentTime = 0;
            }
            if (btnY && !prevButtonState.Y) {
                if (elements.audio.paused) {
                    elements.audio.play();
                } else {
                    elements.audio.pause();
                }
            }
            prevButtonState.X = btnX;
            prevButtonState.Y = btnY;
        }
    }
}

function updateWarpEffect() {
    if (!isWarping) return;

    warpProgress += 0.015;

    // Fase 1: Acelerar (Estirar estrellas en Z)
    if (warpProgress < 1.0) {
        const positions = starField.geometry.attributes.position.array;
        for (let i = 0; i < 3000; i++) {
            // Estirar z hacia la cámara (hacerlo negativo respecto al ojo)
            positions[i*3 + 2] = starVerticesBase[i*3 + 2] + (warpProgress * 50 * Math.sign(starVerticesBase[i*3 + 2]));
        }
        starField.geometry.attributes.position.needsUpdate = true;
        
        // Fase 1b: Opacar planeta actual y HUD durante salto
        if (planetGroup) planetGroup.visible = false;
        if (vrHUD) vrHUD.visible = false;
        
    } else if (warpProgress >= 1.0 && warpProgress < 1.02) {
        // Cargar el modelo exactamente a la mitad del salto
        const title = missionChapters[pendingChapterIndex].titulo;
        loadPlanetModel(title);
        
    } else if (warpProgress >= 1.02 && warpProgress < 2.0) {
        // Fase 2: Desacelerar estrellas
        const falloff = 2.0 - warpProgress;
        const positions = starField.geometry.attributes.position.array;
        for (let i = 0; i < 3000; i++) {
            positions[i*3 + 2] = starVerticesBase[i*3 + 2] + (falloff * 50 * Math.sign(starVerticesBase[i*3 + 2]));
        }
        starField.geometry.attributes.position.needsUpdate = true;
        
    } else {
        // Fin de warp
        isWarping = false;
        if (planetGroup) {
            planetGroup.visible = true;
            // Reset scale si no estamos en Introducción
            if (currentLoadedTitle !== "Introducción") {
                 planetGroup.scale.set(1, 1, 1);
            }
        }
        if (vrHUD) vrHUD.visible = instructionsVisible;
        
        // Restaurar array original de estrellas
        const positions = starField.geometry.attributes.position.array;
        for (let i = 0; i < 3000; i++) {
            positions[i*3 + 0] = starVerticesBase[i*3 + 0];
            positions[i*3 + 1] = starVerticesBase[i*3 + 1];
            positions[i*3 + 2] = starVerticesBase[i*3 + 2];
        }
        starField.geometry.attributes.position.needsUpdate = true;
    }
}

function renderVR() {
    if (renderer.xr.isPresenting) {
        handleGamepads();
        updateWarpEffect();
    }
    
    if (currentPlanetModel && !isWarping) {
        // Rotación global más rápida sobre su propio eje Y
        currentPlanetModel.rotation.y += 0.005;
        
        // Órbita / Balanceo si no es el Sistema Solar completo
        if (currentLoadedTitle !== "Introducción" && currentLoadedTitle !== "Cinturón de asteroides" && currentLoadedTitle !== "Cinturón de Kuiper" && currentLoadedTitle !== "El Sol") {
            const temp = clock.getElapsedTime() * 0.2;
            currentPlanetModel.position.x = Math.cos(temp) * 0.5;
            currentPlanetModel.position.z = -3 + Math.sin(temp) * 0.5;
        }
    }
    
    if (labelMesh) {
        animTime += 0.02;
        labelMesh.position.y = -1.2 + Math.sin(animTime) * 0.05;
    }

    renderer.render(scene, camera);
}


