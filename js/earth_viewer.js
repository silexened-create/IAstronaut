import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer VR Full Controls
 * Mapeo de mandos dual, HUD de instrucciones y zoom dinámico.
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
let vrZoomValue = 450; // Distancia inicial en VR

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

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 20000);
    camera.position.set(0, 0, 450);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // VR Button with styled appearance
    const vrButton = VRButton.createButton(renderer);
    vrButton.style.background = 'rgba(8, 12, 24, 0.9)';
    vrButton.style.border = '1px solid #00ffff';
    vrButton.style.color = '#00ffff';
    vrButton.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.3)';
    document.body.appendChild(vrButton);

    // 4. VR Controllers
    setupVRControllers();

    // 5. OrbitControls (Hybrid Compatibility)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 200;
    controls.maxDistance = 1500;

    // 6. Earth Group & Lighting
    earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const ambientLight = new THREE.AmbientLight(0x111133, 0.6);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 2.8);
    scene.add(sunLight);
    scene.add(sunLight.target);

    createEarth();
    createStars();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupTemporalListeners();

    // Set initial date state
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const currentDay = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    daySlider.value = currentDay;
    hourSlider.value = now.getUTCHours() + now.getUTCMinutes() / 60;
    manualDay = currentDay;
    manualHour = parseFloat(hourSlider.value);

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
    // Left Controller (Instructions HUD)
    controller1 = renderer.xr.getController(0);
    scene.add(controller1);
    
    // Create HUD Panel
    vrInstructionsHUD = createVRInstructions();
    vrInstructionsHUD.position.set(0, 0.15, 0.05);
    vrInstructionsHUD.rotation.x = -Math.PI / 4;
    controller1.add(vrInstructionsHUD);

    // Right Controller
    controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    // Visual identifiers for controllers
    const pointerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
    const pointerMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
    const line1 = new THREE.Line(pointerGeo, pointerMat); line1.scale.z = 10;
    const line2 = new THREE.Line(pointerGeo, pointerMat); line2.scale.z = 10;
    controller1.add(line1);
    controller2.add(line2);

    // Button Events
    controller1.addEventListener('selectstart', () => {}); // Trigger handles zoom via axes poll
    controller2.addEventListener('selectstart', () => {});

    // Reset button (A/X)
    renderer.xr.addEventListener('sessionstart', () => {
        const session = renderer.xr.getSession();
        session.addEventListener('select', (event) => {
            // Check for buttons in handleVRInput for better control
        });
    });
}

function createVRInstructions() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    // Panel background
    ctx.fillStyle = 'rgba(8, 20, 40, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Neon Cyan Border
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Title
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 32px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CONTROLES VR', canvas.width / 2, 50);

    // Instructions
    ctx.textAlign = 'left';
    ctx.font = '24px Orbitron, sans-serif';
    ctx.fillStyle = '#ffffff';
    
    const lines = [
        '• Gatillos: Zoom +/-',
        '• Joy Izq: Hora / Día',
        '• Joy Der: Rotar Tierra',
        '• Botón A/X: Reset Tiempo'
    ];

    lines.forEach((line, i) => {
        ctx.fillText(line, 50, 110 + (i * 45));
    });

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(0.25, 0.16);
    const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true, 
        side: THREE.DoubleSide 
    });

    return new THREE.Mesh(geometry, material);
}

function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;

        const axes = source.gamepad.axes;
        const buttons = source.gamepad.buttons;
        const hand = source.handedness;

        // MANO DERECHA: Rotación y Zoom In
        if (hand === 'right') {
            // Rotación Tierra (Ejes 2 y 3)
            if (Math.abs(axes[2]) > 0.1) earthGroup.rotation.y += axes[2] * 0.04;
            if (Math.abs(axes[3]) > 0.1) earthGroup.rotation.x += axes[3] * 0.04;

            // Zoom In (Gatillo - buttons[0])
            if (buttons[0].pressed) {
                vrZoomValue = Math.max(150, vrZoomValue - 2);
            }

            // Reset Tiempo (Botón A - buttons[4] o buttons[5] usualmente)
            if (buttons[1]?.pressed || buttons[4]?.pressed || buttons[5]?.pressed) {
                resetToLive();
            }
        }

        // MANO IZQUIERDA: Tiempo y Zoom Out
        else if (hand === 'left') {
            let changed = false;

            // Hora (Joy eje horizontal 2)
            if (Math.abs(axes[2]) > 0.1) {
                manualHour = (manualHour + axes[2] * 0.1) % 24;
                if (manualHour < 0) manualHour += 24;
                changed = true;
            }

            // Día (Joy eje vertical 3)
            if (Math.abs(axes[3]) > 0.1) {
                manualDay = Math.max(1, Math.min(365, manualDay + axes[3] * 0.3));
                changed = true;
            }

            if (changed) {
                syncVRToDOM();
            }

            // Zoom Out (Gatillo - buttons[0])
            if (buttons[0].pressed) {
                vrZoomValue = Math.min(1200, vrZoomValue + 2);
            }
        }
    }
}

