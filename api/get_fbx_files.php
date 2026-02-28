<?php
/**
 * IAstronaut - Módulo de Gestión de Activos 3D
 * Este script escanea el directorio raíz en busca de modelos FBX 
 * para alimentar el visor interactivo.
 */

// 1. Configuración de cabeceras para permitir peticiones AJAX y formato JSON
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 2. Definir la ruta de búsqueda (directorio actual)
$directorio = __DIR__;

// 3. Buscar todos los archivos con extensión .fbx (ignora mayúsculas/minúsculas)
// glob() es eficiente para servidores de bajo costo como Hostinger o XAMPP local
$archivos = glob($directorio . '/*.{fbx,FBX}', GLOB_BRACE);

// 4. Procesar la lista para limpiar las rutas absolutas
$listaModelos = array();

if ($archivos !== false) {
    foreach ($archivos as $rutaCompleta) {
        // Extraer solo el nombre del archivo (ej: "telescopio.fbx")
        $listaModelos[] = basename($rutaCompleta);
    }
}

// 5. Ordenar la lista para una mejor experiencia de usuario en el menú desplegable
sort($listaModelos);

// 6. Retornar el resultado al frontend de IAstronaut
// Si no hay archivos, enviará un array vacío []
echo json_encode($listaModelos);

?>