/**
 * Carga y reutilización segura de modelos glTF. Valida el catálogo, conserva plantillas para acelerar
 * nuevas instancias y gestiona las texturas y sombras de cada objeto.
 */


import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  MODEL_CACHE_MAX_SIZE, GEO_ENTER_RADIUS_M, GEO_INVOKE_RADIUS_M, GEO_EXIT_RADIUS_M,
  GEO_MAX_PROXIMITY_ACCURACY_M, GEO_MAX_INVOKE_ACCURACY_M
} from './config.js';
import { hasMarker, hasGeo, getContentDescriptor, isValidGeoPolygon } from './catalogUtils.js';
import { withDeadline } from './async.js';

const activeTemplateInstances = new WeakMap();
const templateReservations = new Map();

/**
 * Gestiona plantillas compartidas y su orden de reutilización para limitar memoria.
 */
class ModelTemplateCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  /**
   * Recupera una plantilla existente y actualiza su prioridad de uso.
   */
  get(modelPath) {
    if (!this.map.has(modelPath)) return undefined;
    const template = this.map.get(modelPath);
    this.map.delete(modelPath);
    this.map.set(modelPath, template);
    return template;
  }

  /**
   * Guarda la plantilla recién cargada y elimina excedentes que no se utilicen.
   */
  set(modelPath, template) {
    if (this.map.has(modelPath)) this.map.delete(modelPath);
    this.map.set(modelPath, template);

    this.trim();
  }

  /**
   * Descarta entradas disponibles cuando el caché sobrepasa su capacidad.
   */
  trim() {
    while (this.map.size > this.maxSize) {
      const candidate = [...this.map].find(([path, template]) =>
        (activeTemplateInstances.get(template) ?? 0) === 0 && !templateReservations.has(path)
      );
      if (!candidate) {
        console.warn(`Caché GLB temporalmente sobre el límite ${this.maxSize}: todas las plantillas tienen instancias activas.`);
        return;
      }
      const [key, template] = candidate;
      this.map.delete(key);
      disposeModelTemplate(template);
      console.log(`Plantilla descartada de la caché LRU: ${key}`);
    }
  }
}

/**
 * Elimina texturas y geometrías que ya no tienen consumidores.
 */
function disposeModelTemplate(template) {
  template.traverse((node) => {
    if (!node.isMesh) return;

    node.geometry?.dispose();

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => value?.isTexture && value.dispose());
      material.dispose();
    });
  });
}

const cache = new ModelTemplateCache(MODEL_CACHE_MAX_SIZE);

/**
 * Comprueba identificadores, marcadores, rutas y opciones del catálogo antes del arranque.
 */