function resetToLive() {
    isLive = true;
    if (liveBtn) liveBtn.click();
}

function syncVRToDOM() {
    if (isLive) {
        isLive = false;
        if (manualBtn) manualBtn.classList.add('active');
        if (liveBtn) liveBtn.classList.remove('active');
    }

    if (daySlider) daySlider.value = manualDay;
    if (hourSlider) hourSlider.value = manualHour;
    updateManualLabels();
}

function render() {
    const isPresenting = renderer.xr.isPresenting;

    if (isPresenting) {
        // VR Mode: Posición dinámica según zoom
        earthGroup.position.set(0, 1.4, -vrZoomValue);
        earthGroup.scale.set(1, 1, 1); // Escala natural 1:1 para los 100 unidades de radio
        
        handleVRInput();
        
        // Sun follows Earth position in VR
        sunLight.target.position.copy(earthGroup.position);
    } else {
        // Desktop Mode
        earthGroup.position.set(0, 0, 0);
        earthGroup.scale.set(1, 1, 1);
        if (controls) controls.update();
        sunLight.target.position.set(0, 0, 0);
    }

    sunLight.target.updateMatrixWorld();

    if (clouds) clouds.rotation.y += 0.0002;
    updateSunPosition();
    renderer.render(scene, camera);
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
        shininess: 5
    });

    earth = new THREE.Mesh(geometry, material);
    earthGroup.add(earth);

    // Clouds
    const cloudGeometry = new THREE.SphereGeometry(101, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: loader.load(TEXTURES.clouds),
        transparent: true,
        opacity: 0.4
    });

    clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    earthGroup.add(clouds);

    // Atmospheric Glow
    const glowTexture = loader.load(TEXTURES.stars);
    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x58a6ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(350, 350, 1);
    earthGroup.add(glow);
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.8,
        transparent: true,
        opacity: 0.7
    });

    const starVertices = [];
    for (let i = 0; i < 15000; i++) {
        const x = (Math.random() - 0.5) * 10000;
        const y = (Math.random() - 0.5) * 10000;
        const z = (Math.random() - 0.5) * 10000;
        starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
}

function updateSunPosition() {
    let dayOfYear, decimalTime;

    if (isLive) {
        const now = new Date();
        if (uiDate) uiDate.innerText = now.toLocaleDateString();
        if (uiTime) uiTime.innerText = now.toTimeString().split(' ')[0];

        const start = new Date(now.getFullYear(), 0, 0);
        dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        decimalTime = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    } else {
        dayOfYear = manualDay;
        decimalTime = manualHour;

        const date = new Date(new Date().getFullYear(), 0);
        date.setDate(manualDay);
        if (uiDate) uiDate.innerText = date.toLocaleDateString();

        const h = Math.floor(manualHour);
        const m = Math.floor((manualHour % 1) * 60);
        if (uiTime) uiTime.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
    }

    const declination = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
    const longitude = 15 * (12 - decimalTime);

    const phi = (90 - declination) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);

    const radius = 1000;
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    sunLight.position.set(x, y, z);
    if (uiSunCoords) uiSunCoords.innerText = `Lat: ${declination.toFixed(2)}° | Lon: ${longitude.toFixed(2)}°`;
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    
    if (width < 900) {
        camera.position.set(0, 0, 350);
        const yOffset = -height * 0.40;
        camera.setViewOffset(width, height, 0, yOffset, width, height);
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
    
    liveBtn.addEventListener('click', () => {
        isLive = true;
        liveBtn.classList.add('active');
        manualBtn.classList.remove('active');
        viewDayText.innerText = "Hoy";
        viewHourText.innerText = "Ahora";
    });

    manualBtn.addEventListener('click', () => {
        isLive = false;
        manualBtn.classList.add('active');
        liveBtn.classList.remove('active');
        updateManualLabels();
    });

    daySlider.addEventListener('input', (e) => {
        manualDay = parseInt(e.target.value);
        if (isLive) manualBtn.click();
        updateManualLabels();
    });

    hourSlider.addEventListener('input', (e) => {
        manualHour = parseFloat(e.target.value);
        if (isLive) manualBtn.click();
        updateManualLabels();
    });
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

// Boot
init();
