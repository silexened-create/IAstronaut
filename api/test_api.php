<?php
header("Content-Type: text/plain"); // Para leerlo fácil en el navegador

echo "--- INICIO DE PRUEBA DE TELEMETRÍA ---\n\n";

// 1. Intentar cargar el .env
$envPath = __DIR__ . '/.env';
if (!file_exists($envPath)) {
    die("❌ ERROR: No se encuentra el archivo .env en: $envPath");
}

$env = @parse_ini_file($envPath);
$apiKey = $env["OPENROUTER_API_KEY"] ?? null;

if (!$apiKey) {
    die("❌ ERROR: La variable OPENROUTER_API_KEY no existe en el .env");
}

echo "✅ Archivo .env cargado correctamente.\n";
echo "🔑 API Key detectada (primeros caracteres): " . substr($apiKey, 0, 10) . "...\n\n";

// 2. Configurar la petición a un modelo que SABEMOS que es gratuito y estable
// Hemos cambiado a Gemini 2.0 Flash Lite que es el más confiable hoy en OpenRouter
$url = "https://openrouter.ai/api/v1/chat/completions";
$modelo = "arcee-ai/trinity-large-preview:free";

$payload = json_encode([
    "model" => $modelo,
    "messages" => [
        ["role" => "user", "content" => "Hola, ¿estás funcionando? Responde solo con la palabra 'AFIRMATIVO'."]
    ]
]);

echo "📡 Conectando con OpenRouter usando el modelo: $modelo...\n";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . trim($apiKey),
    "Content-Type: application/json",
    "HTTP-Referer: http://localhost", 
    "X-Title: Test Astronaut"
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$errorCurl = curl_error($ch);
curl_close($ch);

// 3. Analizar Resultados
if ($errorCurl) {
    echo "❌ ERROR DE CONEXIÓN (cURL): " . $errorCurl . "\n";
} else {
    echo "Statud HTTP: " . $httpCode . "\n";
    echo "Respuesta del servidor:\n";
    echo "---------------------------\n";
    echo $response . "\n";
    echo "---------------------------\n";
}

$data = json_decode($response, true);
if (isset($data['choices'][0]['message']['content'])) {
    echo "\n🚀 ¡ÉXITO! La IA respondió: " . $data['choices'][0]['message']['content'] . "\n";
} else {
    echo "\n⚠️ LA IA NO RESPONDIÓ. Revisa el mensaje de error arriba.\n";
    if (isset($data['error'])) {
        echo "Causa probable: " . ($data['error']['message'] ?? 'Desconocida');
    }
}