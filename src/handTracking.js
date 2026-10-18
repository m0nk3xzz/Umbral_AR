/**
 * Integra el detector de manos de MediaPipe, el dibujo opcional de puntos y la calibración
 * personalizada. Reduce lecturas ruidosas antes de entregar gestos a la interacción 3D.
 */


import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { calibration as calUI, setGestureState } from './ui.js';
import {
  MEDIAPIPE_WASM_URL,
  HANDS_INIT_TIMEOUT_MS,
  HAND_LANDMARKER_MODEL_URL,
  HAND_LANDMARK_OPACITY,
  CALIBRATION_LANDMARK_OPACITY,
  HAND_CONNECTIONS,
  HAND_DETECTION_FRAME_INTERVAL,
  DEFAULT_FINGER_EXTENSION_MARGIN,
  DEFAULT_THUMB_ENTER_THRESHOLD,
  DEFAULT_THUMB_EXIT_THRESHOLD,
  CALIBRATION_COUNTDOWN_MS,
  CALIBRATION_SAMPLE_MS,
  CALIBRATION_DONE_MESSAGE_MS,
  NO_HAND_HINT_MS
} from './config.js';

let handLandmarker = null;
let active = false;

let detectionPaused = false;

let landmarkerInitPromise = null;
let bootGaveUp = false;
let lifecycleGeneration = 0;
let cancelCalibration = null;

let overlayCanvas = null;
let overlayCtx = null;
let overlayContainer = null;

let layoutCache = null;
let layoutCacheVideo = null;

let latestResults = null;
let frameCounter = 0;

let detectionId = 0;

let fingerExtensionMargins = {
  index: DEFAULT_FINGER_EXTENSION_MARGIN,
  middle: DEFAULT_FINGER_EXTENSION_MARGIN,
  ring: DEFAULT_FINGER_EXTENSION_MARGIN,
  pinky: DEFAULT_FINGER_EXTENSION_MARGIN
};
let thumbEnterThreshold = DEFAULT_THUMB_ENTER_THRESHOLD;
let thumbExitThreshold = DEFAULT_THUMB_EXIT_THRESHOLD;

let thumbWasExtended = false;

/**
 * Restituye umbrales seguros antes de analizar una mano nueva.
 */
function resetCalibrationToDefaults() {
  fingerExtensionMargins = {
    index: DEFAULT_FINGER_EXTENSION_MARGIN,
    middle: DEFAULT_FINGER_EXTENSION_MARGIN,
    ring: DEFAULT_FINGER_EXTENSION_MARGIN,
    pinky: DEFAULT_FINGER_EXTENSION_MARGIN
  };
  thumbEnterThreshold = DEFAULT_THUMB_ENTER_THRESHOLD;
  thumbExitThreshold = DEFAULT_THUMB_EXIT_THRESHOLD;
  thumbWasExtended = false;
}

let landmarkOpacity = HAND_LANDMARK_OPACITY;


/**
 * Prepara el detector de manos y notifica disponibilidad o degradación del servicio.
 */
export function init({ onReady = null } = {}) {
  if (!landmarkerInitPromise) {
    const generation = lifecycleGeneration;
    landmarkerInitPromise = initLandmarker().then(
      (landmarker) => {
        if (generation !== lifecycleGeneration) {
          landmarker.close();
          return null;
        }
        handLandmarker = landmarker;
        console.log('HandLandmarker listo.');
        if (bootGaveUp && onReady) onReady();
        return landmarker;
      },
      (err) => {
        if (generation !== lifecycleGeneration) throw err;
        console.error('No se pudo inicializar HandLandmarker:', err);
        handLandmarker = null;
        landmarkerInitPromise = null;
        throw err;
      }
    );
  }

  return withTimeout(
    landmarkerInitPromise,
    HANDS_INIT_TIMEOUT_MS,
    'HandLandmarker tardó demasiado en cargar (WASM/modelo)'
  ).catch((err) => {
    bootGaveUp = true;
    throw err;
  });
}

/**
 * Evita que una inicialización de MediaPipe quede bloqueada indefinidamente.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Carga el runtime local de MediaPipe y crea el detector de puntos de la mano.
 */
async function initLandmarker() {
  console.log('Cargando HandLandmarker...');

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  try {
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL, delegate: 'GPU' },
      numHands: 1,
      runningMode: 'VIDEO'
    });
    console.log('HandLandmarker listo (GPU).');
    return landmarker;
  } catch (gpuError) {
    console.warn('Delegate GPU falló, reintentando con CPU:', gpuError);
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL, delegate: 'CPU' },
      numHands: 1,
      runningMode: 'VIDEO'
    });
    console.log('HandLandmarker listo (CPU, fallback).');
    return landmarker;
  }
}

