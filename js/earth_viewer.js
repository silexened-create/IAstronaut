import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/**
 * IAstronaut - Earth Viewer: High-Precision Astronomy Teaching Tool
 * 
 * Hierarchy:
 * scene -> vrCameraRig -> camera (zoom via position.z)
 * scene -> earthAnchor -> earthGroup (axial tilt 23.44°) -> rotationGroup (localtime Y-rot)
 * 
 * Master VR Controls:
 * - Left Joystick: MASTER DE TIEMPO (X: Hora, Y: Día)
 * - Right Joystick: EXPLORACIÓN ESPACIAL (Órbita del usuario)
 * - Triggers: ZOOM (Derecho: Acercar, Izquierdo: Alejar)
 */

// ── CONSTANTS ──
const AXIAL_TILT = THREE.MathUtils.degToRad(23.44);
const STAR_COUNT = 5000;
const CELESTIAL_R = 15000;
const TEXTURES = {
    earth: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    normal: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    specular: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    clouds: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'
};

// ── GLOBALS ──
let scene, camera, renderer, controls;
let vrCameraRig, vrUserOffset, controller1, controller2;
let earthAnchor, earthGroup, rotationGroup;
let earth, clouds, sunLight, starField;
let vrHUD;

// ── STATE ──
let isLive = true;
let manualDay = 81; // Vernal Equinox
let manualHour = 12;
let solarDeclination = 0;
let hudDirty = true;
let isInVR = false;
let frameCount = 0;

// ── DOM REFERENCES ──
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

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
function init() {
    if (!container) return;

    // 1. Scene
    scene = new THREE.Scene();

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50000);
    camera.position.set(0, 0, 500);

    // 3. VR Rig Hierarchy (Rig > Offset > Camera)
    vrCameraRig = new THREE.Group();
    scene.add(vrCameraRig);

    vrUserOffset = new THREE.Group();
    vrUserOffset.position.set(0, 0, 0); 
    vrCameraRig.add(vrUserOffset);
    vrUserOffset.add(camera);

    // 4. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor'); 
    container.appendChild(renderer.domElement);

    // VR Button
    const vrBtn = VRButton.createButton(renderer);
    vrBtn.style.background = 'rgba(8,12,32,0.9)';
    vrBtn.style.border = '2px solid #00ffff';
    vrBtn.style.color = '#00ffff';
    document.body.appendChild(vrBtn);

    // 5. XR Session Handlers
    renderer.xr.addEventListener('sessionstart', () => {
        isInVR = true;
        vrCameraRig.position.set(0, 0, 0);
        vrCameraRig.rotation.set(0, 0, 0);
        
        // Jerarquía de Rig para VR
        vrUserOffset.position.set(0, 0, 500);
        camera.position.set(0, 0, 0); 
        
        if (controls) controls.enabled = false;
        if (vrHUD) vrHUD.visible = true;
    });
    renderer.xr.addEventListener('sessionend', () => {
        isInVR = false;
        
        // Restaurar para escritorio
        vrUserOffset.position.set(0, 0, 0);
        camera.position.set(0, 0, 500);
        vrCameraRig.rotation.set(0, 0, 0);
        camera.lookAt(0, 0, 0);
        
        if (controls) {
            controls.enabled = true;
            controls.update();
        }
        if (vrHUD) vrHUD.visible = false;
    });

    // 6. Controllers & HUD
    setupVRControllers();

    // 7. OrbitControls (Desktop)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 150;
    controls.maxDistance = 5000;

    // 8. Earth Hierarchy (Precision Science)
    earthAnchor = new THREE.Group();
    scene.add(earthAnchor);

    earthGroup = new THREE.Group();
    earthGroup.rotation.z = AXIAL_TILT; // Permanent Axial Tilt
    earthAnchor.add(earthGroup);

    rotationGroup = new THREE.Group(); // Handles Local Time Rotation
    earthGroup.add(rotationGroup);

    createEarth();
    createStars();
    createCelestialGuides();

    // 9. Lighting
    scene.add(new THREE.AmbientLight(0x223344, 0.15)); // Luz tenue para distinguir la sombra sin perder oscuridad
    sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(sunLight);
    scene.add(sunLight.target);

    // 10. Start
    window.addEventListener('resize', onResize);
    setupDOMListeners();

    // Initial Sync
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    manualDay = Math.floor((now - start) / 86400000);
    manualHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    hudDirty = true;

    renderer.setAnimationLoop(render);

    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.classList.add('hidden'), 1000);
        }, 1500);
    }
}

