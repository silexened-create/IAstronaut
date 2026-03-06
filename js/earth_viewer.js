import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer v4 (Robust Blank-Screen Fix)
 *
 * Fixes applied:
 *  1. LoadingManager with onError fallback to solid-color material
 *  2. renderer.setClearColor(0x000000, 1) — no transparent canvas
 *  3. camera.near=0.1, camera.far=50000, explicit lookAt before loop
 *  4. AxesHelper(500) for visibility diagnosis
 *  5. Debug logging in render() for scene.children count
 *  6. Dual-mode camera: scene child (desktop) ↔ rig child (VR)
 */

// ── CONSTANTS ──
const AXIAL_TILT  = THREE.MathUtils.degToRad(23.44);
const STAR_COUNT  = 5000;
const CELESTIAL_R = 15000;

const TEXTURE_URLS = {
    earth:    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    normal:   'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    clouds:   'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'
};

// ── LOADING MANAGER (with fallback) ──
const loadingManager = new THREE.LoadingManager(
    () => console.log('[IAstronaut] All textures loaded successfully'),
    (url, loaded, total) => console.log(`[IAstronaut] Loading: ${loaded}/${total} — ${url.split('/').pop()}`),
    (url) => console.error('[IAstronaut] FAILED to load texture:', url)
);
const textureLoader = new THREE.TextureLoader(loadingManager);

/** Load a texture with automatic fallback to a solid color */
function loadTexture(url, fallbackColor) {
    try {
        const tex = textureLoader.load(
            url,
            (t) => console.log('[IAstronaut] Loaded:', url.split('/').pop()),
            undefined,
            (err) => {
                console.warn('[IAstronaut] Texture error, using fallback color for:', url);
            }
        );
        return tex;
    } catch (e) {
        console.warn('[IAstronaut] Exception loading texture, using null');
        return null;
    }
}

// ── GLOBALS ──
let scene, camera, renderer, controls;
let vrCameraRig, controller1, controller2;
let earthAnchor, earthGroup, rotationGroup;
let earth, clouds, sunLight, starField;
let vrInstructionsPanel;

// ── STATE ──
let vrZoom  = 500;
let rigRotY = 0;
let rigRotX = 0;
let isLive  = true;
let manualDay  = 1;
let manualHour = 12;
let solarDeclination = 0;
let hudDirty = true;
let isInVR = false;
let debugCounter = 0;

// ── DOM ──
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
    if (!container) {
        console.error('[IAstronaut] FATAL: #canvas-container not found in DOM');
        return;
    }
    console.log('[IAstronaut] init() starting...');

    // ── Scene ──
    scene = new THREE.Scene();

    // ── Camera — safe defaults ──
    camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,     // near — very close to avoid clipping
        50000    // far — covers stars at 15000
    );
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
    scene.add(camera);   // Desktop: camera is a direct child of scene
    console.log('[IAstronaut] Camera created at (0, 0, 500), near=0.1, far=50000');

    // ── VR Camera Rig (only used during VR sessions) ──
    vrCameraRig = new THREE.Group();
    scene.add(vrCameraRig);

    // ── Renderer ──
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setClearColor(0x000000, 1);   // SOLID BLACK — no transparency issues
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    console.log('[IAstronaut] Renderer created with setClearColor(black, 1)');

    // ── VR Button ──
    const vrBtn = VRButton.createButton(renderer);
    vrBtn.style.background = 'rgba(8,12,32,0.9)';
    vrBtn.style.border = '2px solid #00ffff';
    vrBtn.style.color = '#00ffff';
    document.body.appendChild(vrBtn);

    // ── Controllers ──
    controller1 = renderer.xr.getController(0);
    vrCameraRig.add(controller1);
    controller2 = renderer.xr.getController(1);
    vrCameraRig.add(controller2);

    vrInstructionsPanel = buildInstructionPanel();
    vrInstructionsPanel.position.set(0, 0.12, -0.25);
    vrInstructionsPanel.rotation.x = -Math.PI / 5;
    controller1.add(vrInstructionsPanel);

    // ── Desktop OrbitControls ──
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 150;
    controls.maxDistance = 3000;
    controls.target.set(0, 0, 0);
    controls.update();

    // ── XR session handlers ──
    renderer.xr.addEventListener('sessionstart', onVRStart);
    renderer.xr.addEventListener('sessionend', onVREnd);

    // ── Earth hierarchy ──
    earthAnchor = new THREE.Group();
    scene.add(earthAnchor);

    earthGroup = new THREE.Group();
    earthGroup.rotation.z = AXIAL_TILT;
    earthAnchor.add(earthGroup);

    rotationGroup = new THREE.Group();
    earthGroup.add(rotationGroup);

    // ── Build scene elements ──
    createEarth();
    createCelestialGuides();
    createStars();
    createCelestialMarkers();

    // ── VISIBILITY FALLBACK: AxesHelper to diagnose blank screen ──
    const axesHelper = new THREE.AxesHelper(500);
    scene.add(axesHelper);
    console.log('[IAstronaut] AxesHelper(500) added. If you see colored lines but no Earth, the issue is textures/materials.');

    // ── Lighting ──
    const ambient = new THREE.AmbientLight(0x446688, 1.2);
    scene.add(ambient);
    console.log('[IAstronaut] AmbientLight intensity=1.2');

    sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ── Initial sun position ──
    updateSunPosition();

    // ── DOM listeners ──
    window.addEventListener('resize', onResize);
    setupDOMListeners();

    // ── Set initial time ──
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 0);
    manualDay  = Math.floor((now - yearStart) / 86400000);
    manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    hudDirty = true;

    // ── Final camera confirmation ──
    camera.lookAt(0, 0, 0);
    console.log('[IAstronaut] Final camera pos:', camera.position.toArray());
    console.log('[IAstronaut] scene.children count:', scene.children.length);
    console.log('[IAstronaut] earthGroup.children:', earthGroup.children.length);
    console.log('[IAstronaut] rotationGroup.children:', rotationGroup.children.length);

    // ── Start render loop ──
    renderer.setAnimationLoop(render);
    console.log('[IAstronaut] Animation loop started');

    // ── Loading screen ──
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }, 2500);
    }
}