/**
 * Indica si el modelo de visión puede procesar fotogramas.
 */
export function isReady() {
  return handLandmarker !== null;
}

/**
 * Suspende temporalmente la inferencia mientras otra fase ocupa la experiencia.
 */
export function pauseDetection() {
  detectionPaused = true;
}

/**
 * Autoriza de nuevo la detección continua cuando corresponde.
 */
export function resumeDetection() {
  detectionPaused = false;
}

/**
 * Conecta la superposición visual al contenedor donde se presenta la cámara.
 */
export function activate(container, insertBeforeEl) {
  if (active) return;
  active = true;

  ensureOverlay(container, insertBeforeEl);
  setGestureState({ active: null, detected: false });

  console.log('Hand tracking activo.');
}

/**
 * Detiene el uso activo y oculta la capa de seguimiento.
 */
export function deactivate() {
  active = false;
  latestResults = null;
  frameCounter = 0;
  thumbWasExtended = false;

  clearOverlay();
  setGestureState({ active: null, detected: false });
}

/**
 * Libera detector, lienzo y recursos asociados al seguimiento.
 */
export function dispose() {
  lifecycleGeneration++;
  cancelCalibration?.();
  try { handLandmarker?.close(); }
  catch (error) { console.warn('No se pudo cerrar HandLandmarker:', error); }
  handLandmarker = null;
  landmarkerInitPromise = null;
  bootGaveUp = false;
  deactivate();
  detectionPaused = false;
  window.removeEventListener('resize', resizeOverlay);
  overlayCanvas?.remove();
  overlayCanvas = overlayCtx = overlayContainer = null;
  layoutCache = layoutCacheVideo = null;
}

/**
 * Analiza un fotograma de vídeo y devuelve los puntos disponibles de mano.
 */
export function detect(video) {
  if (!active || detectionPaused || !handLandmarker || !video || video.readyState < 2) return null;

  frameCounter++;
  if (frameCounter % HAND_DETECTION_FRAME_INTERVAL !== 0) return latestResults;

  latestResults = handLandmarker.detectForVideo(video, performance.now());
  detectionId++;
  drawLandmarks(video, latestResults);

  return latestResults;
}

export function getDetectionId() {
  return detectionId;
}


/**
 * Crea una sola capa de dibujo alineada con el vídeo de la cámara.
 */
