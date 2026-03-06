import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer: VR Camera Rig Optimization
 * Solución al problema de posicionamiento inicial en WebXR (evita aparecer dentro de la Tierra).
 */

// Configuration
const TEXTURES = {
    earth: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    normal: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    clouds: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
    stars: 'https://threejs.org/examples/textures/lensflare/lensflare0_alpha.png'
};

// Global References
let scene, camera, renderer, controls;
let controller1, controller2;
let vrCameraRig, vrUserOffset, vrInstructionsHUD, vrTelemetryHUD; // Added vrTelemetryHUD
let earthAnchor, earthGroup, rotationGroup;
let earth, clouds, sunLight, starField;

// --- CAMARA RIG OPTIMIZATION ---
let vrZoomValue = 500; // Desplazamiento inicial para no aparecer "dentro"
let vrRotateX = 0;
let vrRotateY = 0;

// Constantes
const AXIAL_TILT = THREE.MathUtils.degToRad(23.44);
const STAR_COUNT = 15000;
const CELESTIAL_RADIUS = 10000;

// UI References
const container = document.getElementById('canvas-container');
const loadingScreen = document.getElementById('loading-screen');
const uiDate = document.getElementById('current-date');
const uiTime = document.getElementById('current-time');
const uiSunCoords = document.getElementById('sun-coords');
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
    if (!container) return;

    // 1. Scene Setup
    scene = new THREE.Scene();

    // 2. Camera Setup & Rigging
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 35000);

    // Crear el Rig de Cámara que actuará como pivote de rotación (Órbita)
    vrCameraRig = new THREE.Group();
    scene.add(vrCameraRig);

    // Crear el Offset de Usuario que controla la distancia (Zoom)
    vrUserOffset = new THREE.Group();
    vrUserOffset.position.z = vrZoomValue; 
    vrCameraRig.add(vrUserOffset);

    // La cámara es hija del Offset. En VR, WebXR manejará la posición local de la cámara.
    vrUserOffset.add(camera);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // VR Button
    const vrButton = VRButton.createButton(renderer);
    vrButton.style.background = 'rgba(8, 12, 32, 0.9)';
    vrButton.style.border = '2px solid #00ffff';
    vrButton.style.color = '#00ffff';
    document.body.appendChild(vrButton);

    // 4. VR Controllers
    setupVRControllers();

    // 5. OrbitControls (Escritorio) - Actúa sobre la cámara directamente
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 200;
    controls.maxDistance = 5000;

    // 6. Earth Node Hierarchy (Precisión Axial)
    earthAnchor = new THREE.Group();
    scene.add(earthAnchor);

    earthGroup = new THREE.Group();
    earthGroup.rotation.z = AXIAL_TILT;
    earthAnchor.add(earthGroup);

    rotationGroup = new THREE.Group();
    earthGroup.add(rotationGroup);

    // 7. Visual Elements
    createCelestialGuides();
    createStars();
    createCelestialMarkers();

    // 8. Lighting
    const ambientLight = new THREE.AmbientLight(0x222244, 0.5);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
    scene.add(sunLight);
    scene.add(sunLight.target);

    createEarth();

    // 9. Interaction
    window.addEventListener('resize', onWindowResize);
    setupTemporalListeners();
    setupXRSessionListeners(); // Call the session listeners

    // Loop
    renderer.setAnimationLoop(render);

    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }, 1500);
    }
}

function setupVRControllers() {
    controller1 = renderer.xr.getController(0);
    vrUserOffset.add(controller1); 
    
    vrInstructionsHUD = createVRInstructions();
    vrInstructionsHUD.position.set(0, 0.2, -0.4); 
    vrInstructionsHUD.rotation.x = -Math.PI / 6;
    controller1.add(vrInstructionsHUD);

    // Add Telemetry HUD to Camera so it follows the view
    vrTelemetryHUD = createVRTelemetry();
    vrTelemetryHUD.position.set(0, 0.5, -1.2); // Above the view center
    camera.add(vrTelemetryHUD);

    controller2 = renderer.xr.getController(1);
    vrUserOffset.add(controller2); 
}

