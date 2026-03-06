import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Configuration
const TEXTURES = {
    earth: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    normal: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    clouds: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
    stars: 'https://threejs.org/examples/textures/lensflare/lensflare0_alpha.png' // Using this for procedural stars or just background
};

let scene, camera, renderer, controls;
let earth, clouds, sunLight, starField;
let clock = new THREE.Clock();

const container = document.getElementById('canvas-container');
const loadingScreen = document.getElementById('loading-screen');

// UI Elements
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
let manualDay = 81; // Spring Equinox approx
let manualHour = 12; // Noon

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(0, 0, 400);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    container.appendChild(renderer.domElement);

    // --- WebXR VR Support ---
    renderer.xr.enabled = true;

    // Create and style the VR button
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
    vrButton.style.fontSize = '0.75rem';
    vrButton.style.letterSpacing = '2px';
    vrButton.style.padding = '12px 20px';
    vrButton.style.borderRadius = '8px';
    vrButton.style.cursor = 'pointer';
    vrButton.style.boxShadow = '0 0 15px rgba(60, 239, 255, 0.3)';
    document.body.appendChild(vrButton);

    // 4. Controls Setup
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 200;
    controls.maxDistance = 800;

    // 5. Lighting
    // Ambient light for the "night" side (very dim blueish)
    const ambientLight = new THREE.AmbientLight(0x111133, 0.5);
    scene.add(ambientLight);

    // Sun light (Directional)
    sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(sunLight);

    // 6. Earth and Clouds
    createEarth();
    createStars();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupTemporalListeners();

    // Initial state for sliders
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const currentDay = Math.floor(diff / (1000 * 60 * 60 * 24));
    daySlider.value = currentDay;
    hourSlider.value = now.getUTCHours() + now.getUTCMinutes() / 60;
    manualDay = currentDay;
    manualHour = parseFloat(hourSlider.value);

    // Start Animation Loop (WebXR compatible)
    renderer.setAnimationLoop(render);

    // Hide loading screen after textures load (simulated delay for smoothness)
    setTimeout(() => {
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
    }, 2000);
}

function setupTemporalListeners() {
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
    // Convert day of year to a readable date
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(manualDay);
    viewDayText.innerText = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    viewHourText.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;
}

function createEarth() {
    const loader = new THREE.TextureLoader();

    // Earth Geometry
    const geometry = new THREE.SphereGeometry(100, 64, 64);

    // Earth Material
    const material = new THREE.MeshPhongMaterial({
        map: loader.load(TEXTURES.earth),
        normalMap: loader.load(TEXTURES.normal),
        normalScale: new THREE.Vector2(0.85, 0.85),
        specularMap: loader.load(TEXTURES.specular),
        specular: new THREE.Color('grey'),
        shininess: 5
    });

    earth = new THREE.Mesh(geometry, material);
    scene.add(earth);

    // Clouds Geometry (slightly larger than Earth)
    const cloudGeometry = new THREE.SphereGeometry(101, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: loader.load(TEXTURES.clouds),
        transparent: true,
        opacity: 0.4
    });

    clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    scene.add(clouds);

    // Atmosphere Glow (Sprite or custom shader-like effect)
    // For simplicity and premium look, we'll use a large sprite behind the earth
    const glowTexture = loader.load(TEXTURES.stars); // Use existing lensflare as glow
    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x58a6ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(350, 350, 1);
    scene.add(glow);
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.7,
        transparent: true
    });

    const starVertices = [];
    for (let i = 0; i < 15000; i++) {
        // Larger radius (4000) ensures stars are visible inside VR headset
        const x = (Math.random() - 0.5) * 4000;
        const y = (Math.random() - 0.5) * 4000;
        const z = (Math.random() - 0.5) * 4000;
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
        uiDate.innerText = now.toLocaleDateString();
        uiTime.innerText = now.toTimeString().split(' ')[0];

        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now - start;
        dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
        decimalTime = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    } else {
        dayOfYear = manualDay;
        decimalTime = manualHour;

        const date = new Date(new Date().getFullYear(), 0);
        date.setDate(manualDay);
        uiDate.innerText = date.toLocaleDateString();

        const h = Math.floor(manualHour);
        const m = Math.floor((manualHour % 1) * 60);
        uiTime.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
    }

    // Declination (Latitude of Sun)
    // Approx between -23.44 and 23.44 degrees
    const declination = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));

    // Hour Angle (Longitude relative to Greenwich)
    // 0 is noon at Greenwich. Since Earth rotates, the sun "moves" West 15 degrees per hour.
    const longitude = 15 * (12 - decimalTime);

    // Convert to 3D coords
    // Lat/Lon convention in Three.js (standard spherical)
    // lat = declination, lon = longitude
    const phi = (90 - declination) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);

    const radius = 500; // Distance of sun light
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    sunLight.position.set(x, y, z);

    uiSunCoords.innerText = `Lat: ${declination.toFixed(2)}° | Lon: ${longitude.toFixed(2)}°`;
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;

    if (width < 900) {
        // En móviles y tablets pequeñas
        // 1. Zoom: 320 es un buen equilibrio para que la Tierra se vea grande
        camera.position.set(0, 0, 350);

        // 2. Desfase: Movemos la "película" de la cámara hacia arriba un 30% 
        // Esto empuja el objeto (la Tierra) hacia ABAJO visualmente.
        const yOffset = -height * 0.40;
        camera.setViewOffset(width, height, 0, yOffset, width, height);

        // 3. Target: Hacemos que la cámara apunte un poco hacia abajo del centro real
        if (controls) controls.target.set(0, -50, 0);
    } else {
        // En Desktop: Limpiamos cualquier desfase para que vuelva al centro
        camera.clearViewOffset();
        camera.position.set(0, 0, 450);
        if (controls) controls.target.set(0, 0, 0);
    }

    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// --- WebXR-compatible render loop ---
function render(timestamp, frame) {
    const delta = clock.getDelta();

    // Rotate clouds for visual effect
    if (clouds) clouds.rotation.y += 0.0002;

    // Update Sun Position
    updateSunPosition();

    // Update OrbitControls only when NOT in VR session
    if (!renderer.xr.isPresenting) {
        controls.update();
    }

    renderer.render(scene, camera);
}

init();
