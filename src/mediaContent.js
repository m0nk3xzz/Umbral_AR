/**
 * Representación de imágenes y vídeos como superficies dentro de la escena 3D. Prepara texturas,
 * sincroniza reproducción y elimina recursos cuando la pieza sale.
 */


import * as THREE from 'three';
import {
  IMAGE_CACHE_MAX_SIZE,
  VIDEO_DEFAULT_VOLUME,
  VIDEO_SEEK_MIN_INTERVAL_MS
} from './config.js';
import {
  enableVideoAudio,
  setVideoVolume,
  getVideoVolume,
  silenceVideo,
  restoreVideoGain,
  disconnectVideoAudio
} from './mediaAudio.js';

import { createResourceCache } from './resourceCache.js';
import { withDeadline } from './async.js';
const imageCache = createResourceCache({
  maxSize: IMAGE_CACHE_MAX_SIZE,
  load: async (src, signal) => {
    const response = await fetch(src, { signal });
    if (!response.ok) throw new Error(`Imagen HTTP ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    let texture;
    try { texture = await new THREE.TextureLoader().loadAsync(blobUrl); }
    finally { URL.revokeObjectURL(blobUrl); }
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  },
  dispose: texture => texture.dispose()
});

/**
 * Calcula las proporciones del plano visual preservando la relación de aspecto.
 */
function normalizedPlaneSize(width, height) {
  if (!(width > 0) || !(height > 0)) throw new Error('Dimensiones de media inválidas.');
  const aspect = width / height;
  return aspect >= 1 ? { width: 1, height: 1 / aspect } : { width: aspect, height: 1 };
}

/**
 * Produce las dimensiones que permiten centrar el contenido como cualquier modelo.
 */
function bboxForPlane(width, height) {
  return new THREE.Box3(
    new THREE.Vector3(-width / 2, -height / 2, 0),
    new THREE.Vector3(width / 2, height / 2, 0)
  );
}

/**
 * Carga y conserva la imagen para acelerar su presentación posterior.
 */
export async function preloadImage(src) {
  return imageCache.preload(src);
}

/**
 * Construye una malla con textura de imagen y su función de limpieza.
 */
export async function instantiateImage(src, { signal } = {}) {
  const held = imageCache.acquire(src);
  let texture;
  try {
    texture = await withDeadline(() => held.promise, { signal });
    if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError');
  } catch (err) { held.release(); throw err; }
  const image = texture.image;
  const { width, height } = normalizedPlaneSize(image?.width, image?.height);
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  let disposed = false;

  return {
    type: 'image',
    object: group,
    bbox: bboxForPlane(width, height),
    controller: null,
    stopImmediate() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      held.release();
    }
  };
}

/**
 * Prepara el elemento multimedia para reducir latencia de inicio.
 */
export async function preloadVideo(src) {
  return { src };
}

const VIDEO_METADATA_TIMEOUT_MS = 20000;

/**
 * Espera dimensiones y duración del vídeo, admitiendo cancelación de la espera.
 */
function waitForMetadata(video, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Carga cancelada', 'AbortError'));
  if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onLoaded = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(video.error ?? new Error('No se pudo cargar metadata del video.')); };
    const onAbort = () => { cleanup(); reject(new DOMException('Carga cancelada', 'AbortError')); };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('Tiempo de espera de metadatos de vídeo agotado.')); }, VIDEO_METADATA_TIMEOUT_MS);
  });
}

/**
 * Crea la textura animada y expone reproducción, sonido, búsqueda y liberación.
 */
export async function instantiateVideo(entry, descriptor, { signal } = {}) {
  const video = document.createElement('video');
  video.src = descriptor.src;
  video.playsInline = true;
  video.muted = true;
  video.defaultMuted = true;
  video.preload = 'metadata';
  video.loop = Boolean(descriptor.loop ?? entry.content?.loop);

  try {
    await waitForMetadata(video, { signal });
  } catch (err) {
    video.removeAttribute('src');
    video.load();
    throw err;
  }
  const { width, height } = normalizedPlaneSize(video.videoWidth, video.videoHeight);
  const geometry = new THREE.PlaneGeometry(width, height);
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);

  let audioEnabled = false;
  let desiredVolume = descriptor.volume ?? VIDEO_DEFAULT_VOLUME;
  let playing = false;
  let pausedBy = null;
  let seekPending = 0;
  let lastSeekAt = 0;
  let disposed = false;
  let playGeneration = 0;
  let audioPromise = null;
  const playListeners = new Set();
  const endedListeners = new Set();
  const handleEnded = () => {
    playing = false;
    emitPlaying();
    if (!video.loop) endedListeners.forEach((cb) => cb());
  };
  video.addEventListener('ended', handleEnded);

  const emitPlaying = () => playListeners.forEach((cb) => cb(playing));

  const controller = {
    async play() {
      if (disposed) return false;
      const generation = ++playGeneration;
      try {
        if (audioEnabled) {
          video.muted = false;
          restoreVideoGain(video);
        }
        await video.play();
        if (disposed || generation !== playGeneration) return false;
        playing = true;
        pausedBy = null;
        emitPlaying();
        return true;
      } catch {
        if (!disposed && generation === playGeneration) {
          playing = false;
          emitPlaying();
        }
        return false;
      }
    },
    pause({ reason = 'user' } = {}) {
      if (disposed) return;
      playGeneration++;
      video.pause();
      playing = false;
      pausedBy = reason;
      emitPlaying();
    },
    async togglePause() {
      if (video.paused) return this.play();
      this.pause({ reason: 'user' });
      return false;
    },
    enableAudio() {
      if (disposed) return Promise.resolve(false);
      if (!audioPromise) {
        audioPromise = enableVideoAudio(video, desiredVolume, { isCurrent: () => !disposed })
          .then((result) => {
            if (disposed || !result) return false;
            desiredVolume = setVideoVolume(video, desiredVolume);
            audioEnabled = true;
            video.muted = false;
            restoreVideoGain(video);
            return true;
          }).finally(() => { audioPromise = null; });
      }
      return audioPromise;
    },
    isAudioEnabled() { return audioEnabled; },
    isPlaying() { return playing && !video.paused; },
    seekBy(seconds) {
      if (disposed || !Number.isFinite(seconds) || !Number.isFinite(video.duration)) return;
      seekPending += seconds;
    },
    volumeBy(delta) {
      if (disposed || !Number.isFinite(delta)) return desiredVolume;
      desiredVolume = Math.max(0, Math.min(1, desiredVolume + delta));
      if (audioEnabled) setVideoVolume(video, desiredVolume);
      return desiredVolume;
    },
    getVolume() { return audioEnabled ? getVideoVolume(video, desiredVolume) : desiredVolume; },
    update(now = performance.now()) {
      if (disposed || !seekPending || !Number.isFinite(video.duration)) return;
      if (now - lastSeekAt < VIDEO_SEEK_MIN_INTERVAL_MS) return;
      const next = Math.max(0, Math.min(video.duration, video.currentTime + seekPending));
      seekPending = 0;
      lastSeekAt = now;
      try { video.currentTime = next; } catch {}
    },
    readout(kind) {
      if (kind === 'volume') return `Vol. ${Math.round(this.getVolume() * 100)} %`;
      if (kind === 'seek') return `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
      return '';
    },
    onPlayState(cb) { playListeners.add(cb); return () => playListeners.delete(cb); },
    onEnded(cb) { endedListeners.add(cb); return () => endedListeners.delete(cb); },
    pauseForVoice() {
      if (!video.paused) this.pause({ reason: 'ai' });
      else if (audioEnabled) silenceVideo(video);
    },
    stopImmediate() {
      if (disposed) return;
      playGeneration++;
      video.pause();
      playing = false;
      if (audioEnabled) silenceVideo(video);
      emitPlaying();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playGeneration++;
      video.pause();
      video.removeEventListener('ended', handleEnded);
      silenceVideo(video);
      disconnectVideoAudio(video);
      audioEnabled = false;
      video.removeAttribute('src');
      video.load();
      texture.dispose();
      geometry.dispose();
      material.dispose();
      playListeners.clear();
      endedListeners.clear();
    }
  };

  return {
    type: 'video',
    object: group,
    bbox: bboxForPlane(width, height),
    controller,
    stopImmediate: () => controller.stopImmediate(),
    dispose: () => controller.dispose()
  };
}

/**
 * Convierte segundos a una indicación temporal compacta para controles.
 */
function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(seconds % 60).padStart(2, '0')}`;
}
