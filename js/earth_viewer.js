import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - MODO OBSERVATORIO: GUÍAS CELESTES Y STAR TRAILS
 * Visualización pedagógica de rotación axial, guías geométricas y marcadores estelares.
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
let earthAnchor, earthGroup, rotationGroup, vrCameraRig;
let earth, clouds, sunLight, starField;
let vrInstructionsHUD;

// VR State
let vrZoomValue = 450;
let vrRotateX = 0;
let vrRotateY = 0;

// Constantes Físicas y de Diseño
const AXIAL_TILT = THREE.MathUtils.degToRad(23.44);
const STAR_COUNT = 15000;
const CELESTIAL_RADIUS = 10000;

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

    // 2. Camera & Rig Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 35000);
    
    vrCameraRig = new THREE.Group();
    vrCameraRig.add(camera);
    scene.add(vrCameraRig);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // VR Button
    const vrButton = VRButton.createButton(renderer);
    vrButton.style.background = 'rgba(8, 20, 50, 0.95)';
    vrButton.style.border = '2px solid #00ffff';
    vrButton.style.color = '#00ffff';
    vrButton.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.2)';
    document.body.appendChild(vrButton);

    // 4. VR Controllers
    setupVRControllers();

    // 5. OrbitControls (Desktop)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 200;
    controls.maxDistance = 3000;

    // 6. Earth Hierarchy
    // earthAnchor: Movimiento global (VR Zoom/Orbit)
    // earthGroup: Inclinación Axial fija (Z = 23.44)
    // rotationGroup: Rotación Diaria (Y = hora)
    earthAnchor = new THREE.Group();
    scene.add(earthAnchor);

    earthGroup = new THREE.Group();
    earthGroup.rotation.z = AXIAL_TILT;
    earthAnchor.add(earthGroup);

    rotationGroup = new THREE.Group();
    earthGroup.add(rotationGroup);

    // 7. Guides & Markers
    createCelestialGuides();
    createStars();
    createCelestialMarkers();

    // 8. Lighting
    const ambientLight = new THREE.AmbientLight(0x222244, 0.4);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    scene.add(sunLight);
    scene.add(sunLight.target);

    createEarth();

    // 9. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupTemporalListeners();

    // Initial state
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    manualDay = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;

    // 10. Start Animation Loop
    renderer.setAnimationLoop(render);

    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1500);
        }, 1500);
    }
}

function createCelestialGuides() {
    // Eje de Rotación (Rojo sutil)
    const axisGeo = new THREE.CylinderGeometry(0.5, 0.5, 450, 8);
    const axisMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.35 });
    const axis = new THREE.Mesh(axisGeo, axisMat);
    // El eje está en earthGroup para seguir la inclinación Z pero no rota con el día
    earthGroup.add(axis);

    // Ecuador Visual (Cian sutil)
    const equatorGeo = new THREE.TorusGeometry(105, 0.4, 8, 100);
    const equatorMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.35 });
    const equator = new THREE.Mesh(equatorGeo, equatorMat);
    equator.rotation.x = Math.PI / 2;
    // El ecuador también está en earthGroup (inclinado pero estático respecto al día)
    earthGroup.add(equator);
}

function createCelestialMarkers() {
    // Marcadores Celestes Fijos (Lejos de la Tierra, en la esfera celeste)
    const markerGeo = new THREE.SphereGeometry(25, 16, 16);
    
    // Polaris (Cerca del Polo Norte Celeste)
    const polarisMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const polaris = new THREE.Mesh(markerGeo, polarisMat);
    polaris.position.set(0, CELESTIAL_RADIUS, 0); 
    scene.add(polaris);

    // Sigma Octantis (Cerca del Polo Sur Celeste)
    const sigmaMat = new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.8 });
    const sigma = new THREE.Mesh(markerGeo, sigmaMat);
    sigma.position.set(0, -CELESTIAL_RADIUS, 0);
    scene.add(sigma);
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.2,
        transparent: true,
        opacity: 0.7
    });

    const starVertices = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        // Distribuir estrellas en una esfera de gran radio
        const r = CELESTIAL_RADIUS;
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        
        starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField); // Estrellas estáticas en la escena
}

function setupVRControllers() {
    controller1 = renderer.xr.getController(0);
    scene.add(controller1);
    
    vrInstructionsHUD = createVRInstructions();
    vrInstructionsHUD.position.set(0, 0.22, 0.05);
    vrInstructionsHUD.rotation.x = -Math.PI / 4;
    controller1.add(vrInstructionsHUD);

    controller2 = renderer.xr.getController(1);
    scene.add(controller2);
}

