<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/**
 * MOTOR DE VISIÓN UNIVERSAL - IAstronaut
 * Configurado para misiones dinámicas y carga de .env / getenv
 */

// 1. CARGAR API KEY
$apiKey = getenv("OPENROUTER_API_KEY");

if (!$apiKey) {
    $envFile = __DIR__ . '/.env';
    if (file_exists($envFile)) {
        $env = parse_ini_file($envFile);
        $apiKey = $env['OPENROUTER_API_KEY'] ?? null;
    }
}

if (!$apiKey) {
    echo json_encode(["error" => "API Key no configurada en el servidor."]);
    exit;
}

// 2. RECIBIR TELEMETRÍA Y OBJETIVO DEL FRONTEND
$input = json_decode(file_get_contents("php://input"), true);

if (!$input || !isset($input['image'])) {
    echo json_encode(["error" => "No se recibió telemetría visual."]);
    exit;
}

// Capturamos el objetivo dinámico enviado por el JS (ojos, boca o gorro)
$objetivo_mision = $input['objetivo'] ?? "Detectar si el usuario tiene los ojos abiertos o cerrados.";
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