// ════════════════════════════════════════
//  VR SESSION
// ════════════════════════════════════════
function onVRStart() {
    console.log('[IAstronaut] VR session START');
    isInVR = true;
    if (controls) controls.enabled = false;

    // Re-parent camera to rig
    scene.remove(camera);
    vrCameraRig.add(camera);
    camera.position.set(0, 0, 0);

    // Force rig position outside Earth
    updateRigPosition();
    console.log('[IAstronaut] VR rig at:', vrCameraRig.position.toArray());
}

function onVREnd() {
    console.log('[IAstronaut] VR session END');
    isInVR = false;

    // Return camera to scene
    vrCameraRig.remove(camera);
    scene.add(camera);

    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
    if (controls) {
        controls.enabled = true;
        controls.target.set(0, 0, 0);
        controls.update();
    }
}


// ════════════════════════════════════════
//  INSTRUCTION PANEL (static)
// ════════════════════════════════════════
function buildInstructionPanel() {
    const W = 256, H = 220;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    g.fillStyle = 'rgba(6, 10, 28, 0.94)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#00ffff';
    g.lineWidth = 2;
    g.strokeRect(3, 3, W - 6, H - 6);

    g.fillStyle = '#00ffff';
    g.font = 'bold 16px sans-serif';
    g.textAlign = 'center';
    g.fillText('CONTROLES VR', W / 2, 24);

    g.beginPath(); g.moveTo(20, 34); g.lineTo(W - 20, 34);
    g.strokeStyle = 'rgba(0,255,255,0.3)'; g.stroke();

    g.textAlign = 'left';
    g.font = '12px sans-serif';
    const rows = [
        ['Joy Izq X:', 'Hora del dia'],
        ['Joy Izq Y:', 'Dia del anno'],
        ['Joy Der X:', 'Orbita horizontal'],
        ['Joy Der Y:', 'Vuelo polar'],
        ['Gatillo Izq:', 'Zoom Out (-)'],
        ['Gatillo Der:', 'Zoom In (+)'],
    ];
    rows.forEach(([label, desc], i) => {
        const y = 54 + i * 24;
        g.fillStyle = '#00ffff'; g.fillText(label, 12, y);
        g.fillStyle = '#ffffff'; g.fillText(desc, 108, y);
    });

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

        if (src.handedness === 'left') {
            if (Math.abs(ax[2]) > 0.1) {
                manualHour = (manualHour + ax[2] * 0.3 + 24) % 24;
                isLive = false; hudDirty = true;
            }
            if (Math.abs(ax[3]) > 0.1) {
                manualDay = Math.max(1, Math.min(365, manualDay + ax[3] * 0.5));
                isLive = false; hudDirty = true;
            }
            if (bt[0] && bt[0].pressed) vrZoom = Math.min(2500, vrZoom + 4);
        }

        if (src.handedness === 'right') {
            if (Math.abs(ax[2]) > 0.1) rigRotY -= ax[2] * 0.04;
            if (Math.abs(ax[3]) > 0.1) {
                rigRotX = THREE.MathUtils.clamp(rigRotX - ax[3] * 0.04, -1.4, 1.4);
            }
            if (bt[0] && bt[0].pressed) vrZoom = Math.max(150, vrZoom - 4);
        }
    }
}