// ════════════════════════════════════════
//  SCENE OBJECTS
// ════════════════════════════════════════
function createEarth() {
    const loader = new THREE.TextureLoader();
    earth = new THREE.Mesh(
        new THREE.SphereGeometry(100, 64, 64),
        new THREE.MeshPhongMaterial({
            map: loader.load(TEXTURES.earth),
            normalMap: loader.load(TEXTURES.normal),
            normalScale: new THREE.Vector2(0.85, 0.85),
            specularMap: loader.load(TEXTURES.specular),
            specular: new THREE.Color('grey'),
            shininess: 5
        })
    );
    rotationGroup.add(earth);

    clouds = new THREE.Mesh(
        new THREE.SphereGeometry(101.5, 32, 32),
        new THREE.MeshPhongMaterial({
            map: loader.load(TEXTURES.clouds),
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        })
    );
    rotationGroup.add(clouds);
}

function createStars() {
    const vertices = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        vertices.push(
            CELESTIAL_R * Math.sin(phi) * Math.cos(theta),
            CELESTIAL_R * Math.sin(phi) * Math.sin(theta),
            CELESTIAL_R * Math.cos(phi)
        );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    starField = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.5,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
    }));
    scene.add(starField);
}

function createCelestialGuides() {
    // Hidden or removed debug guides as requested
}

// ════════════════════════════════════════
//  VR HUD & CONTROLLERS
// ════════════════════════════════════════
function setupVRControllers() {
    controller1 = renderer.xr.getController(0);
    vrUserOffset.add(controller1);

    controller2 = renderer.xr.getController(1);
    vrUserOffset.add(controller2);

    const w = 512, h = 420;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    const tex = new THREE.CanvasTexture(canvas);
    vrHUD = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.26),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    vrHUD.position.set(0, 0.18, -0.2);
    vrHUD.rotation.x = -Math.PI / 4.5;
    vrHUD.visible = false;
    controller1.add(vrHUD);

    vrHUD.userData.update = () => {
        ctx.fillStyle = 'rgba(8, 12, 32, 0.96)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 6;
        ctx.strokeRect(5, 5, w - 10, h - 10);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ESTACIÓN IASTRONAUT VR', w / 2, 60);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '26px sans-serif';
        ctx.fillText(`Dia del Año: ${Math.floor(manualDay)}`, 40, 115);
        ctx.fillText(`Hora Local: ${Math.floor(manualHour)}:${Math.floor((manualHour % 1) * 60).toString().padStart(2, '0')} UTC`, 40, 155);
        ctx.fillText(`Lat. Sub-Solar: ${solarDeclination.toFixed(2)}°`, 40, 195);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('MANUAL DE VUELO:', 40, 255);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px sans-serif';
        ctx.fillText('• Mano Izq: Viaje en el Tiempo', 40, 300);
        ctx.fillText('• Mano Der: Exploración Espacial', 40, 340);
        ctx.fillText('• Gatillos o Grip: Zoom +/-', 40, 380);

        tex.needsUpdate = true;
    };
}

// ════════════════════════════════════════
//  VR INPUT HANDLING
// ════════════════════════════════════════
function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const ax = source.gamepad.axes;
        const bt = source.gamepad.buttons;
        const deadzone = 0.1;

        // ── MANO IZQUIERDA: Master de Tiempo ──
        if (source.handedness === 'left') {
            // X: Día del año (manualDay)
            if (Math.abs(ax[2]) > deadzone) {
                manualDay = THREE.MathUtils.clamp(manualDay + ax[2] * 0.15, 1, 365);
                isLive = false;
                hudDirty = true;
            }
            // Y: Hora del día (manualHour)
            if (Math.abs(ax[3]) > deadzone) {
                manualHour = (manualHour + ax[3] * 0.04 + 24) % 24;
                isLive = false;
                hudDirty = true;
            }
            // Trigger o Grip: Zoom Out (Alejar) analógico
            const zoomOutVal = Math.max(bt[0] ? bt[0].value : 0, bt[1] ? bt[1].value : 0);
            if (zoomOutVal > 0.05) {
                vrUserOffset.position.z = THREE.MathUtils.clamp(vrUserOffset.position.z + zoomOutVal * 10, 150, 5000);
            }
        }

        // ── MANO DERECHA: Exploración Espacial ──
        if (source.handedness === 'right') {
            // Joystick controla órbita del usuario
            if (Math.abs(ax[2]) > deadzone) {
                vrCameraRig.rotation.y -= ax[2] * 0.015;
            }
            if (Math.abs(ax[3]) > deadzone) {
                vrCameraRig.rotation.x = THREE.MathUtils.clamp(
                    vrCameraRig.rotation.x - ax[3] * 0.015, 
                    -Math.PI / 2.1, 
                    Math.PI / 2.1
                );
            }
            // Trigger o Grip: Zoom In (Acercar) analógico
            const zoomInVal = Math.max(bt[0] ? bt[0].value : 0, bt[1] ? bt[1].value : 0);
            if (zoomInVal > 0.05) {
                vrUserOffset.position.z = THREE.MathUtils.clamp(vrUserOffset.position.z - zoomInVal * 10, 150, 5000);
            }
        }
    }
}

