import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer: Stable VR Edition v2
 *
 * KEY FIX: WebXR overrides camera.position, so we cannot use it for zoom.
 * Instead, we position the vrCameraRig itself using spherical coordinates
 * computed from (vrZoom, rigRotY, rigRotX). The rig always looks at (0,0,0).
 *
 * Hierarchy:
 *   scene
 *     ├── vrCameraRig  ← position = spherical(zoom, yaw, pitch), lookAt(0,0,0)
 *     │     ├── camera  ← WebXR controls this freely for headset tracking
 *     │     ├── controller1 (left hand) + instruction panel
 *     │     └── controller2 (right hand)
 *     ├── earthAnchor > earthGroup (tilt 23.44°) > rotationGroup (daily)
 *     │     ├── earth, clouds, axis, equator
 *     ├── starField, polaris, sigma (direct scene children)
 *     └── sunLight, ambientLight
 *
 * VR Controls:
 *   Left  Joy X → Hour    | Left  Joy Y → Day
 *   Right Joy X → Orbit H | Right Joy Y → Orbit V
 *   Left  Trigger → Zoom Out | Right Trigger → Zoom In
 */

// ── CONSTANTS ──
const AXIAL_TILT  = THREE.MathUtils.degToRad(23.44);
const STAR_COUNT  = 5000;
const CELESTIAL_R = 15000;
const TEXTURES = {
    earth:    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    normal:   'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    clouds:   'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'
};

// ── GLOBALS ──
let scene, camera, renderer, controls;
let vrCameraRig, controller1, controller2;
let earthAnchor, earthGroup, rotationGroup;
let earth, clouds, sunLight, starField;
let vrInstructionsPanel;

// ── STATE ──
let vrZoom  = 500;     // distance from Earth center
let rigRotY = 0;       // horizontal orbit (radians)
let rigRotX = 0;       // vertical orbit (radians, clamped)
let isLive  = true;
let manualDay  = 1;
let manualHour = 12;
let solarDeclination = 0;
let hudDirty = true;

// ── DOM (null-safe) ──
const container     = document.getElementById('canvas-container');
const loadingScreen = document.getElementById('loading-screen');
const uiDate        = document.getElementById('current-date');
const uiTime        = document.getElementById('current-time');
const uiSunCoords   = document.getElementById('sun-coords');
const liveBtn       = document.getElementById('live-mode');
const manualBtn     = document.getElementById('manual-mode');
const daySlider     = document.getElementById('day-range');
const hourSlider    = document.getElementById('hour-range');
const viewDayText   = document.getElementById('view-day');
const viewHourText  = document.getElementById('view-hour');


// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
function init() {
    if (!container) return;

    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 20000);

    // Camera Rig — its POSITION is what keeps us away from the Earth
    vrCameraRig = new THREE.Group();
    vrCameraRig.add(camera);
    scene.add(vrCameraRig);

    // Set initial rig position (will be overwritten each frame in VR)
    camera.position.set(0, 0, vrZoom); // desktop default

    // Renderer (optimized for Quest)
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // VR Button
    const vrBtn = VRButton.createButton(renderer);
    vrBtn.style.background = 'rgba(8,12,32,0.9)';
    vrBtn.style.border = '2px solid #00ffff';
    vrBtn.style.color = '#00ffff';
    document.body.appendChild(vrBtn);

    // Controllers (children of rig so they move with user)
    setupControllers();

    // Desktop OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 150;
    controls.maxDistance = 3000;

    // XR Session handlers
    renderer.xr.addEventListener('sessionstart', () => {
        if (controls) controls.enabled = false;
    });
    renderer.xr.addEventListener('sessionend', () => {
        if (controls) {
            controls.enabled = true;
            camera.position.set(0, 0, 450);
            camera.lookAt(0, 0, 0);
            controls.update();
        }
    });

    // Earth hierarchy
    earthAnchor = new THREE.Group();
    scene.add(earthAnchor);

    earthGroup = new THREE.Group();
    earthGroup.rotation.z = AXIAL_TILT;
    earthAnchor.add(earthGroup);

    rotationGroup = new THREE.Group();
    earthGroup.add(rotationGroup);

    // Build scene
    createEarth();
    createCelestialGuides();
    createStars();
    createCelestialMarkers();

    // Lighting
    scene.add(new THREE.AmbientLight(0x222244, 0.5));
    sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    scene.add(sunLight);
    scene.add(sunLight.target);

    // DOM
    window.addEventListener('resize', onResize);
    setupDOMListeners();

    // Initial time from clock
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 0);
    manualDay  = Math.floor((now - yearStart) / 86400000);
    manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;

    // Start
    renderer.setAnimationLoop(render);

    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }, 1500);
    }
}


