# 🚀 IAstronaut: Mentor Virtual Multimodal

IAstronaut es una plataforma de ingeniería educativa diseñada para cerrar la brecha entre la complejidad aeroespacial y el aprendizaje juvenil.

## 🛠️ Innovaciones Técnicas
- **Memoria Contextual:** Algoritmo que inyecta metadatos de los últimos 15 segundos de video en el prompt de la IA.
- **Protocolo de Voz "Houston":** Interfaz de radio Half-Duplex controlada por comandos de voz.
- **Visión Computacional:** Detección biométrica de accesorios y estado del usuario mediante MediaPipe/Base64.
- **Arquitectura Híbrida:** Frontend estático optimizado en Vercel y Backend seguro en Render.

## 🧬 Estructura del Proyecto
```
├── css/                  # Estilos (shared, astro, doc_estilo)
├── js/                   # Lógica de IA, voz, visión y renderizado 3D
├── api/                  # Endpoints PHP seguros (proxy, visión, FBX)
├── data/                 # Datos JSON (Artemis II, Sistema Solar)
├── images/               # Imágenes y GIFs de planetas
├── audio/segments/       # Audio segmentado del documental
├── models/               # Modelos 3D (.fbx, .glb) para Three.js
├── index.html            # Dashboard principal con chat IA
├── biometria.html        # Escáner biométrico con cámara
├── documental.html       # Documental interactivo del Sistema Solar
├── earth_viewer.html     # Visualizador 3D de la Tierra en tiempo real
├── fbx.html              # Visor de modelos FBX
├── local_proxy.js        # Proxy local Node.js para desarrollo
├── Dockerfile            # Configuración de despliegue (Render)
└── vercel.json           # Configuración de despliegue (Vercel)
```

## ⚙️ Configuración Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/IAstronaut.git
   cd IAstronaut
   ```

2. Crea tu archivo de variables de entorno:
   ```bash
   cp .env.example .env
   ```

3. Rellena las API keys en `.env`

4. Inicia el proxy local:
   ```bash
   node local_proxy.js
   ```

5. Abre `index.html` en tu navegador (o usa un servidor local como Live Server)

## 🚀 Despliegue
Este repositorio está configurado para despliegue continuo (CD):
1. **Frontend:** [iastronaut.vercel.app](TU_LINK_AQUI)
2. **Backend:** [iastronaut-backend.onrender.com](TU_LINK_AQUI)

## 📄 Licencia
Este proyecto está bajo la licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

**Desarrollado para Infomatrix 2026 - Categoría: Divulgación Científica (Nivel Universidad)**