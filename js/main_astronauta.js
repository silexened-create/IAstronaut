/**
 * IAstronaut - Controlador de Interfaz Híbrida
 * Este archivo gestiona el DOM y eventos de teclado sin duplicar la lógica de voz.
 */

import { procesarEntrada } from './recognition.js';

// Seleccionamos elementos del DOM
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const btnAceptar = document.getElementById("btn-aceptar");
const modalInstrucciones = document.getElementById("modal-instrucciones");
const contenidoPrincipal = document.getElementById("contenido-principal");

/* 1. MANEJO DEL FORMULARIO DE CHAT (TECLADO) */
if (chatForm) {
    chatForm.addEventListener("submit", (event) => {
        // Evitamos que la página se refresque (Solución al reinicio)
        event.preventDefault();

        const mensaje = chatInput.value.trim();

        // Solo procesamos si hay texto
        if (mensaje.length > 0) {
            console.log("⌨️ [Entrada Manual]:", mensaje);

            // Usamos la función exportada de recognition.js para mantener la consistencia
            // Esto asegura que el mensaje se guarde en el historial y se envíe al servidor
            procesarEntrada(mensaje);

            // Limpiamos el campo de texto para el siguiente mensaje
            chatInput.value = "";

            // Opcional: Devolver el foco al input por si se perdió
            chatInput.focus();
        }
    });
}

/* 2. GESTIÓN DEL MODAL DE BIENVENIDA */
if (btnAceptar) {
    btnAceptar.addEventListener("click", () => {
        // Ocultar modal y mostrar la interfaz de la misión
        if (modalInstrucciones) modalInstrucciones.style.display = "none";
        if (contenidoPrincipal) contenidoPrincipal.style.display = "flex";

        console.log("🚀 Misión iniciada por el usuario.");

        // El inicio del micrófono se deja al botón 🎤 que ya manejas en recognition.js
        // para evitar que la IA empiece a hablar sola si el usuario no quiere.
    });
}

/* 3. ATAJOS DE TECLADO PARA MEJORAR LA EXPERIENCIA */
window.addEventListener("keydown", (e) => {
    // Si presiona ESC, limpia el input del chat
    if (e.key === "Escape") {
        chatInput.value = "";
        chatInput.blur(); // Quita el foco
    }

    // Si el usuario empieza a escribir y no está en el input, le damos el foco automáticamente
    // (Excepto si está presionando teclas de función o comandos)
    if (document.activeElement !== chatInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        chatInput.focus();
    }
});

/* 4. EXPORTACIÓN DE UTILIDADES VISUALES (OPCIONAL) */
export function limpiarChatUI() {
    const history = document.getElementById("chat-history");
    if (history) history.innerHTML = "";
    window.conversationHistory = [];
}