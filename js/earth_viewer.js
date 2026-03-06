import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer: Stable VR Edition
 * 
 * Hierarchy:
 *   scene
 *     ├── vrCameraRig (pivot at 0,0,0 — orbits via right joystick)
 *     │     ├── camera (offset via camera.position.z = zoom)
 *     │     ├── controller1 (left hand)
 *     │     └── controller2 (right hand)
 *     ├── earthAnchor
 *     │     └── earthGroup (rotation.z = 23.44°)
 *     │           ├── rotationGroup (rotation.y = daily rotation)
 *     │           │     ├── earth
 *     │           │     └── clouds
 *     │           ├── axis (red cylinder)
 *     │           └── equator (cyan torus)
 *     ├── starField (static, direct child of scene)
 *     ├── polaris / sigma octantis (fixed markers)
 *     ├── sunLight
 *     └── ambientLight
 *
 * Controls (VR):
 *   Left Joystick  X → manualHour (0–24)
 *   Left Joystick  Y → manualDay  (1–365)
 *   Right Joystick X → rig.rotation.y (horizontal orbit)
 *   Right Joystick Y → rig.rotation.x (polar flight, clamped)
 *   Left Trigger     → Zoom Out
 *   Right Trigger    → Zoom In
 */

// ──────────────────────────────────────────────
//  CONSTANTS
// ──────────────────────────────────────────────
const AXIAL_TILT = THREE.MathUtils.degToRad(23.44);
const STAR_COUNT  = 5000;
const CELESTIAL_R = 15000;

const TEXTURES = {
    earth:    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    normal:   'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    clouds:   'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'
};

// ──────────────────────────────────────────────
//  GLOBAL REFERENCES
// ──────────────────────────────────────────────
let scene, camera, renderer, controls;
let vrCameraRig;
let controller1, controller2;
let earthAnchor, earthGroup, rotationGroup;
let earth, clouds, sunLight, starField;
let vrInstructionsHUD;

// ──────────────────────────────────────────────
//  STATE
// ──────────────────────────────────────────────
let vrZoom = 500;               // camera distance from rig center
let rigRotY = 0;                // horizontal orbit angle
let rigRotX = 0;                // vertical orbit angle (clamped)
let isLive = true;
let manualDay  = 1;
let manualHour = 12;
let solarDeclination = 0;
let hudDirty = true;            // flag: only update HUD when values change

// ──────────────────────────────────────────────
//  DOM REFERENCES (null-safe)
// ──────────────────────────────────────────────
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


// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
function init() {
    if (!container) return;

    // --- Scene ---
    scene = new THREE.Scene();

    // --- Camera + Rig ---
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(0, 0, vrZoom);  // offset from rig center

    vrCameraRig = new THREE.Group();    // pivot at (0,0,0)
    vrCameraRig.add(camera);
    scene.add(vrCameraRig);

    // --- Renderer (optimized for mobile VR) ---
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // --- VR Button ---
    const vrBtn = VRButton.createButton(renderer);
    vrBtn.style.background = 'rgba(8,12,32,0.9)';
    vrBtn.style.border = '2px solid #00ffff';
    vrBtn.style.color  = '#00ffff';
    document.body.appendChild(vrBtn);

    // --- Controllers ---
    setupControllers();

    // --- OrbitControls (desktop only) ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 150;
    controls.maxDistance = 3000;

    // --- XR session listeners ---
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

    // --- Earth hierarchy ---
    earthAnchor = new THREE.Group();
    scene.add(earthAnchor);

    earthGroup = new THREE.Group();
    earthGroup.rotation.z = AXIAL_TILT;   // permanent 23.44° tilt
    earthAnchor.add(earthGroup);

    rotationGroup = new THREE.Group();    // daily rotation applied here
    earthGroup.add(rotationGroup);

    // --- Build scene elements ---
    createEarth();
    createCelestialGuides();
    createStars();
    createCelestialMarkers();

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0x222244, 0.5));
    sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    scene.add(sunLight);
    scene.add(sunLight.target);

    // --- DOM interaction ---
    window.addEventListener('resize', onResize);
    setupDOMListeners();

    // --- Set initial time from system clock ---
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 0);
    manualDay  = Math.floor((now - yearStart) / 86400000);
    manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;

    // --- Start render loop ---
    renderer.setAnimationLoop(render);

    // --- Hide loading screen ---
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }, 1500);
    }
}


// ══════════════════════════════════════════════
//  CONTROLLERS & HUD
// ══════════════════════════════════════════════
function setupControllers() {
    controller1 = renderer.xr.getController(0);
    vrCameraRig.add(controller1);

    controller2 = renderer.xr.getController(1);
    vrCameraRig.add(controller2);

    // Attach static instruction panel to left hand
    vrInstructionsHUD = buildInstructionPanel();
    vrInstructionsHUD.position.set(0, 0.15, -0.3);
    vrInstructionsHUD.rotation.x = -Math.PI / 6;
    controller1.add(vrInstructionsHUD);
}