// ════════════════════════════════════════
//  RENDER LOOP
// ════════════════════════════════════════
function render() {
    if (isLive) {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const d = Math.floor((now - start) / 86400000);
        const h = now.getUTCHours() + now.getUTCMinutes() / 60;
        if (d !== Math.floor(manualDay) || Math.abs(h - manualHour) > 0.01) {
            manualDay = d;
            manualHour = h;
            hudDirty = true;
        }
    }

    // Daily Rotation: Local Y within the tilted structure
    rotationGroup.rotation.y = (manualHour / 24) * Math.PI * 2 + Math.PI;

    if (isInVR) {
        handleVRInput();
    } else {
        if (controls) controls.update();
    }

    frameCount++;

    // Scientific Logic Updates
    if (hudDirty) {
        updateSunDynamics();
        syncDOM();
        if (vrHUD && vrHUD.userData.update) vrHUD.userData.queuedUpdate = true;
        hudDirty = false;
    }

    if (vrHUD && vrHUD.userData.queuedUpdate && frameCount % 15 === 0) {
        vrHUD.userData.update();
        vrHUD.userData.queuedUpdate = false;
    }

    if (clouds) clouds.rotation.y += 0.0001;

    // Light Alignment: Target follows Earth
    if (sunLight) {
        sunLight.target.position.copy(earthAnchor.position);
        sunLight.target.updateMatrixWorld();
    }

    renderer.render(scene, camera);
}

// ════════════════════════════════════════
//  DYNAMICS & SYNC
// ════════════════════════════════════════
function updateSunDynamics() {
    // Solar Declination: 23.44 * sin((2π/365) * (day - 81))
    solarDeclination = 23.44 * Math.sin((2 * Math.PI / 365) * (manualDay - 81));
    const decRad = THREE.MathUtils.degToRad(solarDeclination);

    // Position sunLight relative to the tilted earth
    const R = 3000;
    const sy = R * Math.sin(decRad);
    const sz = R * Math.cos(decRad);

    if (sunLight) {
        // Adjust sun position and target to follow the earthAnchor
        sunLight.position.set(earthAnchor.position.x, earthAnchor.position.y + sy, earthAnchor.position.z + sz);
        sunLight.target.position.copy(earthAnchor.position);
        sunLight.target.updateMatrixWorld();
    }
    if (uiSunCoords) uiSunCoords.innerText = `Decl. Solar: ${solarDeclination.toFixed(2)}°`;
}

function syncDOM() {
    const d = new Date(new Date().getFullYear(), 0);
    d.setDate(Math.floor(manualDay));
    if (uiDate) uiDate.innerText = d.toLocaleDateString();

    const h = Math.floor(manualHour);
    const m = Math.floor((manualHour % 1) * 60);
    if (uiTime) uiTime.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00 UTC`;

    if (daySlider) daySlider.value = manualDay;
    if (hourSlider) hourSlider.value = manualHour;

    if (viewDayText) viewDayText.innerText = isLive ? 'Hoy' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (viewHourText) viewHourText.innerText = isLive ? 'Ahora' : `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;

    if (liveBtn && manualBtn) {
        liveBtn.classList.toggle('active', isLive);
        manualBtn.classList.toggle('active', !isLive);
    }
}

function setupDOMListeners() {
    if (liveBtn) liveBtn.addEventListener('click', () => { isLive = true; hudDirty = true; });
    if (manualBtn) manualBtn.addEventListener('click', () => { isLive = false; hudDirty = true; });
    if (daySlider) daySlider.addEventListener('input', (e) => { manualDay = parseInt(e.target.value); isLive = false; hudDirty = true; });
    if (hourSlider) hourSlider.addEventListener('input', (e) => { manualHour = parseFloat(e.target.value); isLive = false; hudDirty = true; });
}

function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    if (w < 900 && !isInVR) {
        camera.setViewOffset(w, h, 0, -h * 0.35, w, h);
    } else {
        camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

// Despegue
init();