function updateRigPosition() {
    const cp = Math.cos(rigRotX);
    vrCameraRig.position.set(
        vrZoom * Math.sin(rigRotY) * cp,
        vrZoom * Math.sin(rigRotX),
        vrZoom * Math.cos(rigRotY) * cp
    );
    vrCameraRig.lookAt(0, 0, 0);
}


// ════════════════════════════════════════
//  RENDER LOOP
// ════════════════════════════════════════
function render() {
    // ── Live clock ──
    if (isLive) {
        const now = new Date();
        const ys = new Date(now.getFullYear(), 0, 0);
        const nd = Math.floor((now - ys) / 86400000);
        const nh = now.getUTCHours() + now.getUTCMinutes() / 60;
        if (nd !== Math.floor(manualDay) || Math.abs(nh - manualHour) > 0.02) {
            manualDay = nd; manualHour = nh; hudDirty = true;
        }
    }

    // ── Daily rotation ──
    rotationGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    // ── Mode-specific logic ──
    if (isInVR) {
        handleVRInput();
        updateRigPosition();
    } else {
        if (controls) controls.update();
    }

    // ── Update data only when changed ──
    if (hudDirty) {
        updateSunPosition();
        syncDOM();
        hudDirty = false;
    }

    if (clouds) clouds.rotation.y += 0.0001;

    // ── SCENE GRAPH DEBUG (every ~5 sec) ──
    debugCounter++;
    if (debugCounter % 300 === 0) {
        console.log('[IAstronaut] RENDER DEBUG:',
            'scene.children=' + scene.children.length,
            '| rotationGroup.children=' + (rotationGroup ? rotationGroup.children.length : 'N/A'),
            '| earth in rotationGroup=' + (rotationGroup && earth ? rotationGroup.children.includes(earth) : false),
            '| cam.pos=(' + camera.position.x.toFixed(0) + ',' + camera.position.y.toFixed(0) + ',' + camera.position.z.toFixed(0) + ')',
            '| VR=' + isInVR
        );
    }

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
    if (uiTime) uiTime.innerText = h.toString().padStart(2,'0') + ':' + m.toString().padStart(2,'0') + ':00 UTC';
    if (uiSunCoords) uiSunCoords.innerText = 'Decl. Solar: ' + solarDeclination.toFixed(2) + '\u00b0';

    if (daySlider) daySlider.value = manualDay;
    if (hourSlider) hourSlider.value = manualHour;

    if (viewDayText) viewDayText.innerText = isLive ? 'Hoy' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (viewHourText) viewHourText.innerText = isLive ? 'Ahora' : h.toString().padStart(2,'0') + ':' + m.toString().padStart(2,'0') + ' UTC';

    if (liveBtn && manualBtn) {
        liveBtn.classList.toggle('active', isLive);
        manualBtn.classList.toggle('active', !isLive);
    }
}


// ════════════════════════════════════════
//  SCENE BUILDERS
// ════════════════════════════════════════
function createEarth() {
    console.log('[IAstronaut] createEarth() — loading textures...');

    // Fallback material in case ALL textures fail
    const fallbackMat = new THREE.MeshPhongMaterial({
        color: 0x2244aa,
        emissive: 0x112244,
        shininess: 10
    });

    // Load textures with CORS-safe fallback
    const earthTex   = loadTexture(TEXTURE_URLS.earth);
    const normalTex  = loadTexture(TEXTURE_URLS.normal);
    const specTex    = loadTexture(TEXTURE_URLS.specular);

    let material;
    if (earthTex) {
        material = new THREE.MeshPhongMaterial({
            map: earthTex,
            normalMap: normalTex,
            normalScale: new THREE.Vector2(0.85, 0.85),
            specularMap: specTex,
            specular: new THREE.Color('grey'),
            shininess: 5
        });
        console.log('[IAstronaut] Earth material created WITH textures');
    } else {
        material = fallbackMat;
        console.warn('[IAstronaut] Earth using FALLBACK solid blue material');
    }

    earth = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 48), material);
    rotationGroup.add(earth);
    console.log('[IAstronaut] Earth mesh added to rotationGroup. Children now:', rotationGroup.children.length);

    // Clouds
    const cloudTex = loadTexture(TEXTURE_URLS.clouds);
    const cloudMat = cloudTex
        ? new THREE.MeshPhongMaterial({ map: cloudTex, transparent: true, opacity: 0.4, depthWrite: false })
        : new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false });

    clouds = new THREE.Mesh(new THREE.SphereGeometry(101, 32, 32), cloudMat);
    rotationGroup.add(clouds);
}

function createCelestialGuides() {
    const axis = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 500, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 })
    );
    earthGroup.add(axis);

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
//  DOM & RESIZE
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
    if (w < 900) {
        camera.setViewOffset(w, h, 0, -h * 0.4, w, h);
    } else {
        camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

// ════════════════════════════════════════
init();