export function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error('Catálogo inválido: está vacío o no es un array.');
  }

  const errors = [];
  const fail = (message) => { errors.push(message); console.error(message); };
  const seenIndices = new Map();
  const seenIds = new Set();
  const geoEntries = [];

  for (const entry of catalog) {
    if (!entry || typeof entry !== 'object') {
      fail('catalog.js: entrada inválida (no es un objeto).');
      continue;
    }

    if (typeof entry.id !== 'string' || !entry.id.trim()) {
      fail('catalog.js: entrada sin "id" (obligatorio y no vacío).');
    } else if (seenIds.has(entry.id)) {
      fail(`catalog.js: id duplicado ("${entry.id}"): cada entrada necesita un id único.`);
    } else {
      seenIds.add(entry.id);
    }

    if (typeof entry.name !== 'string' || !entry.name.trim()) {
      console.warn(`catalog.js: "${entry.id ?? '?'}" no tiene "name" visible.`);
    }

    for (const key of ['initialScale', 'sheetScaleFactor']) {
      if (entry[key] != null && (!Number.isFinite(entry[key]) || entry[key] <= 0)) {
        fail(`catalog.js: "${entry.id}" tiene ${key} inválido.`);
      }
    }
    for (const key of ['centerPosition', 'sheetPosition', 'centerRotation', 'sheetRotation']) {
      const value = entry[key];
      if (value != null && (![value.x, value.y, value.z].every(Number.isFinite) ||
          typeof value.clone !== 'function' ||
          (key.endsWith('Rotation') ? !value.isEuler : !value.isVector3))) {
        fail(`catalog.js: "${entry.id}" tiene ${key} inválido.`);
      }
    }

    for (const source of ['marker', 'geo']) {
      if (source === 'marker' && !hasMarker(entry)) continue;
      if (source === 'geo' && !hasGeo(entry)) continue;
      const declaredContent = entry.stages?.[source === 'geo' ? 'onsite' : 'discovery']?.content ?? entry.content;
      if (declaredContent != null && (
        !['model3d', 'image', 'video'].includes(declaredContent.type) ||
        typeof declaredContent.src !== 'string' || !declaredContent.src.trim()
      )) {
        fail(`catalog.js: "${entry.id}" declara contenido ${source} con type/src inválidos.`);
      }
      const descriptor = getContentDescriptor(entry, source);
      if (descriptor?.type === 'video' && descriptor.volume != null &&
          (!Number.isFinite(descriptor.volume) || descriptor.volume < 0 || descriptor.volume > 1)) {
        fail(`catalog.js: "${entry.id}" tiene volumen de vídeo inválido.`);
      }
      if (!descriptor || !['model3d', 'image', 'video'].includes(descriptor.type) ||
          typeof descriptor.src !== 'string' || !descriptor.src.trim()) {
        fail(`catalog.js: "${entry.id}" no tiene contenido válido para ${source} (model3d/image/video).`);
      }
    }

    const marker = hasMarker(entry);
    const geo = hasGeo(entry);
    if (!marker && !geo) {
      fail(`catalog.js: "${entry.id}" no tiene ninguna vía de invocación (markerIndex o geo).`);
    }

    if (entry.markerIndex != null && !marker) {
      fail(`catalog.js: "${entry.id}" tiene un markerIndex inválido (${entry.markerIndex}).`);
    }
    if (marker) {
      const firstEntryId = seenIndices.get(entry.markerIndex);
      if (firstEntryId) {
        fail(`catalog.js: markerIndex duplicado (${entry.markerIndex}) — "${firstEntryId}" y "${entry.id}".`);
      } else {
        seenIndices.set(entry.markerIndex, entry.id);
      }
    }

    if (entry.geo != null && !geo) {
      fail(`catalog.js: "${entry.id}" tiene coordenadas Geo inválidas.`);
    }
    if (geo) {
      const g = entry.geo;
      if (g.activationPolygon != null && !isValidGeoPolygon(g.activationPolygon)) {
        fail(`catalog.js: "${entry.id}" tiene activationPolygon inválido.`);
      }
      if (g.exclusionPolygons != null && (!Array.isArray(g.exclusionPolygons) ||
          !g.exclusionPolygons.every(isValidGeoPolygon))) {
        fail(`catalog.js: "${entry.id}" tiene exclusionPolygons inválido.`);
      }
      if (g.viewFill != null && (!Number.isFinite(g.viewFill) || g.viewFill <= 0)) {
        fail(`catalog.js: "${entry.id}" tiene viewFill inválido.`);
      }
      const invoke = g.invokeRadiusM ?? GEO_INVOKE_RADIUS_M;
      const enter = g.enterRadiusM ?? GEO_ENTER_RADIUS_M;
      const exit = g.exitRadiusM ?? GEO_EXIT_RADIUS_M;
      const proxAcc = g.maxProximityAccuracyM ?? GEO_MAX_PROXIMITY_ACCURACY_M;
      const invokeAcc = g.maxInvokeAccuracyM ?? GEO_MAX_INVOKE_ACCURACY_M;
      if (![invoke, enter, exit, proxAcc, invokeAcc].every(Number.isFinite)) {
        fail(`catalog.js: "${entry.id}" tiene umbrales Geo no finitos.`);
      } else {
        if (!(0 < invoke && invoke < enter && enter < exit)) {
          fail(`catalog.js: "${entry.id}" debe cumplir 0 < invokeRadiusM < enterRadiusM < exitRadiusM.`);
        }
        if (proxAcc <= 0 || invokeAcc <= 0) {
          fail(`catalog.js: "${entry.id}" tiene umbrales de precisión Geo inválidos.`);
        }
      }
      if (typeof entry.summary !== 'string' || !entry.summary.trim()) {
        console.warn(`catalog.js: "${entry.id}" no tiene summary para la UI de proximidad.`);
      }
      geoEntries.push(entry);
    }
  }

  if (seenIndices.size) {
    const maxIndex = Math.max(...seenIndices.keys());
    for (let i = 0; i <= maxIndex; i++) {
      if (!seenIndices.has(i)) {
        console.warn(`catalog.js: hueco en los markerIndex (falta ${i}, hay ${maxIndex} como máximo).`);
      }
    }
  }

  for (let i = 0; i < geoEntries.length; i++) {
    for (let j = i + 1; j < geoEntries.length; j++) {
      const a = geoEntries[i];
      const b = geoEntries[j];
      const distance = haversineForValidation(a.geo, b.geo);
      const threshold = Math.max(
        a.geo.invokeRadiusM ?? GEO_INVOKE_RADIUS_M,
        b.geo.invokeRadiusM ?? GEO_INVOKE_RADIUS_M
      );
      if (distance < threshold) {
        console.warn(
          `catalog.js: "${a.id}" y "${b.id}" están a ${distance.toFixed(1)} m. ` +
          'El motor elegirá la más cercana, pero GPS interior puede no distinguirlas.'
        );
      }
    }
  }
  if (errors.length) {
    throw new Error(`Catálogo inválido (${errors.length}):\n${errors.join('\n')}`);
  }
}

