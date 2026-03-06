import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer: Astronomía Educativa VR
 * Simulación de alta precisión de la inclinación axial y ciclos solares.
 */

// Configuration
const TEXTURES = {
    earth: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    normal: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    clouds: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
    stars: 'https://threejs.org/examples/textures/lensflare/lensflare0_alpha.png'
};

let scene, camera, renderer, controls;
let earthGroup, controller1, controller2;
let earth, clouds, sunLight, starField;
let vrInstructionsHUD;

// VR State Constants
let vrZoomValue = 450;
let vrOrbitY = 0; // Rotación de la cámara (órbita del usuario)
let vrOrbitX = 0;

// Constantes Físicas
const AXIAL_TILT = THREE.MathUtils.degToRad(23.44);

// UI References
const container = document.getElementById('canvas-container');
const loadingScreen = document.getElementById('loading-screen');
const uiDate = document.getElementById('current-date');
const uiTime = document.getElementById('current-time');
const uiSunCoords = document.getElementById('sun-coords');

// Temporal Control UI
const liveBtn = document.getElementById('live-mode');
const manualBtn = document.getElementById('manual-mode');
const daySlider = document.getElementById('day-range');
const hourSlider = document.getElementById('hour-range');
const viewDayText = document.getElementById('view-day');
const viewHourText = document.getElementById('view-hour');

let isLive = true;
let manualDay = 81;
let manualHour = 12;
let solarDeclination = 0;

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 25000);
    camera.position.set(0, 0, 450);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // VR Button Setup
    const vrButton = VRButton.createButton(renderer);
    vrButton.style.background = 'rgba(8, 20, 60, 0.9)';
    vrButton.style.border = '1px solid #00ffff';
    vrButton.style.color = '#00ffff';
    document.body.appendChild(vrButton);

    // 4. VR Controllers
    setupVRControllers();

    // 5. OrbitControls (Escritorio)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 200;
    controls.maxDistance = 2000;

    // 6. Earth Group & Lighting
    earthGroup = new THREE.Group();
    // APLICAR INCLINACIÓN AXIAL PERMANENTE (Eje Z)
    earthGroup.rotation.z = AXIAL_TILT;
    scene.add(earthGroup);

    const ambientLight = new THREE.AmbientLight(0x111133, 0.4);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    scene.add(sunLight);
    scene.add(sunLight.target);

    createEarth();
    createStars();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupTemporalListeners();

    // Boot Time
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    manualDay = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    if (daySlider) daySlider.value = manualDay;
    if (hourSlider) hourSlider.value = manualHour;

    // 8. Start Animation Loop
    renderer.setAnimationLoop(render);

    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }, 2000);
    }
}

function setupVRControllers() {
    controller1 = renderer.xr.getController(0); // Izquierdo usualmente
    scene.add(controller1);
    
    vrInstructionsHUD = createVRInstructions();
    vrInstructionsHUD.position.set(0, 0.18, 0.05);
    vrInstructionsHUD.rotation.x = -Math.PI / 4;
    controller1.add(vrInstructionsHUD);

    controller2 = renderer.xr.getController(1); // Derecho
    scene.add(controller2);

    // Visual pointers
    const pointerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
    const pointerMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 });
    const line1 = new THREE.Line(pointerGeo, pointerMat); line1.scale.z = 5;
    const line2 = new THREE.Line(pointerGeo, pointerMat); line2.scale.z = 5;
    controller1.add(line1);
    controller2.add(line2);
}

