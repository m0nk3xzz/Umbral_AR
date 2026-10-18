/**
 * Construcción de la escena MindAR y configuración de iluminación. Prepara el renderizador, las luces y
 * las anclas antes de que se active la cámara.
 */


import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { MARKERS_MIND_PATH, KEY_LIGHT_INTENSITY } from './config.js';
import { entriesWithMarker } from './catalogUtils.js';

/**
 * Inicializa MindAR, configura el renderizador y entrega la cámara y luz principal.
 */
export async function createScene(container) {
  const mindarThree = new MindARThree({
    container,
    imageTargetSrc: MARKERS_MIND_PATH,
    uiLoading: 'no',
    uiScanning: 'no', // Se oculta el indicador nativo porque la interfaz ya dibuja una guía de búsqueda propia.
    uiError: 'yes'
  });

  const { renderer, scene } = mindarThree;
  const camera = mindarThree.camera;

  scene.add(camera);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const keyLight = await setupLighting(scene, camera, renderer);

  return { mindarThree, camera, scene, renderer, keyLight };
}

/**
 * Instala luces complementarias y reflejos para hacer legibles los modelos sobre vídeo real.
 */
async function setupLighting(scene, camera, renderer) {
  try {
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    try {
      const target = pmrem.fromScene(room, 0.04);
      scene.environment = target.texture;
      scene.userData.disposeEnvironment = () => {
        scene.environment = null;
        target.dispose();
      };
    } finally {
      room.dispose();
      pmrem.dispose();
    }
  } catch (err) {
    console.warn('No se pudo generar el environment map; se continúa solo con luces:', err);
  }

  const ambientLight = new THREE.HemisphereLight(0xf0ece3, 0x1a1816, 0.15);
  scene.add(ambientLight);

  const addDirectional = (color, intensity, x, y, z) => {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    camera.add(light);
    camera.add(light.target);
    return light;
  };

  const keyLight = addDirectional(0xffe4c4, KEY_LIGHT_INTENSITY, 1.7, 0.9, 0.35);
  addDirectional(0xe4ebf5, 0.3, -1.2, -0.1, 0.7);
  addDirectional(0xfff6ea, 0.9, 0.1, 1.6, 0.35);
  addDirectional(0xffffff, 2.8, -0.4, 0.9, -1.3);

  return keyLight;
}

/**
 * Crea las anclas de las piezas que declaran un índice de marcador.
 */
export function createAnchors(mindarThree, catalog) {
  return entriesWithMarker(catalog).map((entry) => ({
    entry,
    anchor: mindarThree.addAnchor(entry.markerIndex)
  }));
}
