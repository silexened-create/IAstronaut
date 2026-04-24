/**
 * artemis_rag.js - Motor de Búsqueda Semántica sobre datos de Artemis II
 * Implementa un sistema RAG (Retrieval-Augmented Generation) ligero
 * que inyecta contexto verificado de NASA en las consultas al chat.
 */

let artemisData = null;
let dataLoaded = false;

// ── Mapeo de intenciones: keywords → secciones del JSON ──
const INTENT_MAP = [
  {
    id: 'tripulacion',
    keywords: [
      'tripulacion', 'tripulación', 'crew', 'astronauta', 'astronautas',
      'reid', 'wiseman', 'victor', 'glover', 'christina', 'koch',
      'jeremy', 'hansen', 'comandante', 'piloto', 'especialista',
      'quien', 'quién', 'quienes', 'quiénes', 'personas', 'equipo',
      'hombre negro', 'mujer', 'canadiense', 'canadá'
    ],
    extractor: (data) => {
      const t = data.tripulacion_historica;
      return `TRIPULACIÓN DE ARTEMIS II (DATOS VERIFICADOS NASA):
• Comandante: ${t.comandante.nombre} — Agencia: ${t.comandante.agencia} — ${t.comandante.hitos}
• Piloto: ${t.piloto.nombre} — Agencia: ${t.piloto.agencia} — ${t.piloto.hitos}
• Especialista de Misión 1: ${t.especialista_1.nombre} — Agencia: ${t.especialista_1.agencia} — ${t.especialista_1.hitos}
• Especialista de Misión 2: ${t.especialista_2.nombre} — Agencia: ${t.especialista_2.agencia} — ${t.especialista_2.hitos}`;
    }
  },
  {
    id: 'mision',
    keywords: [
      'mision', 'misión', 'artemis ii', 'artemis 2', 'artemis dos',
      'objetivo', 'estado', 'duracion', 'duración', 'fecha',
      'lanzamiento', 'llegada', 'regreso', 'orbita', 'órbita',
      'circunlunar', 'distancia', 'luna', 'alrededor',
      'cuando', 'cuándo', 'cuanto', 'cuánto', 'duro', 'duró'
    ],
    extractor: (data) => {
      const m = data.mision_principal;
      return `MISIÓN ARTEMIS II (DATOS VERIFICADOS NASA):
• Nombre: ${m.nombre}
• Objetivo: ${m.objetivo}
• Estado: ${m.estado}
• Fecha de lanzamiento: ${m.fecha_lanzamiento}
• Fecha de llegada lunar: ${m.fecha_llegada}
• Fecha de regreso: ${m.fecha_regreso}
• Duración estimada: ${m.duracion_estimada}
• Tipo de órbita: ${m.tipo_orbita}
• Distancia máxima: ${m.distancia_maxima}`;
    }
  },
  {
    id: 'sls',
    keywords: [
      'sls', 'space launch system', 'cohete', 'rocket',
      'empuje', 'potencia', 'rs-25', 'motores', 'propulsor',
      'combustible', 'saturno', 'saturn', 'block 1',
      'lanzador', 'vehiculo', 'vehículo'
    ],
    extractor: (data) => {
      const s = data.tecnologia_y_hardware.cohete_sls;
      return `COHETE SLS - SPACE LAUNCH SYSTEM (DATOS VERIFICADOS NASA):
• Nombre completo: ${s.nombre_completo}
• Configuración: ${s.configuracion}
• Potencia: ${s.potencia}
• Componentes: ${s.componentes}`;
    }
  },
  {
    id: 'orion',
    keywords: [
      'orion', 'orión', 'nave', 'capsula', 'cápsula', 'spacecraft',
      'modulo', 'módulo', 'servicio', 'lockheed', 'airbus',
      'soporte vital', 'aborto', 'las', 'seguridad',
      'fabricante', 'capacidad'
    ],
    extractor: (data) => {
      const o = data.tecnologia_y_hardware.nave_orion;
      return `NAVE ORION (DATOS VERIFICADOS NASA):
• Fabricante: ${o.fabricante}
• Capacidad: ${o.capacidad}
• Seguridad: ${o.seguridad}`;
    }
  },
  {
    id: 'etapas',
    keywords: [
      'etapa', 'etapas', 'vuelo', 'fases', 'fase',
      'kennedy', 'florida', 'complejo', '39b',
      'inyeccion', 'inyección', 'trans-lunar', 'translunar',
      'amerizaje', 'amarizaje', 'paracaidas', 'paracaídas',
      'pacifico', 'pacífico', 'reentrada', 'splashdown',
      'aterrizaje', 'regreso'
    ],
    extractor: (data) => {
      const e = data.etapas_de_vuelo;
      return `ETAPAS DE VUELO ARTEMIS II (DATOS VERIFICADOS NASA):
• Lanzamiento: ${e.lanzamiento}
• Órbita terrestre: ${e.orbita_terrestre}
• Inyección trans-lunar: ${e.inyeccion_trans_lunar}
• Regreso: ${e.regreso}`;
    }
  },
  {
    id: 'hoja_ruta',
    keywords: [
      'hoja de ruta', 'roadmap', 'futuro', 'artemis iii', 'artemis 3',
      'artemis iv', 'artemis 4', 'gateway', 'marte', 'mars',
      'polo sur', 'alunizaje', 'siguiente', 'proxima', 'próxima',
      'despues', 'después', 'plan', 'planes', 'programa',
      'sostenible', 'presencia'
    ],
    extractor: (data) => {
      const h = data.hoja_de_ruta_artemis;
      return `HOJA DE RUTA DEL PROGRAMA ARTEMIS (DATOS VERIFICADOS NASA):
• Artemis I: ${h.artemis_I}
• Artemis II: ${h.artemis_II}
• Artemis III: ${h.artemis_III}
• Artemis IV: ${h.artemis_IV}
• Objetivo final: ${h.objetivo_final}`;
    }
  },
  {
    id: 'faq',
    keywords: [
      'polo sur', 'hielo', 'agua', 'crater', 'cráter',
      'apollo', 'apolo', 'diferencia', 'comparacion', 'comparación',
      'gateway', 'estacion', 'estación', 'puerto',
      'por que', 'por qué', 'para que', 'para qué'
    ],
    extractor: (data) => {
      const f = data.preguntas_frecuentes_datos;
      return `PREGUNTAS FRECUENTES ARTEMIS (DATOS VERIFICADOS NASA):
• ¿Por qué el Polo Sur?: ${f.por_que_el_polo_sur}
• Diferencia con Apollo: ${f.diferencia_con_apollo}
• ¿Qué es Gateway?: ${f.gateway}`;
    }
  }
];