function createVRInstructions() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 380; // Un poco más alto para datos científicos
    const ctx = canvas.getContext('2d');

    // Render Panel
    function updateHUDContent() {
        ctx.fillStyle = 'rgba(8, 12, 32, 0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 28px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('IASTRONAUT ACADEMY', canvas.width / 2, 45);

        ctx.textAlign = 'left';
        ctx.font = '20px Orbitron, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Mano Izq: Viaje en el Tiempo', 40, 90);
        ctx.fillText('Mano Der: Exploración Espacial', 40, 125);
        
        ctx.font = '18px Orbitron, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText('• Joy Izq: Hora (X) / Día (Y)', 50, 165);
        ctx.fillText('• Joy Der: Órbita Cámara', 50, 195);
        ctx.fillText('• Gatillos: Zoom +/-', 50, 225);

        // Datos Científicos
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 22px Orbitron, sans-serif';
        ctx.fillText('DATOS CIENTÍFICOS:', 40, 275);
        
        ctx.font = '20px Orbitron, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Lat. Sub-Solar: ${solarDeclination.toFixed(2)}°`, 50, 310);
        ctx.fillText(`Día: ${Math.floor(manualDay)} | Hora: ${manualHour.toFixed(1)}h`, 50, 345);

        texture.needsUpdate = true;
    }

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(0.28, 0.2);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.userData.update = updateHUDContent;
    return mesh;
}

function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        const buttons = source.gamepad.buttons;
        const hand = source.handedness;

        // MANO DERECHA: Exploración Espacial (Cámara/Órbita)
        if (hand === 'right') {
            // Rotación de la Órbita del usuario
            if (Math.abs(axes[2]) > 0.1) vrOrbitY -= axes[2] * 0.03;
            if (Math.abs(axes[3]) > 0.1) vrOrbitX = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, vrOrbitX - axes[3] * 0.03));

            // Zoom In
            if (buttons[0].pressed) vrZoomValue = Math.max(150, vrZoomValue - 3);
            
            // Botón Reset (A/B)
            if (buttons[4]?.pressed || buttons[5]?.pressed) resetState();
        }

        // MANO IZQUIERDA: Viaje en el Tiempo
        else if (hand === 'left') {
            let timeChanged = false;

            // X -> Hora (Rotación Diaria)
            if (Math.abs(axes[2]) > 0.1) {
                manualHour = (manualHour + axes[2] * 0.15) % 24;
                if (manualHour < 0) manualHour += 24;
                timeChanged = true;
            }

            // Y -> Día del Año (Ciclo Estacional)
            if (Math.abs(axes[3]) > 0.1) {
                manualDay = Math.max(1, Math.min(365, manualDay + axes[3] * 0.4));
                timeChanged = true;
            }

            if (timeChanged) {
                isLive = false;
                syncVRToDOM();
            }

            // Zoom Out
            if (buttons[0].pressed) vrZoomValue = Math.min(1500, vrZoomValue + 3);
        }
    }
}

function resetState() {
    isLive = true;
    vrOrbitY = 0;
    vrOrbitX = 0;
    vrZoomValue = 450;
    if (liveBtn) liveBtn.click();
}

function syncVRToDOM() {
    if (manualBtn && !manualBtn.classList.contains('active')) {
        manualBtn.classList.add('active');
        liveBtn.classList.remove('active');
    }
    if (daySlider) daySlider.value = manualDay;
    if (hourSlider) hourSlider.value = manualHour;
    updateManualLabels();
}

function render() {
    const isPresenting = renderer.xr.isPresenting;

    // Actualizar tiempo live
    if (isLive) {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        manualDay = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        manualHour = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    }

    // FÍSICA EDUCATIVA: La Tierra rota SOLO sobre su eje Y local según la hora
    // 00:00 corresponde a la antípoda del sol. GMT+12 es mediodía solar en meridiano 0.
    earthGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    if (isPresenting) {
        handleVRInput();
        
        // Aplicar Órbita VR alrededor de la Tierra
        const orbitRadius = vrZoomValue;
        const ox = orbitRadius * Math.sin(vrOrbitY) * Math.cos(vrOrbitX);
        const oy = orbitRadius * Math.sin(vrOrbitX) + 1.4; // +1.4m altura ojos
        const oz = orbitRadius * Math.cos(vrOrbitY) * Math.cos(vrOrbitX);
        
        // En VR preferimos mover la Tierra relativo al origen visual (0,1.4,0)
        earthGroup.position.set(-ox, 1.4 - oy, -oz);
        
        if (vrInstructionsHUD && vrInstructionsHUD.userData.update) {
            vrInstructionsHUD.userData.update();
        }

        // El Sol siempre ilumina desde una dirección fija relativa al plano orbital
        sunLight.target.position.copy(earthGroup.position);
    } else {
        earthGroup.position.set(0, 0, 0);
        if (controls) controls.update();
        sunLight.target.position.set(0, 0, 0);
    }

    sunLight.target.updateMatrixWorld();
    if (clouds) clouds.rotation.y += 0.0001;

    updateSunDynamics();
    renderer.render(scene, camera);
}