// ════════════════════════════════════════
//  CONTROLLERS + INSTRUCTION PANEL
// ════════════════════════════════════════
function setupControllers() {
    controller1 = renderer.xr.getController(0);
    vrCameraRig.add(controller1);

    controller2 = renderer.xr.getController(1);
    vrCameraRig.add(controller2);

    // Build and attach the instruction panel to left hand
    vrInstructionsPanel = buildInstructionPanel();
    vrInstructionsPanel.position.set(0, 0.12, -0.25);
    vrInstructionsPanel.rotation.x = -Math.PI / 5;
    controller1.add(vrInstructionsPanel);
}

/** Static instruction panel — drawn ONCE, zero per-frame cost */
function buildInstructionPanel() {
    const W = 256, H = 220;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    // Background
    g.fillStyle = 'rgba(6, 10, 28, 0.94)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#00ffff';
    g.lineWidth = 2;
    g.strokeRect(3, 3, W - 6, H - 6);

    // Title
    g.fillStyle = '#00ffff';
    g.font = 'bold 16px sans-serif';
    g.textAlign = 'center';
    g.fillText('CONTROLES VR', W / 2, 24);

    // Separator
    g.beginPath();
    g.moveTo(20, 34);
    g.lineTo(W - 20, 34);
    g.strokeStyle = 'rgba(0,255,255,0.3)';
    g.stroke();

    // Control lines
    g.textAlign = 'left';
    g.font = '12px sans-serif';
    const rows = [
        ['#00ffff', 'Joy Izq X:', '#fff', 'Hora del dia'],
        ['#00ffff', 'Joy Izq Y:', '#fff', 'Dia del anno'],
        ['#00ffff', 'Joy Der X:', '#fff', 'Orbita horizontal'],
        ['#00ffff', 'Joy Der Y:', '#fff', 'Vuelo polar'],
        ['#00ffff', 'Gatillo Izq:', '#fff', 'Zoom Out (-)'],
        ['#00ffff', 'Gatillo Der:', '#fff', 'Zoom In (+)'],
    ];
    rows.forEach(([lc, label, dc, desc], i) => {
        const y = 54 + i * 24;
        g.fillStyle = lc;
        g.fillText(label, 12, y);
        g.fillStyle = dc;
        g.fillText(desc, 105, y);
    });

    // Footer
    g.fillStyle = 'rgba(0,255,255,0.5)';
    g.font = '10px sans-serif';
    g.textAlign = 'center';
    g.fillText('IAstronaut - Modo Observatorio', W / 2, H - 10);

    const tex = new THREE.CanvasTexture(c);
    return new THREE.Mesh(
        new THREE.PlaneGeometry(0.30, 0.26),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
}


// ════════════════════════════════════════
//  VR INPUT
// ════════════════════════════════════════
function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const src of session.inputSources) {
        if (!src.gamepad) continue;
        const ax = src.gamepad.axes;
        const bt = src.gamepad.buttons;

        // ── LEFT HAND: Time Master ──
        if (src.handedness === 'left') {
            if (Math.abs(ax[2]) > 0.1) {
                manualHour = (manualHour + ax[2] * 0.3 + 24) % 24;
                isLive = false;
                hudDirty = true;
            }
            if (Math.abs(ax[3]) > 0.1) {
                manualDay = Math.max(1, Math.min(365, manualDay + ax[3] * 0.5));
                isLive = false;
                hudDirty = true;
            }
            // Trigger = Zoom OUT
            if (bt[0] && bt[0].pressed) vrZoom = Math.min(2500, vrZoom + 4);
        }

        // ── RIGHT HAND: Orbit Master ──
        if (src.handedness === 'right') {
            if (Math.abs(ax[2]) > 0.1) rigRotY -= ax[2] * 0.04;
            if (Math.abs(ax[3]) > 0.1) {
                rigRotX = THREE.MathUtils.clamp(rigRotX - ax[3] * 0.04, -1.4, 1.4);
            }
            // Trigger = Zoom IN
            if (bt[0] && bt[0].pressed) vrZoom = Math.max(150, vrZoom - 4);
        }
    }
}

/**
 * Position the rig in world space using spherical coordinates.
 * This is the KEY to avoiding the "inside the Earth" problem:
 * WebXR can freely set camera.position for head tracking,
 * while the rig.position keeps the user at the correct distance.
 */
function updateRigPosition() {
    const cosP = Math.cos(rigRotX);
    vrCameraRig.position.set(
        vrZoom * Math.sin(rigRotY) * cosP,
        vrZoom * Math.sin(rigRotX),
        vrZoom * Math.cos(rigRotY) * cosP
    );
    vrCameraRig.lookAt(0, 0, 0);
}


