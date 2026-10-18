/**
 * Funciones puras que interpretan las capacidades de cada entrada del catálogo. Permiten compartir las
 * reglas de marcadores, geolocalización y etapas entre los distintos módulos.
 */


/**
 * Comprueba que una entrada declare un índice de marcador utilizable.
 */
export function hasMarker(entry) {
  return Number.isInteger(entry?.markerIndex) && entry.markerIndex >= 0;
}

/**
 * Verifica que una pieza contenga coordenadas geográficas configuradas.
 */
export function hasGeo(entry) {
  const geo = entry?.geo;
  return Boolean(
    geo &&
    Number.isFinite(geo.latitude) && geo.latitude >= -90 && geo.latitude <= 90 &&
    Number.isFinite(geo.longitude) && geo.longitude >= -180 && geo.longitude <= 180
  );
}

/**
 * Indica si el catálogo necesita activar el subsistema GPS.
 */
export function hasGeoEntries(catalog) {
  return Array.isArray(catalog) && catalog.some(hasGeo);
}

/**
 * Comprueba la estructura mínima del polígono de activación.
 */
export function isValidGeoPolygon(polygon) {
  return Array.isArray(polygon) && polygon.length >= 3 && polygon.every(point => {
    const latitude = Array.isArray(point) ? point[0] : point?.latitude;
    const longitude = Array.isArray(point) ? point[1] : point?.longitude;
    return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
      Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  });
}

/**
 * Obtiene únicamente las piezas que deben tener ancla de seguimiento visual.
 */
export function entriesWithMarker(catalog) {
  return Array.isArray(catalog) ? catalog.filter(hasMarker) : [];
}

/**
 * Determina la etapa narrativa apropiada según la fuente de invocación.
 */
export function getExperienceStage(source = 'marker') {
  return source === 'geo' || source === 'onsite' ? 'onsite' : 'discovery';
}

/**
 * Selecciona los metadatos específicos de una etapa con alternativas compatibles.
 */
export function getStageMetadata(entry, source = 'marker') {
  return entry?.stages?.[getExperienceStage(source)] ?? null;
}

/**
 * Normaliza el tipo y la ruta del contenido, incluyendo los modelos antiguos basados en modelPath.
 */
export function getContentDescriptor(entry, source = 'marker') {
  const stage = getStageMetadata(entry, source);
  const content = stage?.content ?? entry?.content;
  if (content?.type && typeof content.src === 'string' && content.src) {
    return content;
  }
  if (typeof entry?.modelPath === 'string' && entry.modelPath) {
    return { type: 'model3d', src: entry.modelPath };
  }
  return null;
}

/**
 * Detecta vídeos para preparar solo las capacidades multimedia necesarias.
 */
export function hasVideoEntries(catalog) {
  return Array.isArray(catalog) && catalog.some((entry) =>
    ['marker', 'geo'].some((source) => getContentDescriptor(entry, source)?.type === 'video'));
}
