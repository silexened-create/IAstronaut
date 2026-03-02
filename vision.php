<?php
// 1. Configuración de cabeceras estilo Don Quijote (Máxima compatibilidad)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

// 2. Respuesta inmediata para el Preflight (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit;
}

// 3. Asegurar que la respuesta sea JSON
header("Content-Type: application/json; charset=utf-8");

/**
 * CONFIGURACIÓN DE MISIONES DINÁMICAS Y CARGA DE API KEY (RENDER.COM)
 */
$apiKey = getenv("OPENROUTER_API_KEY");

if (!$apiKey) {
    echo json_encode(["error" => "API Key no configurada en el entorno del servidor."]);
    exit;
}

// 4. RECIBIR TELEMETRÍA
$input = json_decode(file_get_contents("php://input"), true);

if (!$input || !isset($input['image'])) {
    echo json_encode(["error" => "No se recibió telemetría visual."]);
    exit;
}

// Limpieza de la cadena base64 (aseguramos que no lleve el prefijo si ya viene del JS)
$image_data = $input['image'];
if (strpos($image_data, 'data:image') === 0) {
    $image_data = substr($image_data, strpos($image_data, ',') + 1);
}

$objetivo_mision = $input['objetivo'] ?? "Detectar si el usuario tiene los ojos abiertos o cerrados.";

// ... (Resto de tu lógica de $system_prompt, $payload y curl)
$image_base64 = str_replace('data:image/jpeg;base64,', '', $input['image']);

// 3. PREPARAR EL PROMPT DE SISTEMA
$system_prompt = "Actúa como un sistema de visión artificial avanzado de la NASA. 
Analiza la imagen enviada por el cadete y responde ÚNICAMENTE en formato JSON puro. 
TU MISIÓN ES: $objetivo_mision.

Estructura obligatoria de respuesta:
{
  \"exito\": boolean,
  \"titulo\": \"Estado corto del análisis\",
  \"comentario\": \"Explicación técnica detallada para el cadete\"
}";

// 4. CONFIGURAR PAYLOAD PARA OPENROUTER
// Usamos Gemini 2.0 Flash por su alta velocidad y precisión en visión
$payload = [
    "model" => "google/gemma-3-4b-it:free",
    "messages" => [
        [
            "role" => "user",
            "content" => [
                ["type" => "text", "text" => $system_prompt],
                [
                    "type" => "image_url", 
                    "image_url" => ["url" => "data:image/jpeg;base64," . $image_base64]
                ]
            ]
        ]
    ]
];

// 5. EJECUCIÓN DE LA LLAMADA (CURL)
$ch = curl_init("https://openrouter.ai/api/v1/chat/completions");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $apiKey",
    "Content-Type: application/json",
    "HTTP-Referer: https://iastronaut.vercel.app", 
    "X-Title: IAstronaut Biometrics"
]);

$response = curl_exec($ch);

if (curl_errno($ch)) {
    echo json_encode(["error" => "Fallo en la comunicación orbital: " . curl_error($ch)]);
} else {
    echo $response;
}

curl_close($ch);