/**
 * Carga el JSON de Artemis II desde el servidor.
 * Se ejecuta automáticamente al importar el módulo.
 */
export async function cargarDatosArtemis() {
  if (dataLoaded && artemisData) return artemisData;

  try {
    const response = await fetch('data/artemis_ii.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    artemisData = await response.json();
    dataLoaded = true;
    console.log('🚀 [RAG] Datos de Artemis II cargados exitosamente.');
    
    // Disparar evento para que el panel se actualice
    window.dispatchEvent(new CustomEvent('artemis-data-loaded', { detail: artemisData }));
    
    return artemisData;
  } catch (err) {
    console.error('❌ [RAG] Error cargando datos de Artemis:', err);
    return null;
  }
}

/**
 * Normaliza texto para comparación: minúsculas, sin acentos, sin puntuación.
 */
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9\s]/g, ' ')   // Solo alfanuméricos y espacios
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula un score de relevancia entre la consulta del usuario y un intent.
 * Usa matching de keywords con pesos por cantidad de matches.
 */
function calcularRelevancia(queryNorm, intent) {
  let score = 0;
  let matchedKeywords = 0;

  for (const keyword of intent.keywords) {
    const kwNorm = normalizar(keyword);
    
    // Match exacto de keyword completa
    if (queryNorm.includes(kwNorm)) {
      // Keywords más largas tienen más peso (son más específicas)
      score += kwNorm.length > 5 ? 3 : 2;
      matchedKeywords++;
    }
  }

  // Bonus si hay múltiples keywords del mismo intent
  if (matchedKeywords >= 3) score += 5;
  else if (matchedKeywords >= 2) score += 2;

  return { score, matchedKeywords };
}

/**
 * Busca contexto relevante de Artemis II para una consulta dada.
 * Retorna un string formateado con los datos verificados, o null si no hay match.
 * 
 * @param {string} query - La pregunta del usuario
 * @returns {string|null} - Contexto formateado o null
 */
export function buscarContextoArtemis(query) {
  if (!artemisData || !query) return null;

  const queryNorm = normalizar(query);
  
  // Si la query es muy corta (< 3 chars), no buscamos
  if (queryNorm.length < 3) return null;

  // Calcular relevancia para cada intent
  const resultados = INTENT_MAP
    .map(intent => ({
      ...intent,
      ...calcularRelevancia(queryNorm, intent)
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (resultados.length === 0) return null;

  // Tomar los top intents (máximo 3 para no sobrecargar el contexto)
  const topIntents = resultados.slice(0, 3);
  
  console.log(`🔍 [RAG] Intents detectados:`, topIntents.map(r => `${r.id}(${r.score})`).join(', '));

  // Construir el contexto combinado
  const bloques = topIntents.map(intent => intent.extractor(artemisData));
  
  return bloques.join('\n\n');
}

/**
 * Obtiene los tweets más recientes del JSON para el Social Feed.
 * @param {number} limit - Número máximo de tweets a retornar
 * @returns {Array} - Array de objetos tweet
 */
export function obtenerTweetsArtemis(limit = 5) {
  if (!artemisData || !artemisData.actualizaciones_twitter) return [];
  return artemisData.actualizaciones_twitter.slice(0, limit);
}

/**
 * Obtiene los datos completos de la misión para el panel visual.
 * @returns {Object|null}
 */
export function obtenerDatosMision() {
  if (!artemisData) return null;
  return {
    mision: artemisData.mision_principal,
    tripulacion: artemisData.tripulacion_historica,
    tecnologia: artemisData.tecnologia_y_hardware,
    ultimaActualizacion: artemisData.ultima_actualizacion_scraper
  };
}

// Auto-cargar al importar
cargarDatosArtemis();
