import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - MODO OBSERVATORIO POLAR (VR)
 * Simulación pedagógica de alta precisión para ciclos polares y sol de medianoche.
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

// VR Rigging & State
let vrCameraRig; // El grupo que orbiará la Tierra en VR
let vrZoomValue = 450;
let vrRotateX = 0;
let vrRotateY = 0;

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

    // 2. Camera & Rig Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 25000);
    
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
    vrButton.style.background = 'rgba(10, 25, 50, 0.95)';
    vrButton.style.border = '2px solid #00ffff';
    vrButton.style.color = '#00ffff';
    document.body.appendChild(vrButton);

    // 4. VR Controllers
    setupVRControllers();

    // 5. OrbitControls (Escritorio) - Actúa sobre el rig para consistencia
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 200;
    controls.maxDistance = 2000;

    // 6. Earth Group (Eje Inclinado Fijo)
    earthGroup = new THREE.Group();
    earthGroup.rotation.z = AXIAL_TILT; 
    scene.add(earthGroup);

    const ambientLight = new THREE.AmbientLight(0x111133, 0.5);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
    scene.add(sunLight);
    scene.add(sunLight.target);

    createEarth();
    createStars();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupTemporalListeners();

    // Sincronización inicial
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    manualDay = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;

    // 8. Start Animation Loop
    renderer.setAnimationLoop(render);

    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }, 1500);
    }
}

function setupVRControllers() {
    // Control Izquierdo (Mando HUD)
    controller1 = renderer.xr.getController(0);
    scene.add(controller1);
    
    vrInstructionsHUD = createVRInstructions();
    vrInstructionsHUD.position.set(0, 0.2, 0.05);
    vrInstructionsHUD.rotation.x = -Math.PI / 4;
    controller1.add(vrInstructionsHUD);

    // Control Derecho
    controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    // Punteros laser sutiles
    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-0.5)]);
    const laserMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 });
    controller1.add(new THREE.Line(laserGeo, laserMat));
    controller2.add(new THREE.Line(laserGeo, laserMat));
}

function createVRInstructions() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    function update() {
        ctx.fillStyle = 'rgba(8, 20, 45, 0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 30px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('OBSERVATORIO POLAR', canvas.width / 2, 50);

        ctx.textAlign = 'left';
        ctx.font = '22px Orbitron, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Joy Der: Vuela a los Polos (Órbita)', 40, 100);
        ctx.fillText('Joy Izq: Control Tiempo (Día/Hora)', 40, 140);
        ctx.fillText('Gatillos: Zoom +/-', 40, 180);

        ctx.font = 'italic 18px Orbitron, sans-serif';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.fillText(`Declinación: ${solarDeclination.toFixed(2)}°`, 40, 240);
        ctx.fillText(`Día: ${Math.floor(manualDay)} | Hora: ${manualHour.toFixed(2)}h`, 40, 275);
        
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.fillText('ESTUDIO DEL SOL DE MEDIANOCHE', canvas.width/2, 330);
        
        hudTexture.needsUpdate = true;
    }

    const hudTexture = new THREE.CanvasTexture(canvas);
    const hudMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.21),
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

        // MANO DERECHA: Órbita de la Cámara (Rig)
        if (hand === 'right') {
            // Rotación Horizontal (Giro alrededor de la Tierra)
            if (Math.abs(axes[2]) > 0.1) vrRotateY -= axes[2] * 0.04;
            // Rotación Vertical (Vuelo sobre Polos) con límite de 90°
            if (Math.abs(axes[3]) > 0.1) {
                vrRotateX = Math.max(-Math.PI/2, Math.min(Math.PI/2, vrRotateX - axes[3] * 0.04));
            }
            // Zoom In (Gatillo)
            if (buttons[0].pressed) vrZoomValue = Math.max(150, vrZoomValue - 4);
        }

        // MANO IZQUIERDA: Control del Tiempo
        else if (hand === 'left') {
            let changed = false;
            // X -> Hora (Rotación axial Tierra)
            if (Math.abs(axes[2]) > 0.1) {
                manualHour = (manualHour + axes[2] * 0.2) % 24;
                if (manualHour < 0) manualHour += 24;
                changed = true;
            }
            // Y -> Día (Simulación estacional)
            if (Math.abs(axes[3]) > 0.1) {
                manualDay = Math.max(1, Math.min(365, manualDay + axes[3] * 0.5));
                changed = true;
            }
            if (changed) {
                isLive = false;
                syncVRToDOM();
            }
            // Zoom Out (Gatillo)
            if (buttons[0].pressed) vrZoomValue = Math.min(1800, vrZoomValue + 4);
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

    // FÍSICA: Rotación Diaria sobre el Eje Inclinado
    // La Tierra rota sobre su eje Y local. 
    earthGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    if (isPresenting) {
        handleVRInput();
        
        // Aplicar rotaciones al Rig de la Cámara
        vrCameraRig.rotation.order = 'YXZ'; // Primero horizontal, luego vertical
        vrCameraRig.rotation.y = vrRotateY;
        vrCameraRig.rotation.x = vrRotateX;
        
        // La cámara siempre mira al centro desde su distancia de zoom
        camera.position.set(0, 0, vrZoomValue);
        camera.lookAt(0, 0, 0);

        if (vrInstructionsHUD && vrInstructionsHUD.userData.update) {
            vrInstructionsHUD.userData.update();
        }
    } else {
        // Modo Escritorio: Reseteo del Rig para OrbitControls
        vrCameraRig.rotation.set(0, 0, 0);
        if (controls) controls.update();
    }

    updateSunPosition();
    if (clouds) clouds.rotation.y += 0.0001;

    renderer.render(scene, camera);
}

function updateSunPosition() {
    // Cálculo estricto de Declinación Solar
    solarDeclination = 23.44 * Math.sin((2 * Math.PI / 365) * (manualDay - 81));
    const declRad = THREE.MathUtils.degToRad(solarDeclination);
    
    // Posicionar el Sol en el eje Y-Z relativo al ecuador celeste
    const radius = 2500;
    const sy = radius * Math.sin(declRad);
    const sz = radius * Math.cos(declRad);
    
    // El Sol se mantiene en una dirección fija para simular la órbita terrestre
    sunLight.position.set(0, sy, sz);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();

    // Actualizar UI DOM
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
        shininess: 10
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

    // Glow
    const glowTexture = loader.load(TEXTURES.stars);
    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x58a6ff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(380, 380, 1);
    earthGroup.add(glow);
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.8 });
    const starVertices = [];
    for (let i = 0; i < 20000; i++) {
        const x = (Math.random() - 0.5) * 15000;
        const y = (Math.random() - 0.5) * 15000;
        const z = (Math.random() - 0.5) * 15000;
        starVertices.push(x, y, z);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    scene.add(new THREE.Points(starGeometry, starMaterial));
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