function ensureOverlay(container, insertBeforeEl) {
  if (!overlayCanvas) {
    overlayContainer = container;
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;
    `;
    overlayCtx = overlayCanvas.getContext('2d');

    window.addEventListener('resize', resizeOverlay);
  }

  container.insertBefore(overlayCanvas, insertBeforeEl);
  resizeOverlay();
}

function resizeOverlay() {
  if (!overlayCanvas || !overlayContainer) return;
  const dpr = Math.min(window.devicePixelRatio, 2);
  overlayCanvas.width = overlayContainer.clientWidth * dpr;
  overlayCanvas.height = overlayContainer.clientHeight * dpr;
  layoutCache = null;
}

export function refreshLayout() { resizeOverlay(); }

function clearOverlay() {
  if (overlayCtx && overlayCanvas) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
}

function landmarkToCanvasPoint(landmark, containerRect, videoRect, dpr) {
  const xInContainer = (videoRect.left - containerRect.left) + landmark.x * videoRect.width;
  const yInContainer = (videoRect.top - containerRect.top) + landmark.y * videoRect.height;
  return { x: xInContainer * dpr, y: yInContainer * dpr };
}

/**
 * Representa los puntos y conexiones usados como ayuda durante la calibración.
 */
function drawLandmarks(video, results) {
  if (!overlayCtx || !overlayCanvas) return;

  if (landmarkOpacity === 0) return;

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!results || !results.landmarks.length) return;

  const dpr = Math.min(window.devicePixelRatio, 2);
  if (!layoutCache || layoutCacheVideo !== video) {
    layoutCache = {
      container: overlayContainer.getBoundingClientRect(),
      video: video.getBoundingClientRect()
    };
    layoutCacheVideo = video;
  }
  const containerRect = layoutCache.container;
  const videoRect = layoutCache.video;

  overlayCtx.globalAlpha = landmarkOpacity;

  results.landmarks.forEach((handLandmarks) => {
    overlayCtx.strokeStyle = '#00ffcc';
    overlayCtx.lineWidth = 3 * dpr;

    HAND_CONNECTIONS.forEach(([a, b]) => {
      const pointA = landmarkToCanvasPoint(handLandmarks[a], containerRect, videoRect, dpr);
      const pointB = landmarkToCanvasPoint(handLandmarks[b], containerRect, videoRect, dpr);
      overlayCtx.beginPath();
      overlayCtx.moveTo(pointA.x, pointA.y);
      overlayCtx.lineTo(pointB.x, pointB.y);
      overlayCtx.stroke();
    });

    overlayCtx.fillStyle = '#ff3366';
    handLandmarks.forEach((landmark) => {
      const point = landmarkToCanvasPoint(landmark, containerRect, videoRect, dpr);
      overlayCtx.beginPath();
      overlayCtx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
      overlayCtx.fill();
    });
  });

  overlayCtx.globalAlpha = 1;
}


function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Evalúa la extensión de un dedo usando articulaciones y tolerancias calibradas.
 */
function isFingerExtended(landmarks, tipIndex, pipIndex, fingerKey) {
  const wrist = landmarks[0];
  const handSize = distance2D(wrist, landmarks[5]) || 1;
  const distTip = distance2D(wrist, landmarks[tipIndex]);
  const distPip = distance2D(wrist, landmarks[pipIndex]);
  const margin = fingerExtensionMargins[fingerKey] ?? DEFAULT_FINGER_EXTENSION_MARGIN;

  return (distTip - distPip) > handSize * margin;
}

/**
 * Calcula el estado del pulgar con umbrales de entrada y salida diferenciados.
 */
function isThumbExtended(landmarks) {
  const wrist = landmarks[0];
  const handSize = distance2D(wrist, landmarks[5]) || 1;
  const distance = distance2D(landmarks[4], landmarks[5]);

  const enterThreshold = handSize * thumbEnterThreshold;
  const exitThreshold = handSize * thumbExitThreshold;

  thumbWasExtended = thumbWasExtended ? distance > exitThreshold : distance > enterThreshold;
  return thumbWasExtended;
}

/**
 * Resume las articulaciones reconocidas en una postura utilizable por el controlador.
 */
export function classifyHandPose(landmarks) {
  const thumbExtended = isThumbExtended(landmarks);
  const indexExtended = isFingerExtended(landmarks, 8, 6, 'index');
  const middleExtended = isFingerExtended(landmarks, 12, 10, 'middle');
  const ringExtended = isFingerExtended(landmarks, 16, 14, 'ring');
  const pinkyExtended = isFingerExtended(landmarks, 20, 18, 'pinky');
  const ringAndPinkyCurled = !ringExtended && !pinkyExtended;

  if (!indexExtended && !middleExtended && ringAndPinkyCurled) return 'move';
  if (!ringAndPinkyCurled) return null;
  if (indexExtended && middleExtended) return 'rotateX';
  if (indexExtended && !middleExtended) return thumbExtended ? 'scale' : 'rotateY';

  return null;
}

export function resetPoseState() {
  thumbWasExtended = false;
}


function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function sleepUnlessSkipped(ms, isSkipped, onProgress = null) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    function check() {
      if (isSkipped() || performance.now() - startTime >= ms) resolve();
      else {
        onProgress?.(Math.min((performance.now() - startTime) / ms, 1));
        requestAnimationFrame(check);
      }
    }
    check();
  });
}

/**
 * Toma lecturas durante una ventana de calibración y admite omitir el proceso.
 */
function collectPoseSamples(video, durationMs, isSkipped, onProgress = null, onDetection = null) {
  return new Promise((resolve, reject) => {
    const samples = { index: [], middle: [], ring: [], pinky: [], thumb: [] };
    const startTime = performance.now();
    let lastDetectedAt = startTime;

    function step(now) {
      try {
        if (isSkipped()) return resolve(samples);

        if (video.readyState >= 2 && handLandmarker) {
          const results = handLandmarker.detectForVideo(video, now);
          drawLandmarks(video, results);

          if (results.landmarks.length) {
            lastDetectedAt = now;
            onDetection?.(true, 0);

            const landmarks = results.landmarks[0];
            const wrist = landmarks[0];
            const handSize = distance2D(wrist, landmarks[5]) || 1;

            samples.index.push((distance2D(wrist, landmarks[8]) - distance2D(wrist, landmarks[6])) / handSize);
            samples.middle.push((distance2D(wrist, landmarks[12]) - distance2D(wrist, landmarks[10])) / handSize);
            samples.ring.push((distance2D(wrist, landmarks[16]) - distance2D(wrist, landmarks[14])) / handSize);
            samples.pinky.push((distance2D(wrist, landmarks[20]) - distance2D(wrist, landmarks[18])) / handSize);
            samples.thumb.push(distance2D(landmarks[4], landmarks[5]) / handSize);
          } else {
            onDetection?.(false, now - lastDetectedAt);
          }
        }

        onProgress?.(Math.min((now - startTime) / durationMs, 1));
        if (now - startTime < durationMs) requestAnimationFrame(step);
        else resolve(samples);
      } catch (err) {
        reject(err);
      }
    }

    requestAnimationFrame(step);
  });
}

/**
 * Deriva umbrales personales de las muestras de mano abierta y puño.
 */
function applyCalibrationResults(fistSamples, openSamples) {
  const result = { ok: 0, total: 5 };

  ['index', 'middle', 'ring', 'pinky'].forEach((finger) => {
    const curled = average(fistSamples[finger]);
    const extended = average(openSamples[finger]);

    if (curled === null || extended === null || extended <= curled) {
      console.warn(`Calibración de "${finger}" incompleta; se usa el valor por defecto.`);
      return;
    }

    fingerExtensionMargins[finger] = (curled + extended) / 2;
    result.ok++;
    console.log(`Umbral calibrado (${finger}): ${fingerExtensionMargins[finger].toFixed(3)}`);
  });

  const thumbCurled = average(fistSamples.thumb);
  const thumbExtendedAvg = average(openSamples.thumb);

  if (thumbCurled !== null && thumbExtendedAvg !== null && thumbExtendedAvg > thumbCurled) {
    const midpoint = (thumbCurled + thumbExtendedAvg) / 2;
    const margin = (thumbExtendedAvg - thumbCurled) * 0.1;

    thumbEnterThreshold = midpoint + margin;
    thumbExitThreshold = midpoint - margin;
    result.ok++;
    console.log(`Umbral calibrado (pulgar): salida ${thumbExitThreshold.toFixed(3)} / entrada ${thumbEnterThreshold.toFixed(3)}`);
  } else {
    console.warn('Calibración de pulgar incompleta; se usa el valor por defecto.');
  }

  return result;
}

/**
 * Guía la captura de poses, informa del progreso y aplica ajustes obtenidos.
 */
export function runCalibration(video, container) {
  return new Promise((resolveCalibration) => {
    const generation = lifecycleGeneration;
    let skipped = false;
    const isSkipped = () => skipped;
    resetCalibrationToDefaults();
    const controls = calUI.awaitStartOrSkip(() => { skipped = true; });
    cancelCalibration = () => { skipped = true; controls.cancel?.(); };

    if (!overlayCanvas) ensureOverlay(container, null);
    calUI.show();

    pauseDetection();

    const previousOpacity = landmarkOpacity;
    landmarkOpacity = CALIBRATION_LANDMARK_OPACITY;

    function handleDetection(detected, noHandMs) {
      calUI.setHandDetected(detected, noHandMs > NO_HAND_HINT_MS);
    }

    async function runStep(stepKey, progressStart) {
      calUI.setStep(stepKey);

      await sleepUnlessSkipped(CALIBRATION_COUNTDOWN_MS, isSkipped, (frac) => {
        calUI.setProgress(progressStart + frac * 0.2);
      });
      if (skipped) return null;

      const samples = await collectPoseSamples(
        video,
        CALIBRATION_SAMPLE_MS,
        isSkipped,
        (frac) => calUI.setProgress(progressStart + 0.2 + frac * 0.3),
        handleDetection
      );
      clearOverlay();
      calUI.setHandDetected(null, false);

      return samples;
    }

    async function flow() {
      try {
        skipped = (await controls.choice) === 'skip' || skipped;
        if (generation !== lifecycleGeneration) return;

        let fistSamples = null;
        let openSamples = null;

        if (!skipped) fistSamples = await runStep('fist', 0);
        if (!skipped) openSamples = await runStep('open', 0.5);
        if (generation !== lifecycleGeneration) return;

        clearOverlay();

        if (!skipped && fistSamples && openSamples) {
          const { ok, total } = applyCalibrationResults(fistSamples, openSamples);
          calUI.setProgress(1);

          if (ok === total) calUI.setStep('done');
          else if (ok > 0) calUI.setStep('partial');
          else calUI.setStep('failed');
        } else {
          console.log('Calibración omitida o incompleta: se usan los umbrales por defecto.');
          calUI.setStep('skipped');
        }

        await new Promise((resolve) => setTimeout(resolve, CALIBRATION_DONE_MESSAGE_MS));

      } catch (err) {
        console.error('Error durante la calibración; se utilizarán umbrales por defecto:', err);
      } finally {
        controls.dispose();
        cancelCalibration = null;
        if (generation !== lifecycleGeneration) { resolveCalibration(); return; }
        clearOverlay();
        calUI.setHandDetected(null);
        landmarkOpacity = previousOpacity;
        resumeDetection();
        calUI.hide();
        resolveCalibration();
      }
    }

    void flow();
  });
}