function setupXRSessionListeners() {
    renderer.xr.addEventListener('sessionstart', () => {
        if (controls) controls.enabled = false;
        // The hierarchy (Rig > Offset > Camera/Hands) handles positioning.
        // WebXR 'local' space will now be relative to our vrUserOffset.
    });

    renderer.xr.addEventListener('sessionend', () => {
        if (controls) {
            controls.enabled = true;
            camera.position.set(0, 0, 450);
            camera.lookAt(0, 0, 0);
            controls.update();
        }
    });
}

function createVRInstructions() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    function update() {
        ctx.fillStyle = 'rgba(10, 15, 30, 0.96)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 30px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CONTROLES VR', canvas.width / 2, 50);

        ctx.textAlign = 'left';
        ctx.font = '22px Orbitron, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('• Joy Izq: Tiempo (X) / Zoom (Y)', 40, 100);
        ctx.fillText('• Joy Der: Órbita / Vuelo Polar', 40, 140);
        ctx.fillText('• Gatillos: Ajuste Preciso Zoom', 40, 180);

        ctx.font = '16px Orbitron, sans-serif';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.fillText('Mira tu mano para estas instrucciones', 40, 250);
        
        hudTexture.needsUpdate = true;
    }

    const hudTexture = new THREE.CanvasTexture(canvas);
    const hudMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.22),
        new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, side: THREE.DoubleSide })
    );

    hudMesh.userData.update = update;
    return hudMesh;
}

function createVRTelemetry() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    function update() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Semi-transparent glass background
        ctx.fillStyle = 'rgba(10, 20, 40, 0.7)';
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 20);
        ctx.fill();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 24px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        
        const day = Math.floor(manualDay);
        const h = Math.floor(manualHour);
        const m = Math.floor((manualHour % 1) * 60);
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;

        ctx.fillText(`TELEMETRÍA: DÍA ${day} | ${timeStr}`, canvas.width / 2, 75);
        
        telemetryTexture.needsUpdate = true;
    }

    const telemetryTexture = new THREE.CanvasTexture(canvas);
    const telemetryMaterial = new THREE.SpriteMaterial({ 
        map: telemetryTexture, 
        transparent: true,
        opacity: 0.9 
    });
    const telemetrySprite = new THREE.Sprite(telemetryMaterial);
    telemetrySprite.scale.set(0.6, 0.15, 1);

    telemetrySprite.userData.update = update;
    return telemetrySprite;
}

function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        const buttons = source.gamepad.buttons;
        const hand = source.handedness;

        // MANO DERECHA: Control de la Órbita del usuario
        if (hand === 'right') {
            // Rotación del Rig (X e Y)
            if (Math.abs(axes[2]) > 0.1) vrRotateY -= axes[2] * 0.04; // Giro horizontal
            if (Math.abs(axes[3]) > 0.1) {
                // Giro vertical limitado a los polos
                vrRotateX = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, vrRotateX - axes[3] * 0.04));
            }
            // Zoom In (Gatillo)
            if (buttons[0].pressed) vrZoomValue = Math.max(150, vrZoomValue - 5);
        }
        // MANO IZQUIERDA: Control de Tiempo y Zoom
        else if (hand === 'left') {
            let changed = false;
            // X Axis: Hora
            if (Math.abs(axes[2]) > 0.1) {
                manualHour = (manualHour + axes[2] * 0.3) % 24;
                if (manualHour < 0) manualHour += 24;
                changed = true;
            }
            // Y Axis: Zoom
            if (Math.abs(axes[3]) > 0.1) {
                vrZoomValue = Math.max(150, Math.min(2500, vrZoomValue + axes[3] * 15));
            }

            if (changed) {
                isLive = false;
                syncVRToDOM();
            }
            // Triggers: Zoom Fino (Mano Izq = Out, Mano Der = In)
            if (buttons[0].pressed) vrZoomValue = Math.min(2500, vrZoomValue + 5);
        }
        
        if (hand === 'right' && buttons[0].pressed) {
            vrZoomValue = Math.max(150, vrZoomValue - 5);
        }
    }
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

    if (isLive) {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        manualDay = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    }

    // Rotación de la Tierra sobre su eje
    rotationGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    if (isPresenting) {
        handleVRInput();

        // Aplicar rotaciones al RIG (pivote de órbita)
        vrCameraRig.rotation.order = 'YXZ';
        vrCameraRig.rotation.y = vrRotateY;
        vrCameraRig.rotation.x = vrRotateX;

        // Aplicar distancia al OFFSET
        vrUserOffset.position.z = vrZoomValue;

        // No forzamos cámara.position ni lookAt en XR para dejar que el tracking funcione
        if (vrInstructionsHUD && vrInstructionsHUD.userData.update) {
            vrInstructionsHUD.userData.update();
        }
        if (vrTelemetryHUD && vrTelemetryHUD.userData.update) {
            vrTelemetryHUD.userData.update();
        }
    } else {
        // En escritorio, reseteamos el rig para que OrbitControls no tenga conflictos
        vrCameraRig.rotation.set(0, 0, 0);
        if (controls) controls.update();
    }

    updateSunDynamics();
    if (clouds) clouds.rotation.y += 0.0001;

    renderer.render(scene, camera);
}