// ════════════════════════════════════════
//  RENDER LOOP
// ════════════════════════════════════════
function render() {
    const presenting = renderer.xr.isPresenting;

    // Live clock
    if (isLive) {
        const now = new Date();
        const ys = new Date(now.getFullYear(), 0, 0);
        const nd = Math.floor((now - ys) / 86400000);
        const nh = now.getUTCHours() + now.getUTCMinutes() / 60;
        if (nd !== Math.floor(manualDay) || Math.abs(nh - manualHour) > 0.02) {
            manualDay = nd;
            manualHour = nh;
            hudDirty = true;
        }
    }

    // Daily rotation
    rotationGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    if (presenting) {
        handleVRInput();
        updateRigPosition(); // spherical positioning — always outside the Earth
    } else {
        vrCameraRig.position.set(0, 0, 0);
        vrCameraRig.rotation.set(0, 0, 0);
        if (controls) controls.update();
    }

    // Update sun & DOM only when data changed
    if (hudDirty) {
        updateSunPosition();
        syncDOM();
        hudDirty = false;
    }

    if (clouds) clouds.rotation.y += 0.0001;
    renderer.render(scene, camera);
}


// ════════════════════════════════════════
//  SOLAR DYNAMICS
// ════════════════════════════════════════
function updateSunPosition() {
    solarDeclination = 23.44 * Math.sin((2 * Math.PI / 365) * (manualDay - 81));
    const dr = THREE.MathUtils.degToRad(solarDeclination);
    const R = 3000;
    if (sunLight) {
        sunLight.position.set(0, R * Math.sin(dr), R * Math.cos(dr));
        sunLight.target.position.set(0, 0, 0);
        sunLight.target.updateMatrixWorld();
    }
}


// ════════════════════════════════════════
//  DOM SYNC
// ════════════════════════════════════════
function syncDOM() {
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(Math.floor(manualDay));

    if (uiDate) uiDate.innerText = date.toLocaleDateString();
    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    if (uiTime) uiTime.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:00 UTC`;
    if (uiSunCoords) uiSunCoords.innerText = `Decl. Solar: ${solarDeclination.toFixed(2)}°`;

    if (daySlider)  daySlider.value  = manualDay;
    if (hourSlider) hourSlider.value = manualHour;

    if (viewDayText) viewDayText.innerText = isLive ? 'Hoy' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (viewHourText) viewHourText.innerText = isLive ? 'Ahora' : `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')} UTC`;

    if (liveBtn && manualBtn) {
        liveBtn.classList.toggle('active', isLive);
        manualBtn.classList.toggle('active', !isLive);
    }
}


// ════════════════════════════════════════
//  SCENE BUILDERS
// ════════════════════════════════════════
function createEarth() {
    const ld = new THREE.TextureLoader();
    earth = new THREE.Mesh(
        new THREE.SphereGeometry(100, 48, 48),
        new THREE.MeshPhongMaterial({
            map: ld.load(TEXTURES.earth),
            normalMap: ld.load(TEXTURES.normal),
            normalScale: new THREE.Vector2(0.85, 0.85),
            specularMap: ld.load(TEXTURES.specular),
            specular: new THREE.Color('grey'),
            shininess: 5
        })
    );
    rotationGroup.add(earth);

    clouds = new THREE.Mesh(
        new THREE.SphereGeometry(101, 32, 32),
        new THREE.MeshPhongMaterial({ map: ld.load(TEXTURES.clouds), transparent: true, opacity: 0.4, depthWrite: false })
    );
    rotationGroup.add(clouds);
}

function createCelestialGuides() {
    earthGroup.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 500, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 })
    ));
    const eq = new THREE.Mesh(
        new THREE.TorusGeometry(105, 0.4, 8, 80),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 })
    );
    eq.rotation.x = Math.PI / 2;
    earthGroup.add(eq);
}

function createStars() {
    const v = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        v[i*3]   = CELESTIAL_R * Math.sin(p) * Math.cos(t);
        v[i*3+1] = CELESTIAL_R * Math.sin(p) * Math.sin(t);
        v[i*3+2] = CELESTIAL_R * Math.cos(p);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    starField = new THREE.Points(g, new THREE.PointsMaterial({
        color: 0xffffff, size: 1.5, sizeAttenuation: false,
        transparent: true, opacity: 0.8, depthWrite: false
    }));
    scene.add(starField);
}

function createCelestialMarkers() {
    const g = new THREE.SphereGeometry(20, 12, 12);
    const pol = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    pol.position.set(0, CELESTIAL_R, 0);
    scene.add(pol);
    const sig = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.8 }));
    sig.position.set(0, -CELESTIAL_R, 0);
    scene.add(sig);
}


// ════════════════════════════════════════
//  DOM LISTENERS & RESIZE
// ════════════════════════════════════════
function setupDOMListeners() {
    if (liveBtn)   liveBtn.addEventListener('click', () => { isLive = true; hudDirty = true; });
    if (manualBtn) manualBtn.addEventListener('click', () => { isLive = false; hudDirty = true; });
    if (daySlider)  daySlider.addEventListener('input', e => { manualDay = parseInt(e.target.value); isLive = false; hudDirty = true; });
    if (hourSlider) hourSlider.addEventListener('input', e => { manualHour = parseFloat(e.target.value); isLive = false; hudDirty = true; });
}

function onResize() {
    if (!camera || !renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    w < 900 ? camera.setViewOffset(w, h, 0, -h * 0.4, w, h) : camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

// ════════════════════════════════════════
init();