function createVRInstructions() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    function update() {
        ctx.fillStyle = 'rgba(10, 15, 35, 0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 30px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GUÍAS CELESTES', canvas.width / 2, 50);

        ctx.textAlign = 'left';
        ctx.font = '22px Orbitron, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Joy Izq: Giro Temporal (Star Trails)', 40, 100);
        ctx.fillText('Joy Der: Órbita / Vuelo Polar', 40, 140);
        ctx.fillText('Gatillos: Zoom +/-', 40, 180);

        ctx.font = '18px Orbitron, sans-serif';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.fillText(`Declinación: ${solarDeclination.toFixed(2)}°`, 40, 240);
        ctx.fillText(`H: ${manualHour.toFixed(2)} | D: ${Math.floor(manualDay)}`, 40, 275);
        
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.fillText('OBSERVA LA ROTACIÓN DIFERENCIAL', canvas.width/2, 330);
        
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

function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        const buttons = source.gamepad.buttons;
        const hand = source.handedness;

        if (hand === 'right') {
            if (Math.abs(axes[2]) > 0.1) vrRotateY -= axes[2] * 0.04;
            if (Math.abs(axes[3]) > 0.1) vrRotateX = Math.max(-Math.PI/2, Math.min(Math.PI/2, vrRotateX - axes[3] * 0.04));
            if (buttons[0].pressed) vrZoomValue = Math.max(150, vrZoomValue - 4);
        } else if (hand === 'left') {
            let changed = false;
            // X -> Giro rápido para Star Trails
            if (Math.abs(axes[2]) > 0.1) {
                manualHour = (manualHour + axes[2] * 0.5) % 24; // Acelerado para efecto visual
                if (manualHour < 0) manualHour += 24;
                changed = true;
            }
            // Y -> Cambio de estación
            if (Math.abs(axes[3]) > 0.1) {
                manualDay = Math.max(1, Math.min(365, manualDay + axes[3] * 0.4));
                changed = true;
            }
            if (changed) {
                isLive = false;
                syncVRToDOM();
            }
            if (buttons[0].pressed) vrZoomValue = Math.min(1500, vrZoomValue + 4);
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

    // Rotación Diaria en rotationGroup (Hijo de tiltGroup)
    rotationGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    if (isPresenting) {
        handleVRInput();
        vrCameraRig.rotation.order = 'YXZ';
        vrCameraRig.rotation.y = vrRotateY;
        vrCameraRig.rotation.x = vrRotateX;
        camera.position.set(0, 0, vrZoomValue);
        camera.lookAt(0, 0, 0);

        if (vrInstructionsHUD && vrInstructionsHUD.userData.update) {
            vrInstructionsHUD.userData.update();
        }
        
        // Sun follows Earth Anchor
        sunLight.target.position.copy(earthAnchor.position);
    } else {
        vrCameraRig.rotation.set(0, 0, 0);
        if (controls) controls.update();
        sunLight.target.position.set(0, 0, 0);
    }

    updateSunDynamics();
    if (clouds) clouds.rotation.y += 0.0001;

    renderer.render(scene, camera);
}

function updateSunDynamics() {
    solarDeclination = 23.44 * Math.sin((2 * Math.PI / 365) * (manualDay - 81));
    const declRad = THREE.MathUtils.degToRad(solarDeclination);
    
    // Dirección del Sol fija relativa al eclíptico
    const radius = 3000;
    const sy = radius * Math.sin(declRad);
    const sz = radius * Math.cos(declRad);
    
    sunLight.position.set(0, sy, sz);
    sunLight.target.updateMatrixWorld();

    // Actualizar UI
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(manualDay);
    if (uiDate) uiDate.innerText = date.toLocaleDateString();
    
    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    if (uiTime) uiTime.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00 UTC`;
    if (uiSunCoords) uiSunCoords.innerText = `Decl. Solar: ${solarDeclination.toFixed(2)}°`;
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
    const cloudGeometry = new THREE.SphereGeometry(101, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: loader.load(TEXTURES.clouds),
        transparent: true,
        opacity: 0.4
    });
    clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    rotationGroup.add(clouds);

    // Glow sutil
    const glowTexture = loader.load(TEXTURES.stars);
    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x58a6ff,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(380, 380, 1);
    rotationGroup.add(glow);
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
