/**
 * ui.js - Gestión de la Interfaz de IAstronaut
 * Controla la visualización de mensajes, estados de carga y telemetría.
 */

/**
 * Añade un mensaje visual al historial del chat con diseño de burbujas.
 * @param {string} who - 'Tú' o 'Astronauta'
 * @param {string} txt - Contenido del mensaje
 */
export function addMsg(who, txt) {
  const historyEl = document.getElementById('chat-history');
  if (!historyEl) return;

  const msgDiv = document.createElement("div");
  msgDiv.classList.add('mensaje');

  if (who === "Tú") {
    msgDiv.classList.add('mensaje-usuario');
  } else {
    msgDiv.classList.add('mensaje-astronauta');
  }

  // Usamos una estructura más limpia que aprovecha las clases de astro.css
  msgDiv.innerHTML = `
        <div class="msg-content">
            <small class="msg-sender">${who === "Tú" ? 'BASE-TIERRA' : 'IASTRONAUTA'}</small>
            <p class="msg-text">${txt}</p>
        </div>
    `;

  historyEl.appendChild(msgDiv);
  scrollToBottom();
}

/**
 * Muestra el indicador de "Escribiendo..." (Spinner) con temática espacial
 */
export function showSpinner() {
  const spinner = document.getElementById('spinner');
  if (spinner) {
    spinner.style.display = 'block';
    spinner.innerHTML = `<em>🕗 PROCESANDO SEÑAL...</em>`;

    // Lógica de Cold Start (UX de Latencia)
    window.coldStartTimer = setTimeout(() => {
      if (spinner.style.display === 'block') {
        spinner.innerHTML = `<em>Establishing link with lunar base (Waking up server)...</em><br><small>This may take up to 30 seconds due to orbital alignment.</small>`;
      }
    }, 5000);

    scrollToBottom();
  }
}

/**
 * Oculta el indicador de carga
 */
export function hideSpinner() {
  const spinner = document.getElementById('spinner');
  if (spinner) {
    spinner.style.display = 'none';
    if (window.coldStartTimer) {
      clearTimeout(window.coldStartTimer);
    }
  }
}

/**
 * Desplaza el chat al final de forma suave (Smooth Scroll)
 */
export function scrollToBottom() {
  const historyEl = document.getElementById('chat-history');
  if (historyEl) {
    setTimeout(() => {
      historyEl.scrollTo({
        top: historyEl.scrollHeight,
        behavior: 'smooth'
      });
    }, 50);
  }
}

/**
 * Actualiza el estado visual del botón de la cámara
 */
export function updateCameraUI(active) {
  const cameraBtn = document.getElementById('camera-btn');
  if (!cameraBtn) return;

  if (active) {
    cameraBtn.style.background = "#ff3c3c";
    cameraBtn.innerHTML = "📸";
    cameraBtn.classList.add('pulse');
  } else {
    cameraBtn.style.background = "var(--button-cyan)";
    cameraBtn.innerHTML = "📷";
    cameraBtn.classList.remove('pulse');
  }
}

/**
 * Limpia el historial visual
 */
export function clearChatUI() {
  const historyEl = document.getElementById('chat-history');
  if (historyEl) {
    historyEl.innerHTML = `<div class="system-message">-- CANAL ENCRIPTADO REESTABLECIDO --</div>`;
  }
}