function updateSunDynamics() {
    solarDeclination = 23.44 * Math.sin((2 * Math.PI / 365) * (manualDay - 81));
    const declRad = THREE.MathUtils.degToRad(solarDeclination);
    const radius = 3000;
    const sy = radius * Math.sin(declRad);
    const sz = radius * Math.cos(declRad);

    if (sunLight) {
        sunLight.position.set(0, sy, sz);
        sunLight.target.updateMatrixWorld();
    }

    // UI Updates
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(manualDay);
    if (uiDate) uiDate.innerText = date.toLocaleDateString();

    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    if (uiTime) uiTime.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00 UTC`;
    if (uiSunCoords) uiSunCoords.innerText = `Decl. Solar: ${solarDeclination.toFixed(2)}°`;
}

function createCelestialGuides() {
    const axisGeo = new THREE.CylinderGeometry(0.5, 0.5, 500, 8);
    const axisMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
    const axis = new THREE.Mesh(axisGeo, axisMat);
    earthGroup.add(axis);

    const equatorGeo = new THREE.TorusGeometry(105, 0.4, 8, 100);
    const equatorMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 });
    const equator = new THREE.Mesh(equatorGeo, equatorMat);
    equator.rotation.x = Math.PI / 2;
    earthGroup.add(equator);
}

function createCelestialMarkers() {
    const markerGeo = new THREE.SphereGeometry(25, 16, 16);
    const polaris = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    polaris.position.set(0, CELESTIAL_RADIUS, 0);
    scene.add(polaris);
    const sigma = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.8 }));
    sigma.position.set(0, -CELESTIAL_RADIUS, 0);
    scene.add(sigma);
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        const r = CELESTIAL_RADIUS;
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        starVertices.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, transparent: true, opacity: 0.7 })));
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
    rotationGroup.add(earth);

    // Clouds
    clouds = new THREE.Mesh(new THREE.SphereGeometry(101, 64, 64), new THREE.MeshPhongMaterial({ map: loader.load(TEXTURES.clouds), transparent: true, opacity: 0.4 }));
    rotationGroup.add(clouds);
}

function onWindowResize() {
    if (!camera || !renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    if (width < 900) {
        camera.setViewOffset(width, height, 0, -height * 0.4, width, height);
    } else {
        camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function setupTemporalListeners() {
    if (!liveBtn || !manualBtn) return;
    liveBtn.addEventListener('click', () => { isLive = true; syncVRToDOM(); });
    manualBtn.addEventListener('click', () => { isLive = false; syncVRToDOM(); });
    if (daySlider) daySlider.addEventListener('input', (e) => { manualDay = parseInt(e.target.value); isLive = false; syncVRToDOM(); });
    if (hourSlider) hourSlider.addEventListener('input', (e) => { manualHour = parseFloat(e.target.value); isLive = false; syncVRToDOM(); });
}

function updateManualLabels() {
    if (!viewHourText) return;
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(manualDay);
    viewDayText.innerText = isLive ? "Hoy" : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    viewHourText.innerText = isLive ? "Ahora" : `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;
}

init();
