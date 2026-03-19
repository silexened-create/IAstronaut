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
let sunVisual, sunRayLine;
let vrHUD;

// ── STATE ──
let isLive = true;
let manualDay = 81; // Vernal Equinox
let manualHour = 12;
let solarDeclination = 0;
let hudDirty = true;
let isInVR = false;
let frameCount = 0;

// VR Orbit State
let vrOrbitTheta = 0; // Ángulo horizontal (Ecuador)
let vrOrbitPhi = 0; // Ángulo vertical (Inclinación)
let vrOrbitRadius = 500; // Distance
let vrOrbitThetaVelocity = 0;
let vrOrbitPhiVelocity = 0;
let vrBtns = { l4: false, l5: false, r4: false, r5: false, r3: false };

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
        
        // Reset orbit parameters to initial state (Ecuador, frente a Tierra)
        vrOrbitTheta = 0;
        vrOrbitPhi = 0;
        vrOrbitRadius = 500; 
        vrOrbitThetaVelocity = 0;
        vrOrbitPhiVelocity = 0;

        vrCameraRig.position.set(0, 0, 0);
        // vrUserOffset empuja el visor hacia atrás; el rig gira
        vrUserOffset.position.set(0, 0, vrOrbitRadius);
        vrUserOffset.rotation.set(0, 0, 0);
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

    // 10. Sun Visual
    createSunVisual();

    // 10. Start
    window.addEventListener('resize', onResize);
    setupDOMListeners();

    // Initial Sync
    const nowMs = Date.now();
    const dateObj = new Date(nowMs);
    const startYearMs = Date.UTC(dateObj.getUTCFullYear(), 0, 0);
    manualDay = Math.floor((nowMs - startYearMs) / 86400000);
    manualHour = (nowMs % 86400000) / 3600000;
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
    // Alinear textura para que el Meridiano de Greenwich quede frente al Sol
    earth.rotation.y = Math.PI / 2;
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
    const EARTH_R = 100;
    const TROPIC_LAT = 23.44; // degrees

    // ── Helper: Create a latitude ring ──
    function createLatitudeRing(latDeg, color, opacity) {
        const latRad = THREE.MathUtils.degToRad(latDeg);
        const r = EARTH_R * Math.cos(latRad);    // radius of ring at this latitude
        const y = EARTH_R * Math.sin(latRad);     // height of ring
        const segments = 128;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                r * Math.cos(angle),
                y,
                r * Math.sin(angle)
            ));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthTest: true,
            depthWrite: false
        });
        return new THREE.Line(geometry, material);
    }

    // ── 1. Rotation Axis (Pole to Pole) ──
    const axisExtension = 1.35; // extends 35% beyond sphere
    const axisPoints = [
        new THREE.Vector3(0, -EARTH_R * axisExtension, 0),
        new THREE.Vector3(0,  EARTH_R * axisExtension, 0)
    ];
    const axisGeometry = new THREE.BufferGeometry().setFromPoints(axisPoints);
    const axisMaterial = new THREE.LineDashedMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.35,
        dashSize: 6,
        gapSize: 4,
        depthTest: true,
        depthWrite: false
    });
    const axisLine = new THREE.Line(axisGeometry, axisMaterial);
    axisLine.computeLineDistances(); // Required for dashed material
    earthGroup.add(axisLine);

    // Small spheres at the poles for visual reference
    const poleDotGeo = new THREE.SphereGeometry(1.5, 8, 8);
    const poleDotMat = new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.5
    });
    const northPole = new THREE.Mesh(poleDotGeo, poleDotMat);
    northPole.position.set(0, EARTH_R * axisExtension, 0);
    earthGroup.add(northPole);

    const southPole = new THREE.Mesh(poleDotGeo.clone(), poleDotMat.clone());
    southPole.position.set(0, -EARTH_R * axisExtension, 0);
    earthGroup.add(southPole);

    // ── 2. Equator (0° latitude) ──
    const equator = createLatitudeRing(0, 0x00ffaa, 0.3);
    earthGroup.add(equator);

    // ── 3. Tropic of Cancer (23.44° N) ──
    const tropicCancer = createLatitudeRing(TROPIC_LAT, 0xffcc44, 0.25);
    earthGroup.add(tropicCancer);

    // ── 4. Tropic of Capricorn (23.44° S) ──
    const tropicCapricorn = createLatitudeRing(-TROPIC_LAT, 0xffcc44, 0.25);
    earthGroup.add(tropicCapricorn);
}

