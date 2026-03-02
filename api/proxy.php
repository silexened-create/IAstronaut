<?php
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: https://i-astronaut.vercel.app");
    header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
    header("Access-Control-Allow-Credentials: true");
    header("HTTP/1.1 200 OK");
    exit;
}

header("Access-Control-Allow-Origin: https://i-astronaut.vercel.app");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=utf-8");

/* ============================================================
    CARGAR API KEY (CONFIGURACIÓN PARA RENDER.COM)
   ============================================================ */
$apiKey = getenv("OPENROUTER_API_KEY");

if (!$apiKey) {
    echo json_encode(["reply" => "❌ Error: Configuración de energía insuficiente (Falta API Key en el entorno)."]);
    exit;
}

/* ============================================================
   PROCESAR ENTRADA
   ============================================================ */
$input = json_decode(file_get_contents("php://input"), true);
$mensaje_usuario = $input["message"] ?? "";
$historial = $input["history"] ?? [];
$imagen_base64 = $input["image"] ?? null;

/**
 * LÓGICA DE SELECCIÓN DE MODELO
 */
$modelo_texto = "arcee-ai/trinity-large-preview:free";
$modelo_vision = "google/gemini-2.0-flash-exp:free"; 

$modelo_activo = ($imagen_base64) ? $modelo_vision : $modelo_texto;

/* ============================================================
   PROMPT DEL SISTEMA: IAstronaut Pro
   ============================================================ */
$system_prompt = "Actúa como IAstronaut, un astronauta humano del futuro con una personalidad calmada, 
lógica, empática y respetuosa. Tu estilo es sereno, claro y reflexivo, como un mentor experimentado que 
acompaña a cadetes en temas de exploración espacial y STEAM.

Órdenes:
1. Responde solo con texto limpio, sin símbolos especiales, sin Markdown y sin efectos teatrales.
2. Si el usuario saluda, tú saludas de forma natural.
3. Mantén un tono amable, humano y tranquilo.
4. No inicies misiones ni actividades a menos que el usuario lo pida.
5. Cuando el usuario pregunte por misiones, ofrece opciones el visualizador de la tierra, la camara biometrica o la mision de exploración.
6. Explica ciencia espacial, entrenamiento físico, astronomía y temas STEAM con precisión y de forma accesible.
7. Mantén coherencia con el historial.
8. Evita inventar detalles excesivamente específicos o complejos sobre misiones, naves o tecnología. Mantén un universo sencillo y consistente.
9. Responde de forma concisa, sin extenderte innecesariamente.
10. LÍMITE DE DOMINIO: Responde exclusivamente sobre temas relacionados con la astronomía, exploración espacial, tecnología, ingeniería, artes y matemáticas (STEAM). Si el usuario intenta hablar de temas ajenos a la misión, política, religión o cultura popular irrelevante, declina cortésmente diciendo que tu enlace neuronal está configurado solo para soporte científico de la misión.

Contexto:
Eres un astronauta veterano con experiencia en misiones de exploración y formación de cadetes. Tu objetivo es orientar, enseñar y acompañar al usuario según sus intereses.";

// Inicializar arreglo de mensajes con el prompt del sistema
$mensajes = [["role" => "system", "content" => $system_prompt]];

// Cargar historial previo
foreach ($historial as $turno) {
    if (isset($turno["role"], $turno["content"])) {
        $mensajes[] = ["role" => $turno["role"], "content" => $turno["content"]];
    }
}

// Construir el mensaje actual del usuario (Texto o Multimodal)
if ($imagen_base64) {
    $contenido_usuario = [
        ["type" => "text", "text" => $mensaje_usuario ?: "Analiza mi postura de entrenamiento."],
        ["type" => "image_url", "image_url" => ["url" => "data:image/jpeg;base64," . $imagen_base64]]
    ];
} else {
    $contenido_usuario = $mensaje_usuario;
}

$mensajes[] = ["role" => "user", "content" => $contenido_usuario];

/* ============================================================
   LLAMADA A OPENROUTER
   ============================================================ */
$payload = [
    "model" => $modelo_activo,
    "messages" => $mensajes,
    "temperature" => 0.7,
    "max_tokens" => 500
];

$ch = curl_init("https://openrouter.ai/api/v1/chat/completions");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . trim($apiKey),
    "Content-Type: application/json",
    "HTTP-Referer: https://iastronaut.vercel.app", // Referer de producción
    "X-Title: IAstronaut Mission Control"
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 45);

$response = curl_exec($ch);
$curl_error = curl_error($ch);
curl_close($ch);

if ($response === false) {
    echo json_encode(["reply" => "Error de telemetría: " . $curl_error]);
    exit;
}

/* ============================================================
   PROCESAR RESPUESTA FINAL
   ============================================================ */
$data = json_decode($response, true);
$mensaje_modelo = $data["choices"][0]["message"]["content"] ?? null;

if (!$mensaje_modelo) {
    $api_err = $data["error"]["message"] ?? "Interferencia desconocida";
    echo json_encode(["reply" => "¡Atención cadete! Hay interferencia en la señal: $api_err"]);
} else {
    // Eliminar etiquetas de razonamiento si el modelo las incluye (como DeepSeek)
    $mensaje_modelo = preg_replace('/<think>.*?<\/think>/s', '', $mensaje_modelo);
    
    echo json_encode([
        "reply" => trim($mensaje_modelo),
        "model" => $modelo_activo
    ]);
}