/**
 * Builds a STATIC instruction panel (drawn once, never redrawn).
 * This eliminates per-frame canvas work and prevents Oculus crashes.
 */
function buildInstructionPanel() {
    const w = 256, h = 200;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = 'rgba(8, 12, 30, 0.95)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // Title
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CONTROLES VR', w / 2, 26);

    // Instructions
    ctx.textAlign = 'left';
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#ffffff';
    const lines = [
        ['Joy Izq X:', 'Hora del dia'],
        ['Joy Izq Y:', 'Dia del anno'],
        ['Joy Der X:', 'Orbita horizontal'],
        ['Joy Der Y:', 'Vuelo polar'],
        ['Gatillo Izq:', 'Zoom Out'],
        ['Gatillo Der:', 'Zoom In'],
    ];
    lines.forEach(([label, desc], i) => {
        const y = 52 + i * 22;
        ctx.fillStyle = '#00ffff';
        ctx.fillText(label, 14, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(desc, 110, y);
    });

    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.Mesh(
        new THREE.PlaneGeometry(0.30, 0.24),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
}


// ══════════════════════════════════════════════
//  VR INPUT HANDLING
// ══════════════════════════════════════════════
function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const gp   = source.gamepad;
        const axes  = gp.axes;
        const btns  = gp.buttons;
        const hand  = source.handedness;

        // ── LEFT HAND: Time Master ──
        if (hand === 'left') {
            // X axis → Hour (0–24)
            if (Math.abs(axes[2]) > 0.1) {
                manualHour = (manualHour + axes[2] * 0.3 + 24) % 24;
                isLive = false;
                hudDirty = true;
            }
            // Y axis → Day (1–365)
            if (Math.abs(axes[3]) > 0.1) {
                manualDay = Math.max(1, Math.min(365, manualDay + axes[3] * 0.5));
                isLive = false;
                hudDirty = true;
            }
            // Trigger → Zoom OUT
            if (btns[0] && btns[0].pressed) {
                vrZoom = Math.min(2500, vrZoom + 5);
            }
        }

        // ── RIGHT HAND: Orbit Master ──
        if (hand === 'right') {
            // X axis → Horizontal orbit
            if (Math.abs(axes[2]) > 0.1) {
                rigRotY -= axes[2] * 0.04;
            }
            // Y axis → Vertical orbit (clamped to ±85°)
            if (Math.abs(axes[3]) > 0.1) {
                rigRotX = THREE.MathUtils.clamp(
                    rigRotX - axes[3] * 0.04,
                    -Math.PI / 2.1,
                     Math.PI / 2.1
                );
            }
            // Trigger → Zoom IN
            if (btns[0] && btns[0].pressed) {
                vrZoom = Math.max(150, vrZoom - 5);
            }
        }
    }
}


// ══════════════════════════════════════════════
//  RENDER LOOP
// ══════════════════════════════════════════════
function render() {
    const presenting = renderer.xr.isPresenting;

    // --- Live clock ---
    if (isLive) {
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 0);
        const newDay  = Math.floor((now - yearStart) / 86400000);
        const newHour = now.getUTCHours() + now.getUTCMinutes() / 60;
        if (newDay !== Math.floor(manualDay) || Math.abs(newHour - manualHour) > 0.02) {
            manualDay  = newDay;
            manualHour = newHour;
            hudDirty = true;
        }
    }

    // --- Daily rotation (local Y axis of the tilted group) ---
    rotationGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    // --- VR-specific logic ---
    if (presenting) {
        handleVRInput();

        // Apply orbit rotations to the Rig
        vrCameraRig.rotation.order = 'YXZ';
        vrCameraRig.rotation.y = rigRotY;
        vrCameraRig.rotation.x = rigRotX;

        // Apply zoom as camera offset within the rig
        camera.position.z = vrZoom;
    } else {
        // Desktop: reset rig so OrbitControls work cleanly
        vrCameraRig.rotation.set(0, 0, 0);
        if (controls) controls.update();
    }

    // --- Update sun position & DOM only when data changed ---
    if (hudDirty) {
        updateSunPosition();
        syncDOM();
        hudDirty = false;
    }

    // --- Clouds drift ---
    if (clouds) clouds.rotation.y += 0.0001;

    renderer.render(scene, camera);
}


