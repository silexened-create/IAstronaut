/**
 * js/biometrico.js - NEURAL INTERFACE SCANNER (WebRTC Module)
 * Senior Web Engineer & WebRTC Specialist Implementation
 */

console.log("🚀 [SYSTEM] Initializing Neural Interface Scanner...");

// --- CONFIGURATION & ELEMENTS ---
const config = {
    videoWidth: 640,
    videoHeight: 480,
    frameRate: 30
};

const elements = {
    video: document.getElementById('webcam'),
    overlay: document.getElementById('overlay'),
    statusMini: document.getElementById('status-mini'),
    resultBox: document.getElementById('result'),
    btnScan: document.getElementById('btn-scan'),
    canvas: document.getElementById('canvas'),
    scannerContainer: document.querySelector('.scanner-container')
};

let stream = null;
let objetivoActual = "detectar si el usuario tiene los ojos abiertos o cerrados";

/**
 * UI STATE FEEDBACK
 * @param {'initializing'|'ready'|'blocked'|'processing'} state 
 */
function updateUIState(state) {
    if (!elements.statusMini) return;

    switch (state) {
        case 'initializing':
            elements.statusMini.innerText = "🛰️ INICIALIZANDO SENSORES...";
            elements.statusMini.className = "pulse";
            elements.scannerContainer.style.borderColor = "var(--earth-blue)";
            break;
        case 'ready':
            elements.statusMini.innerText = "✅ ENLACE NEURONAL ESTABLE: LISTO";
            elements.statusMini.classList.remove('pulse');
            elements.scannerContainer.style.borderColor = "var(--button-cyan)";
            if (elements.btnScan) elements.btnScan.disabled = false;
            break;
        case 'blocked':
            elements.statusMini.innerText = "❌ ENLACE DE SENSOR BLOQUEADO";
            elements.statusMini.classList.remove('pulse');
            elements.statusMini.style.color = "#ff3c3c";
            elements.scannerContainer.style.borderColor = "#ff3c3c";
            if (elements.btnScan) elements.btnScan.disabled = true;
            break;
        case 'processing':
            elements.statusMini.innerText = "🕗 ANALIZANDO TELEMETRÍA...";
            elements.statusMini.className = "pulse";
            break;
    }
}

async function engageCamera() {
    updateUIState('initializing');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        handleCameraError({ name: 'FeatureDetectionError' });
        return;
    }
    try {
        const constraints = {
            video: {
                width: { ideal: config.videoWidth },
                height: { ideal: config.videoHeight },
                frameRate: { ideal: config.frameRate },
                facingMode: "user"
            },
            audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if ("srcObject" in elements.video) {
            elements.video.srcObject = stream;
        } else {
            elements.video.src = window.URL.createObjectURL(stream);
        }
        elements.video.onloadedmetadata = () => {
            elements.video.play().catch(e => console.error("Autoplay prevented:", e));
            updateUIState('ready');
        };
    } catch (err) {
        handleCameraError(err);
    }
}

/**
 * ERROR HANDLING FOR MEDIA DEVICES
 */
function handleCameraError(err) {
    console.error("❌ [HARDWARE ERROR]:", err);
    updateUIState('blocked');

    let errorMessage = "UNKNOWN INTERFACE ERROR";

    switch (err.name) {
        case 'NotAllowedError':
            errorMessage = "PERMISSION DENIED BY USER";
            break;
        case 'NotFoundError':
            errorMessage = "NO CAMERA HARDWARE DETECTED";
            break;
        case 'NotReadableError':
            errorMessage = "HARDWARE IS BUSY OR IN USE BY ANOTHER APP";
            break;
        case 'InsecureContextError':
            errorMessage = "INSECURE CONTEXT: REQUIRES HTTPS OR LOCALHOST";
            break;
        case 'FeatureDetectionError':
            errorMessage = "BROWSER DOES NOT SUPPORT WEBRTC";
            break;
    }

    if (elements.resultBox) {
        elements.resultBox.innerHTML = `
            <div style="color:#ff3c3c; font-weight:bold;">> CRITICAL_FAILURE: ${errorMessage}</div>
            <p style="font-size:0.8rem; margin-top:10px;">Check browser permissions or Chrome flags for local development.</p>
        `;
    }
}

/**
 * 2. MISSION CONTROL FUNCTIONS
 */
window.cambiarMision = function (elemento, instruccion) {
    document.querySelectorAll('.iastronaut-btn').forEach(b => b.classList.remove('active'));
    elemento.classList.add('active');

    objetivoActual = instruccion;
    console.log("🎯 OBJECTIVE SET:", objetivoActual);

    if (elements.resultBox) {
        elements.resultBox.innerHTML = `<p style="color:var(--button-cyan);">> MISSION GOAL: ${elemento.innerText.toUpperCase()}</p>`;
    }
};

async function startScanProtocol() {
    if (!stream) {
        handleCameraError({ name: 'NotReadableError' });
        return;
    }

    elements.btnScan.disabled = true;
    let count = 3;
    elements.overlay.innerText = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            elements.overlay.innerText = count;
        } else {
            clearInterval(interval);
            elements.overlay.innerText = "⚡";
            captureFrame();
            setTimeout(() => {
                elements.overlay.innerText = "";
                elements.btnScan.disabled = false;
            }, 800);
        }
    }, 1000);
}

/**
 * 3. FRAME CAPTURE ENGINE
 */
async function captureFrame() {
    updateUIState('processing');

    elements.canvas.width = elements.video.videoWidth;
    elements.canvas.height = elements.video.videoHeight;
    const ctx = elements.canvas.getContext('2d');
    ctx.drawImage(elements.video, 0, 0);
    const payload = elements.canvas.toDataURL('image/jpeg', 0.8);
    transmitToCommand(payload);
}

async function transmitToCommand(imageData) {
    try {
        const BACKEND_URL = "https://iastronaut-api.ct.ws"; 
        const response = await fetch(`${BACKEND_URL}/api/vision.php`, {
            method: 'POST',
            mode: 'cors', // <--- AÑADE ESTO
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: imageData,
                objetivo: objetivoActual
            })
        });

        if (!response.ok) throw new Error(`Signal loss: ${response.status}`);

        const raw = await response.json();
        processAIResult(raw);

    } catch (err) {
        console.error("Transmission Error:", err);
        elements.resultBox.innerHTML += `<p style="color:red;">> COMMS_LINK_ERROR: ${err.message}</p>`;
        updateUIState('ready');
    }
}

function processAIResult(data) {
    try {
        // OpenRouter devuelve la respuesta en data.choices[0].message.content
        const aiMessage = data.choices[0].message.content;
        
        // Intentamos limpiar el texto por si la IA añade bloques de código Markdown ```json
        const cleanJson = aiMessage.replace(/```json|```/g, "").trim();
        const res = JSON.parse(cleanJson);

        elements.resultBox.innerHTML = `
            <h2 class="glow-text" style="font-size: 1rem; color: var(--button-cyan);">${res.titulo.toUpperCase()}</h2>
            <p style="margin:10px 0; font-size:0.85rem;">> ${res.comentario}</p>
        `;
        updateUIState('ready');
    } catch (e) {
        console.error("Error al procesar el JSON de la IA:", e);
        // Si falla el parseo, mostramos el texto plano como respaldo
        elements.resultBox.innerHTML = `<p style="font-size:0.85rem;">> ${data.choices[0].message.content}</p>`;
        updateUIState('ready');
    }
}

// --- INIT ---
window.addEventListener('load', engageCamera);
if (elements.btnScan) {
    elements.btnScan.addEventListener('click', startScanProtocol);

}