function createSunVisual() {
    // ── Sun Group (contains sphere + glow) ──
    sunVisual = new THREE.Group();

    // 1. Sun Sphere — small, warm emissive
    const sunGeo = new THREE.SphereGeometry(12, 24, 24);
    const sunMat = new THREE.MeshBasicMaterial({
        color: 0xfff4d6,
        transparent: true,
        opacity: 0.95
    });
    const sunSphere = new THREE.Mesh(sunGeo, sunMat);
    sunVisual.add(sunSphere);

    // 2. Corona Glow — procedural radial gradient sprite
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const gCtx = glowCanvas.getContext('2d');
    const gradient = gCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 240, 180, 0.6)');
    gradient.addColorStop(0.25, 'rgba(255, 210, 100, 0.3)');
    gradient.addColorStop(0.5, 'rgba(255, 180, 60, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 160, 40, 0)');
    gCtx.fillStyle = gradient;
    gCtx.fillRect(0, 0, 256, 256);

    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.7
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(80, 80, 1);
    sunVisual.add(glowSprite);

    // Position will be updated in updateSunDynamics()
    sunVisual.position.set(0, 0, 550);
    scene.add(sunVisual);

    // 3. Sun Ray Line — subtle beam from sun to Earth surface
    const rayGeo = new THREE.BufferGeometry();
    const rayPositions = new Float32Array(6); // 2 points × 3 coords
    rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
    const rayMat = new THREE.LineDashedMaterial({
        color: 0xffdd66,
        transparent: true,
        opacity: 0.2,
        dashSize: 8,
        gapSize: 6,
        depthTest: true,
        depthWrite: false
    });
    sunRayLine = new THREE.Line(rayGeo, rayMat);
    sunRayLine.computeLineDistances();
    scene.add(sunRayLine);
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
        
        const totalMsHUD = Math.round(manualHour * 3600000);
        const hHUD = Math.floor(totalMsHUD / 3600000) % 24;
        const mHUD = Math.floor((totalMsHUD % 3600000) / 60000);
        const sHUD = Math.floor((totalMsHUD % 60000) / 1000);
        
        const curDate = new Date(Date.UTC(new Date().getFullYear(), 0, Math.floor(manualDay), hHUD, mHUD, sHUD));
        const lH = curDate.getHours().toString().padStart(2, '0');
        const lM = curDate.getMinutes().toString().padStart(2, '0');
        const lS = curDate.getSeconds().toString().padStart(2, '0');
        
        ctx.fillText(`Hora Local: ${lH}:${lM}:${lS}`, 40, 155);
        ctx.fillText(`Hora UTC: ${hHUD.toString().padStart(2, '0')}:${mHUD.toString().padStart(2, '0')}:${sHUD.toString().padStart(2, '0')}`, 40, 195);
        ctx.fillText(`Lat. Sub-Solar: ${solarDeclination.toFixed(2)}°`, 40, 235);

        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('NUEVO CONTROL VR:', 40, 285);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px sans-serif';
        ctx.fillText('• Mano Izq: Horas(X), Estaciones(Y/Btn)', 40, 320);
        ctx.fillText('• Mano Der: Órbita(X), Polos(Y/Btn)', 40, 350);
        ctx.fillText('• Gatillos: Zoom +/-', 40, 380);

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

        // ── MANO IZQUIERDA: Master de Tiempo (Días y Horas) ──
        if (source.handedness === 'left') {
            // Joystick X: Hora del día (Movimiento fino del Sol)
            if (Math.abs(ax[2]) > deadzone) {
                manualHour = (manualHour + ax[2] * 0.15 + 24) % 24;
                isLive = false;
                hudDirty = true;
            }
            // Joystick Y: Día del año (Recorrer las estaciones)
            if (Math.abs(ax[3]) > deadzone) {
                // ax[3] < 0 (hacia arriba) avanza los meses más rápido
                manualDay = THREE.MathUtils.clamp(manualDay - ax[3] * 0.8, 1, 365);
                isLive = false;
                hudDirty = true;
            }

            // Botón X/A (bt[4]): Siguiente Equinoccio/Solsticio
            const l4Pressed = (bt[4] && bt[4].pressed);
            if (l4Pressed && !vrBtns.l4) {
                const seasons = [81, 172, 264, 355]; // Eq.Primaveral, Sol.Verano, Eq.Otoñal, Sol.Invierno
                let next = seasons.find(s => s > manualDay);
                if (!next) next = seasons[0];
                manualDay = next;
                isLive = false;
                hudDirty = true;
            }
            vrBtns.l4 = l4Pressed;

            // Botón Y/B (bt[5]): Retorno a Tiempo Real
            const l5Pressed = (bt[5] && bt[5].pressed);
            if (l5Pressed && !vrBtns.l5) {
                isLive = true;
                hudDirty = true;
            }
            vrBtns.l5 = l5Pressed;

            // Trigger o Grip Izquierdo: Zoom Out (Alejar)
            const zoomOutVal = Math.max(bt[0] ? bt[0].value : 0, bt[1] ? bt[1].value : 0);
            if (zoomOutVal > 0.05) {
                const zoomFactor = vrOrbitRadius * 0.015;
                vrOrbitRadius = THREE.MathUtils.clamp(vrOrbitRadius + zoomOutVal * zoomFactor, 150, 5000);
            }
        }

        // ── MANO DERECHA: Exploración Espacial (Cara Oscura y Polos) ──
        if (source.handedness === 'right') {
            // Joystick X: Rotar alrededor de la Tierra (Theta, luz a oscuridad)
            if (Math.abs(ax[2]) > deadzone) {
                vrOrbitThetaVelocity -= ax[2] * 0.003;
            }
            // Joystick Y: Ir hacia los Polos (Phi, latitud)
            if (Math.abs(ax[3]) > deadzone) {
                vrOrbitPhiVelocity -= ax[3] * 0.003;
            }
            
            // Botón A/X (bt[4]): Reset cámara a Greenwich/Ecuador
            const r4Pressed = (bt[4] && bt[4].pressed);
            if (r4Pressed && !vrBtns.r4) {
                vrOrbitTheta = 0;
                vrOrbitPhi = 0;
                vrOrbitThetaVelocity = 0;
                vrOrbitPhiVelocity = 0;
            }
            vrBtns.r4 = r4Pressed;

            // Botón B/Y (bt[5]): Viaje rápido al Polo Norte
            const r5Pressed = (bt[5] && bt[5].pressed);
            if (r5Pressed && !vrBtns.r5) {
                vrOrbitPhi = Math.PI / 2 - 0.1; // Rotación casi 90 deg para mirar desde Polo Norte
                vrOrbitPhiVelocity = 0;
            }
            vrBtns.r5 = r5Pressed;

            // Thumbstick press (reset central inicial)
            const r3Pressed = (bt[3] && bt[3].pressed);
            if (r3Pressed && !vrBtns.r3) {
                vrOrbitTheta = 0;
                vrOrbitPhi = 0;
                vrOrbitRadius = 500;
                vrOrbitThetaVelocity = 0;
                vrOrbitPhiVelocity = 0;
            }
            vrBtns.r3 = r3Pressed;

            // Trigger o Grip Derecho: Zoom In (Acercar)
            const zoomInVal = Math.max(bt[0] ? bt[0].value : 0, bt[1] ? bt[1].value : 0);
            if (zoomInVal > 0.05) {
                const zoomFactor = vrOrbitRadius * 0.015;
                vrOrbitRadius = THREE.MathUtils.clamp(vrOrbitRadius - zoomInVal * zoomFactor, 150, 5000);
            }
        }
    }
}

