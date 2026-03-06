import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer VR Optimized
 * Desarrollado para visualización WebXR y control por Raycasting/Joystick.
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
let clock = new THREE.Clock();

// Raycasting & Dragging State
const raycaster = new THREE.Raycaster();
let isDragging = false;
let activeController = null;
const lastControllerQuaternion = new THREE.Quaternion();

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
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 15000);
    camera.position.set(0, 0, 450);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.xr.enabled = true; // WebXR Enabled
    container.appendChild(renderer.domElement);

    // VR Button Setup
    const vrButton = VRButton.createButton(renderer);
    vrButton.style.position = 'fixed';
    vrButton.style.top = '20px';
    vrButton.style.right = '20px';
    vrButton.style.bottom = 'auto';
    vrButton.style.left = 'auto';
    vrButton.style.zIndex = '9999';
    vrButton.style.background = 'rgba(8, 12, 24, 0.8)';
    vrButton.style.border = '1px solid #3cefff';
    vrButton.style.color = '#3cefff';
    vrButton.style.fontFamily = "'Orbitron', sans-serif";
    vrButton.style.padding = '12px 20px';
    vrButton.style.borderRadius = '8px';
    vrButton.style.boxShadow = '0 0 15px rgba(60, 239, 255, 0.3)';
    document.body.appendChild(vrButton);

    // 4. VR Controllers & Raycasting
    setupControllers();

    // 5. OrbitControls (Hybrid Compatibility)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 200;
    controls.maxDistance = 1000;

    // 6. Earth Group & Lighting
    earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const ambientLight = new THREE.AmbientLight(0x111133, 0.6);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(sunLight);
    scene.add(sunLight.target); // Needed for pointing in VR workspace

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

    // Clean loading
    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }
    }, 2000);
}

function setupControllers() {
    // Controller 1
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    scene.add(controller1);

    // Controller 2
    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    scene.add(controller2);

    // Neon Cyan Rays
    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
    ]);
    const rayMaterial = new THREE.LineBasicMaterial({
        color: 0x3cefff,
        transparent: true,
        opacity: 0.8
    });

    const line1 = new THREE.Line(rayGeometry, rayMaterial);
    line1.scale.z = 100;
    controller1.add(line1);

    const line2 = new THREE.Line(rayGeometry, rayMaterial);
    line2.scale.z = 100;
    controller2.add(line2);
}

function onSelectStart(event) {
    const controller = event.target;

    // Check for intersection with Earth using Raycasting
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // Force update matrices before raycasting to ensure accuracy in moved VR workspace
    scene.updateMatrixWorld(true);

    const intersects = raycaster.intersectObject(earth, true);
    if (intersects.length > 0) {
        isDragging = true;
        activeController = controller;
        lastControllerQuaternion.copy(controller.quaternion);
    }
}

function onSelectEnd() {
    isDragging = false;
    activeController = null;
}

function updateDragInteraction() {
    if (!isDragging || !activeController) return;

    // Map controller rotation delta to Earth rotation
    const currentQuaternion = activeController.quaternion;
    const deltaQuaternion = currentQuaternion.clone().multiply(lastControllerQuaternion.clone().invert());

    earthGroup.quaternion.premultiply(deltaQuaternion);
    lastControllerQuaternion.copy(currentQuaternion);
}

function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (source && source.gamepad) {
            const axes = source.gamepad.axes;

            // Map Joystick: axes[2]/[3] (Standard Right) or axes[0]/[1] (Standard Left)
            let h = 0;
            let v = 0;

            if (axes.length >= 4) {
                h = Math.abs(axes[2]) > 0.1 ? axes[2] : (Math.abs(axes[0]) > 0.1 ? axes[0] : 0);
                v = Math.abs(axes[3]) > 0.1 ? axes[3] : (Math.abs(axes[1]) > 0.1 ? axes[1] : 0);
            } else if (axes.length >= 2) {
                h = axes[0];
                v = axes[1];
            }

            if (Math.abs(h) > 0.1) {
                earthGroup.rotation.y += h * 0.04;
            }
            if (Math.abs(v) > 0.1) {
                earthGroup.rotation.x += v * 0.04;
            }
        }
    }
}

function render() {
    const isPresenting = renderer.xr.isPresenting;

    if (isPresenting) {
        // VR Workspace: Earth 2.5m away, Eye Level (1.6m height)
        earthGroup.position.set(0, 1.6, -2.5);
        earthGroup.scale.set(0.012, 0.012, 0.012); // Scaled to ~2.4m diameter globe

        handleVRInput();
        updateDragInteraction();

        // Redirect Sun target to moved Earth in VR
        sunLight.target.position.set(0, 1.6, -2.5);
    } else {
        // Desktop / Hybrid Mode
        earthGroup.position.set(0, 0, 0);
        earthGroup.scale.set(1, 1, 1);
        if (controls) controls.update();

        // Sun target at origin
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

    // Glow Effect
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
        size: 0.9,
        transparent: true,
        opacity: 0.8
    });

    const starVertices = [];
    for (let i = 0; i < 15000; i++) {
        const x = (Math.random() - 0.5) * 8000;
        const y = (Math.random() - 0.5) * 8000;
        const z = (Math.random() - 0.5) * 8000;
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

    // Solar calculation
    const declination = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
    const longitude = 15 * (12 - decimalTime);

    const phi = (90 - declination) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);

    const radius = 900;
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
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(manualDay);
    viewDayText.innerText = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    viewHourText.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;
}

// Boot
init();