// ══════════════════════════════════════════════
//  SOLAR DYNAMICS
// ══════════════════════════════════════════════
function updateSunPosition() {
    // Solar declination formula
    solarDeclination = 23.44 * Math.sin((2 * Math.PI / 365) * (manualDay - 81));
    const declRad = THREE.MathUtils.degToRad(solarDeclination);

    // Position the sun at a fixed orbital radius
    const R  = 3000;
    const sy = R * Math.sin(declRad);
    const sz = R * Math.cos(declRad);

    if (sunLight) {
        sunLight.position.set(0, sy, sz);
        sunLight.target.position.set(0, 0, 0);
        sunLight.target.updateMatrixWorld();
    }
}


// ══════════════════════════════════════════════
//  DOM SYNCHRONIZATION
// ══════════════════════════════════════════════
function syncDOM() {
    const date = new Date(new Date().getFullYear(), 0);
    date.setDate(Math.floor(manualDay));
    if (uiDate) uiDate.innerText = date.toLocaleDateString();

    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    if (uiTime) uiTime.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:00 UTC`;
    if (uiSunCoords) uiSunCoords.innerText = `Decl. Solar: ${solarDeclination.toFixed(2)}°`;

    // Sync sliders
    if (daySlider)  daySlider.value  = manualDay;
    if (hourSlider) hourSlider.value = manualHour;

    // Sync labels
    if (viewDayText) {
        viewDayText.innerText = isLive
            ? 'Hoy'
            : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    if (viewHourText) {
        viewHourText.innerText = isLive
            ? 'Ahora'
            : `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')} UTC`;
    }

    // Sync mode buttons
    if (liveBtn && manualBtn) {
        liveBtn.classList.toggle('active', isLive);
        manualBtn.classList.toggle('active', !isLive);
    }
}


// ══════════════════════════════════════════════
//  SCENE BUILDERS
// ══════════════════════════════════════════════
function createEarth() {
    const loader = new THREE.TextureLoader();
    earth = new THREE.Mesh(
        new THREE.SphereGeometry(100, 48, 48),
        new THREE.MeshPhongMaterial({
            map:         loader.load(TEXTURES.earth),
            normalMap:   loader.load(TEXTURES.normal),
            normalScale: new THREE.Vector2(0.85, 0.85),
            specularMap: loader.load(TEXTURES.specular),
            specular:    new THREE.Color('grey'),
            shininess:   5
        })
    );
    rotationGroup.add(earth);

    clouds = new THREE.Mesh(
        new THREE.SphereGeometry(101, 32, 32),
        new THREE.MeshPhongMaterial({
            map: loader.load(TEXTURES.clouds),
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        })
    );
    rotationGroup.add(clouds);
}

function createCelestialGuides() {
    // Rotation axis (red cylinder, attached to tilted group)
    const axis = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 500, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 })
    );
    earthGroup.add(axis);

    // Equator ring (cyan torus)
    const equator = new THREE.Mesh(
        new THREE.TorusGeometry(105, 0.4, 8, 80),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 })
    );
    equator.rotation.x = Math.PI / 2;
    earthGroup.add(equator);
}

function createStars() {
    const verts = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        verts[i * 3]     = CELESTIAL_R * Math.sin(phi) * Math.cos(theta);
        verts[i * 3 + 1] = CELESTIAL_R * Math.sin(phi) * Math.sin(theta);
        verts[i * 3 + 2] = CELESTIAL_R * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));

    starField = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.5,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
    }));
    starField.position.set(0, 0, 0);  // fixed at world origin
    scene.add(starField);
}

function createCelestialMarkers() {
    const geo = new THREE.SphereGeometry(20, 12, 12);

    // Polaris (north celestial pole)
    const polaris = new THREE.Mesh(geo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    polaris.position.set(0, CELESTIAL_R, 0);
    scene.add(polaris);

    // Sigma Octantis (south celestial pole)
    const sigma = new THREE.Mesh(geo,
        new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.8 }));
    sigma.position.set(0, -CELESTIAL_R, 0);
    scene.add(sigma);
}


// ══════════════════════════════════════════════
//  DOM LISTENERS
// ══════════════════════════════════════════════
function setupDOMListeners() {
    if (liveBtn) liveBtn.addEventListener('click', () => {
        isLive = true;
        hudDirty = true;
    });
    if (manualBtn) manualBtn.addEventListener('click', () => {
        isLive = false;
        hudDirty = true;
    });
    if (daySlider) daySlider.addEventListener('input', (e) => {
        manualDay = parseInt(e.target.value);
        isLive = false;
        hudDirty = true;
    });
    if (hourSlider) hourSlider.addEventListener('input', (e) => {
        manualHour = parseFloat(e.target.value);
        isLive = false;
        hudDirty = true;
    });
}

function onResize() {
    if (!camera || !renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    if (w < 900) {
        camera.setViewOffset(w, h, 0, -h * 0.4, w, h);
    } else {
        camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}


// ══════════════════════════════════════════════
//  BOOTSTRAP
// ══════════════════════════════════════════════
init();
