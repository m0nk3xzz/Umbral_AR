/**
 * Fachada de carga de contenido. Unifica modelos 3D, imágenes y vídeos bajo un ciclo común de precarga,
 * creación y liberación de recursos.
 */


import { loadModelTemplate, acquireModelTemplate, instantiateModel, disposeModelInstance } from './modelCache.js';
import { getContentDescriptor } from './catalogUtils.js';
import { preloadImage, instantiateImage, preloadVideo, instantiateVideo } from './mediaContent.js';

const ready = new Set();

/**
 * Inicia la precarga del recurso indicado por la etapa sin crear todavía una instancia visible.
 */
export async function preloadContent(entry, source = 'marker') {
  const descriptor = getContentDescriptor(entry, source);
  if (!descriptor) throw new Error(`Contenido inválido para ${entry?.id ?? 'entrada desconocida'}`);

  let loaded;
  if (descriptor.type === 'model3d') {
    loaded = await loadModelTemplate({ ...entry, modelPath: descriptor.src });
  } else if (descriptor.type === 'image') {
    loaded = await preloadImage(descriptor.src);
  } else if (descriptor.type === 'video') {
    loaded = await preloadVideo(descriptor.src);
  } else {
    throw new Error(`Tipo de contenido no soportado: ${descriptor.type}`);
  }

  ready.add(`${entry.id}:${source}`);
  return loaded;
}

/**
 * Recupera el recurso compartido correspondiente al descriptor de la pieza.
 */
export async function loadContent(entry, source = 'marker') {
  const descriptor = getContentDescriptor(entry, source);
  if (descriptor?.type === 'model3d') {
    const held = acquireModelTemplate({ ...entry, modelPath: descriptor.src });
    try {
      const template = await held.promise;
      ready.add(`${entry.id}:${source}`);
      return { template, release: held.release };
    }
    catch (error) { held.release(); throw error; }
  }
  return preloadContent(entry, source);
}

/**
 * Construye el elemento visual y devuelve una interfaz común de detención y eliminación.
 */
export async function instantiateContent(entry, loaded, { signal, source = 'marker' } = {}) {
  const descriptor = getContentDescriptor(entry, source);
  if (!descriptor) throw new Error(`Contenido inválido para ${entry?.id ?? 'entrada desconocida'}`);

  if (descriptor.type === 'model3d') {
    const template = loaded.template ?? loaded;
    if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError');
    const object = instantiateModel({ ...entry, modelPath: descriptor.src }, template);
    let disposed = false;
    return {
      type: 'model3d',
      object,
      bbox: template.userData.bbox?.clone?.() ?? template.userData.bbox ?? null,
      controller: null,
      stopImmediate() {},
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeModelInstance(object, template);
      }
    };
  }
  if (descriptor.type === 'image') return instantiateImage(descriptor.src, { signal });
  if (descriptor.type === 'video') return instantiateVideo(entry, descriptor, { signal });
  throw new Error(`Tipo de contenido no soportado: ${descriptor.type}`);
}

/**
 * Comprueba si los recursos necesarios ya están disponibles para presentar la pieza.
 */
export function isContentReady(entry, source = 'marker') {
  return ready.has(`${entry?.id}:${source}`);
}