// ════════════════════════════════════════
//  RENDER LOOP
// ════════════════════════════════════════
function render() {
    if (isLive) {
        const nowMs = Date.now();
        const dateObj = new Date(nowMs);
        const startYearMs = Date.UTC(dateObj.getUTCFullYear(), 0, 0);
        manualDay = Math.floor((nowMs - startYearMs) / 86400000);
        manualHour = (nowMs % 86400000) / 3600000;
        hudDirty = true;
    }

    // Daily Rotation: Local Y within the tilted structure
    // Giro antihorario completo sobre 24h
    rotationGroup.rotation.y = (manualHour / 24) * Math.PI * 2;

    if (isInVR) {
        handleVRInput();

        // Aplicar inercia (damping)
        vrOrbitTheta += vrOrbitThetaVelocity;
        vrOrbitPhi += vrOrbitPhiVelocity;
        
        // Multiplicador de fricción/damping
        vrOrbitThetaVelocity *= 0.85;
        vrOrbitPhiVelocity *= 0.85;
        
        // Clamp de Phi (Rotación vertical limitadora entre los Polos)
        vrOrbitPhi = THREE.MathUtils.clamp(vrOrbitPhi, -Math.PI / 2.1, Math.PI / 2.1);
        
        // Mantener vrCameraRig centrado y aplicar rotación limpia Euler para explorar la órbita nativamente
        vrCameraRig.position.set(0, 0, 0);
        vrCameraRig.rotation.set(vrOrbitPhi, vrOrbitTheta, 0);
        
        // Alejar el offset sin causar conflictos de lookAt con las matrices XR
        vrUserOffset.position.set(0, 0, vrOrbitRadius);
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

    // Sun Visual: continuous pulse animation (runs every frame for smooth glow)
    if (sunVisual) {
        const pulse = 1.0 + 0.08 * Math.sin(Date.now() * 0.003);
        sunVisual.scale.setScalar(pulse);
    }
    // Recompute line distances for dashed ray (needs update after position changes)
    if (sunRayLine) sunRayLine.computeLineDistances();

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

    // Position sunLight on positive Z and move along Y for declination (seasons)
    const R = 3000;
    const sy = R * Math.sin(decRad);

    if (sunLight) {
        // Sol posicionado en Z=3000 fijo, variando Y por la declinación
        sunLight.position.set(0, sy, R);
        sunLight.target.position.copy(earthAnchor.position);
        sunLight.target.updateMatrixWorld();
    }

    // ── Update Sun Visual Position ──
    const SUN_VISUAL_R = 550; // Distance of visual sun from Earth
    const svY = SUN_VISUAL_R * Math.sin(decRad);
    const svZ = SUN_VISUAL_R * Math.cos(decRad);

    if (sunVisual) {
        sunVisual.position.set(0, svY, svZ);

        // Subtle pulsing glow
        const pulse = 1.0 + 0.08 * Math.sin(Date.now() * 0.003);
        sunVisual.scale.setScalar(pulse);
    }

    // ── Update Sun Ray (shows direct sunlight path to Earth surface) ──
    if (sunRayLine) {
        const rayPositions = sunRayLine.geometry.attributes.position;
        // Start from sun visual
        rayPositions.setXYZ(0, 0, svY, svZ);
        // End at Earth surface where sun is directly overhead
        // The point on the surface at the sub-solar latitude
        const surfaceR = 102; // slightly above Earth surface
        const hitY = surfaceR * Math.sin(decRad);
        const hitZ = surfaceR * Math.cos(decRad);
        rayPositions.setXYZ(1, 0, hitY, hitZ);
        rayPositions.needsUpdate = true;
    }

    if (uiSunCoords) uiSunCoords.innerText = `Decl. Solar: ${solarDeclination.toFixed(2)}°`;
}

function syncDOM() {
    const d = new Date(new Date().getFullYear(), 0);
    d.setDate(Math.floor(manualDay));
    if (uiDate) uiDate.innerText = d.toLocaleDateString();

    const totalMs = Math.round(manualHour * 3600000);
    const h = Math.floor(totalMs / 3600000) % 24;
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);

    const utcDate = new Date(Date.UTC(d.getUTCFullYear(), 0, Math.floor(manualDay), h, m, s));
    const localH = utcDate.getHours().toString().padStart(2, '0');
    const localM = utcDate.getMinutes().toString().padStart(2, '0');
    const localS = utcDate.getSeconds().toString().padStart(2, '0');

    if (uiTime) {
        uiTime.innerHTML = `Hora Local: ${localH}:${localM}:${localS}<br>Hora UTC: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    if (daySlider) {
        daySlider.value = manualDay;
    }
    if (hourSlider) {
        hourSlider.value = manualHour;
    }

    const controlsPanel = document.querySelector('.temporal-controls');
    if (controlsPanel) {
        if (!isLive) {
            controlsPanel.style.borderColor = '#ffea00';
            controlsPanel.style.boxShadow = '0 0 15px rgba(255, 234, 0, 0.4)';
        } else {
            controlsPanel.style.borderColor = 'var(--glass-border)';
            controlsPanel.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.5)';
        }
    }

    if (viewDayText) viewDayText.innerText = isLive ? 'Hoy' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (viewHourText) viewHourText.innerText = isLive ? 'Ahora' : `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} UTC`;

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

    // ── TOUCH: Disable OrbitControls while dragging sliders ──
    const sliders = [daySlider, hourSlider];
    sliders.forEach(slider => {
        if (!slider) return;
        slider.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            isLive = false;
            hudDirty = true;
            if (controls) controls.enabled = false;
        }, { passive: false });
        slider.addEventListener('touchend', () => {
            if (controls && !isInVR) controls.enabled = true;
        });
        slider.addEventListener('touchcancel', () => {
            if (controls && !isInVR) controls.enabled = true;
        });
        // Also handle pointer events for hybrid devices
        slider.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') {
                e.stopPropagation();
                isLive = false;
                hudDirty = true;
                if (controls) controls.enabled = false;
            }
        });
        slider.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'touch') {
                if (controls && !isInVR) controls.enabled = true;
            }
        });
    });
}

function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    if (w < 1024 && !isInVR) {
        camera.setViewOffset(w, h, 0, -h * 0.35, w, h);
    } else {
        camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

// Despegue
init();