function updateSunDynamics() {
    // Cálculo de Declinación Solar (Latitud donde el sol incide a 90°)
    solarDeclination = 23.44 * Math.sin((2 * Math.PI / 365) * (manualDay - 81));
    
    // Posicionar Sol: El Sol está "infinitamente" lejos, simulamos dirección.
    // La declinación afecta al ángulo vertical del Sol respecto al ecuador.
    const declRad = THREE.MathUtils.degToRad(solarDeclination);
    const radius = 2000;
    
    // En nuestro sistema, el eje Y es "arriba/norte". 
    // Si la Tierra está en 0 y tiene inclinación axial, el sol se mueve arriba/abajo en Y.
    const sy = radius * Math.sin(declRad);
    const sz = radius * Math.cos(declRad);
    
    sunLight.position.set(0, sy, sz);

    // Actualizar UI DOM
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(manualDay);
    if (uiDate) uiDate.innerText = date.toLocaleDateString();
    
    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    if (uiTime) uiTime.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00 UTC`;
    if (uiSunCoords) uiSunCoords.innerText = `Decl. Solar (Lat): ${solarDeclination.toFixed(2)}°`;
}

function createEarth() {
    const loader = new THREE.TextureLoader();
    const geometry = new THREE.SphereGeometry(100, 64, 64);
    const material = new THREE.MeshPhongMaterial({
        map: loader.load(TEXTURES.earth),
        normalMap: loader.load(TEXTURES.normal),
        normalScale: new THREE.Vector2(0.85, 0.85),
        specularMap: loader.load(TEXTURES.specular),
        specular: new THREE.Color('grey'),
        shininess: 8
    });

    earth = new THREE.Mesh(geometry, material);
    earthGroup.add(earth);

    const cloudGeometry = new THREE.SphereGeometry(101, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: loader.load(TEXTURES.clouds),
        transparent: true,
        opacity: 0.4
    });

    clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    earthGroup.add(clouds);

    const glowTexture = loader.load(TEXTURES.stars);
    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x58a6ff,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(380, 380, 1);
    earthGroup.add(glow);
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.0,
        transparent: true,
        opacity: 0.8
    });

    const starVertices = [];
    for (let i = 0; i < 20000; i++) {
        const x = (Math.random() - 0.5) * 15000;
        const y = (Math.random() - 0.5) * 15000;
        const z = (Math.random() - 0.5) * 15000;
        starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    
    if (width < 900) {
        camera.position.set(0, 0, 350);
        camera.setViewOffset(width, height, 0, -height*0.4, width, height);
        if (controls) controls.target.set(0, -50, 0);
    } else {
        camera.clearViewOffset();
        camera.position.set(0, 0, 450);
        if (controls) controls.target.set(0, 0, 0);
    }

    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function setupTemporalListeners() {
    if (!liveBtn) return;
    liveBtn.addEventListener('click', () => { isLive = true; liveBtn.classList.add('active'); manualBtn.classList.remove('active'); });
    manualBtn.addEventListener('click', () => { isLive = false; manualBtn.classList.add('active'); liveBtn.classList.remove('active'); });
    daySlider.addEventListener('input', (e) => { manualDay = parseInt(e.target.value); isLive = false; syncVRToDOM(); });
    hourSlider.addEventListener('input', (e) => { manualHour = parseFloat(e.target.value); isLive = false; syncVRToDOM(); });
}

function updateManualLabels() {
    if (!viewDayText) return;
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(manualDay);
    viewDayText.innerText = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    viewHourText.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;
}

init();
