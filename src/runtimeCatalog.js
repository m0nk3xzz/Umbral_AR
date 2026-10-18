/**
 * Construye el catálogo efectivo de ejecución. En desarrollo permite un escenario de pruebas de campo
 * sin modificar ni publicar las coordenadas del catálogo base.
 */


import { MARKER_CATALOG } from './catalog.js';

/**
 * Convierte una opción de entorno a un número válido con valor de reserva.
 */
function envNumber(env, name, fallback = null) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Copia los datos de una entrada para que las pruebas no muten el catálogo original.
 */
function cloneEntry(entry) {
  return {
    ...entry,
    translations: entry.translations ? structuredClone(entry.translations) : entry.translations,
    content: entry.content ? { ...entry.content } : entry.content,
    stages: entry.stages ? structuredClone(entry.stages) : entry.stages,
    geo: entry.geo ? { ...entry.geo } : entry.geo
  };
}

/**
 * Activa el escenario de campo solo cuando las condiciones del entorno lo autorizan.
 */
export function isFieldTestEnabled(env = import.meta.env) {
  if (env?.PROD && env?.VITE_FIELD_TEST === '1') {
    throw new Error('VITE_FIELD_TEST=1 no está permitido en producción.');
  }
  return env?.VITE_FIELD_TEST === '1';
}

/**
 * Aplica cambios temporales de geolocalización y medios únicamente al catálogo de ejecución.
 */
export function buildRuntimeCatalog(baseCatalog, env = {}) {
  if (!isFieldTestEnabled(env)) return baseCatalog;

  const catalog = baseCatalog.map(cloneEntry);
  const entry = catalog.find((item) => item.id === 'objeto-1');
  if (!entry) return catalog;

  const latitude = envNumber(env, 'VITE_FIELD_TEST_LAT');
  const longitude = envNumber(env, 'VITE_FIELD_TEST_LNG');
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    entry.geo = {
      latitude,
      longitude,
      enterRadiusM: envNumber(env, 'VITE_FIELD_TEST_ENTER_RADIUS_M', 24),
      invokeRadiusM: envNumber(env, 'VITE_FIELD_TEST_INVOKE_RADIUS_M', 8),
      exitRadiusM: envNumber(env, 'VITE_FIELD_TEST_EXIT_RADIUS_M', 65),
      maxProximityAccuracyM: envNumber(env, 'VITE_FIELD_TEST_MAX_PROXIMITY_ACCURACY_M', 60),
      maxInvokeAccuracyM: envNumber(env, 'VITE_FIELD_TEST_MAX_INVOKE_ACCURACY_M', 30),
      viewFill: envNumber(env, 'VITE_FIELD_TEST_VIEW_FILL', 0.35)
    };
    entry.summary = 'Pieza temporal de validación Geo. No corresponde a datos curatoriales de producción.';
  }

  const type = String(env?.VITE_FIELD_TEST_CONTENT ?? 'model3d').toLowerCase();
  if (type === 'image') {
    entry.content = { type: 'image', src: '/media/field-test-image.svg' };
    entry.preload = false;
  } else if (type === 'video') {
    entry.content = { type: 'video', src: '/media/field-test-video.mp4', loop: true };
    entry.preload = false;
  } else {
    delete entry.content;
  }

  return catalog;
}

/**
 * Devuelve las entradas definitivas del entorno actual sin publicar valores de prueba.
 */
export function getRuntimeCatalog(env = import.meta.env) {
  const catalog = buildRuntimeCatalog(MARKER_CATALOG, env);
  if (!isFieldTestEnabled(env)) return catalog;

  const entry = catalog.find((item) => item.id === 'objeto-1');
  if (!entry?.geo) {
    console.warn('[field-test] Faltan VITE_FIELD_TEST_LAT/LNG; Geo queda desactivado para la prueba.');
  }
  console.info('[field-test] activo', {
    content: entry?.content?.type ?? 'model3d',
    geo: entry?.geo ?? null,
    entryId: entry?.id ?? null
  });
  return catalog;
}