export const validateMarkerCatalog = validateCatalog;

function haversineForValidation(a, b) {
  const R = 6371000;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const inflightLoads = new Map();

/**
 * Obtiene una plantilla con referencia de uso para que nadie la libere antes de tiempo.
 */
export function acquireModelTemplate(entry) {
  const path = entry.modelPath;
  templateReservations.set(path, (templateReservations.get(path) ?? 0) + 1);
  let released = false;
  return {
    promise: loadModelTemplate(entry),
    release() {
      if (released) return;
      released = true;
      const count = templateReservations.get(path) - 1;
      if (count) templateReservations.set(path, count);
      else templateReservations.delete(path);
      cache.trim();
    }
  };
}

/**
 * Gestiona carga compartida y caché para el archivo de una pieza.
 */
export function loadModelTemplate(entry) {
  const cached = cache.get(entry.modelPath);
  if (cached) return Promise.resolve(cached);

  const inflight = inflightLoads.get(entry.modelPath);
  if (inflight) return inflight;

  const loadPromise = withDeadline(signal => doLoadModelTemplate(entry, signal), {
    onLateResult: disposeModelTemplate
  }).then(template => {
    cache.set(entry.modelPath, template);
    return template;
  }).finally(() => {
    if (inflightLoads.get(entry.modelPath) === loadPromise) inflightLoads.delete(entry.modelPath);
  });
  inflightLoads.set(entry.modelPath, loadPromise);
  return loadPromise;
}

/**
 * Descarga y procesa el glTF, respetando las señales de cancelación cuando sea posible.
 */
async function doLoadModelTemplate(entry, signal) {
  console.log(`Cargando modelo "${entry.name}" (${entry.modelPath})...`);

  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const response = await fetch(entry.modelPath, { signal });
  if (!response.ok) throw new Error(`Modelo HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const base = new URL('.', response.url || new URL(entry.modelPath, location.href)).href;
  const gltf = await loader.parseAsync(bytes, base);

  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (material && 'envMapIntensity' in material) material.envMapIntensity = 0.4;
    });
  });

  const bbox = new THREE.Box3().setFromObject(gltf.scene);
  gltf.scene.userData.bbox = bbox;

  return gltf.scene;
}

/**
 * Crea una instancia independiente sin duplicar los recursos compartidos innecesariamente.
 */
export function instantiateModel(entry, template) {
  const instance = cloneSkeleton(template);
  activeTemplateInstances.set(template, (activeTemplateInstances.get(template) ?? 0) + 1);

  instance.position.set(0, 0, 0.1);
  instance.rotation.set(0, 0, 0);
  instance.scale.setScalar(entry.initialScale ?? 0.1);
  instance.visible = true;

  const shadow = createContactShadow(template.userData.bbox);
  if (shadow) {
    instance.add(shadow);
    instance.userData.contactShadow = shadow;
  }

  return instance;
}

/**
 * Elimina recursos exclusivos de una instancia y conserva la plantilla si sigue en uso.
 */
export function disposeModelInstance(instance, template) {
  const skeletons = new Set();
  instance?.traverse(node => {
    if (node.isSkinnedMesh && node.skeleton) skeletons.add(node.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  const shadow = instance?.userData?.contactShadow;
  if (shadow) {
    shadow.parent?.remove(shadow);
    shadow.geometry.dispose();
    shadow.material.dispose();
    delete instance.userData.contactShadow;
  }
  const remaining = activeTemplateInstances.get(template) ?? 0;
  if (remaining > 0) {
    if (remaining === 1) activeTemplateInstances.delete(template);
    else activeTemplateInstances.set(template, remaining - 1);
    cache.trim();
  }
}


const shadowDown = new THREE.Vector3(0, -1.5, 0);
const shadowOffset = new THREE.Vector3();
const shadowInvQuat = new THREE.Quaternion();

/**
 * Actualiza la sombra de apoyo de acuerdo con la posición del objeto.
 */
export function updateContactShadow(instance) {
  const shadow = instance?.userData?.contactShadow;
  if (!shadow || !shadow.userData.freeFloat) return;

  const scale = instance.scale.x || 1;

  shadowInvQuat.copy(instance.quaternion).invert();
  shadowOffset.copy(shadowDown).multiplyScalar(scale * shadow.userData.dropDistance);
  shadowOffset.applyQuaternion(shadowInvQuat).divideScalar(scale);
  shadow.position.copy(shadowOffset);

  shadow.quaternion.copy(shadowInvQuat).multiply(shadow.userData.baseQuat);
}

/**
 * Cambia el tratamiento de la sombra según el objeto esté apoyado o flotando.
 */
export function setContactShadowFreeFloat(instance, free) {
  const shadow = instance?.userData?.contactShadow;
  if (shadow) shadow.userData.freeFloat = free;
}

let contactShadowTexture = null;

function getContactShadowTexture() {
  if (contactShadowTexture) return contactShadowTexture;

  const size = 250;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.50)');
  gradient.addColorStop(0.50, 'rgba(0, 0, 0, 0.25)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  contactShadowTexture = new THREE.CanvasTexture(canvas);
  return contactShadowTexture;
}

/**
 * Construye el plano y material que simulan contacto bajo la pieza.
 */
function createContactShadow(bbox) {
  if (!bbox || bbox.isEmpty()) return null;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);

  const radius = Math.max(size.x, size.z) * 0.75;
  if (radius <= 0) return null;

  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2);
  const material = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(10);
  const lift = Math.max(size.x, size.y, size.z) * 0.005;
  const extraDrop = size.y * 0.05;
  mesh.position.set(center.x, bbox.min.y + lift - extraDrop, center.z);
  mesh.renderOrder = 1;

  mesh.userData.baseQuat = mesh.quaternion.clone();
  mesh.userData.dropDistance = center.y - bbox.min.y - lift + extraDrop;
  mesh.userData.freeFloat = false;

  return mesh;
}
