/**
 * Traduce posturas de mano a rotación, traslación y escala de la pieza. Filtra el movimiento y aplica
 * inercia controlada cuando finaliza un gesto.
 */


import * as THREE from 'three';
import { classifyHandPose, resetPoseState, getDetectionId } from './handTracking.js';
import { setGestureState } from './ui.js';
import { prefersReducedMotion } from './motion.js';
import {
  SCALE_MULTIPLIER_MIN,
  SCALE_MULTIPLIER_MAX,
  SCALE_SENSITIVITY,
  ROTATION_MAX_RAD,
  ROTATION_SENSITIVITY,
  MOVE_SENSITIVITY,
  MOVE_LIMIT_X,
  MOVE_LIMIT_Y,
  GESTURE_TIME_CONSTANT_S,
  GESTURE_VELOCITY_MAX_AGE_S,
  POSE_DEBOUNCE_FRAMES,
  INERTIA_ACTIONS,
  VIDEO_SEEK_SECONDS_PER_UNIT,
  VIDEO_VOLUME_SENSITIVITY,
  INERTIA_TIME_CONSTANT_S,
  INERTIA_VELOCITY_GAIN,
  INERTIA_MIN_SPEED,
  INERTIA_STOP_SPEED,
  INERTIA_MAX_FRAME_GAP_S
} from './config.js';

let activeGesture = null;
let activeAction = null;
let gestureReferencePoint = null;

let smoothedVelocityX = 0;
let smoothedVelocityY = 0;
let lastGestureSampleTime = null;
let lastGestureFrameTime = null;

let accumulatedRotationX = 0;
let accumulatedRotationY = 0;

let pendingPose = null;
let pendingPoseStreak = 0;

let inertia = null;

let lastProcessedDetectionId = -1;

/**
 * Conserva una porción de la velocidad reciente para suavizar la liberación del gesto.
 */
function captureInertia() {
  inertia = null;

  if (prefersReducedMotion()) return;
  if (!activeAction || !INERTIA_ACTIONS.includes(activeAction)) return;

  if (
    lastGestureSampleTime !== null &&
    (performance.now() - lastGestureSampleTime) / 1000 > GESTURE_VELOCITY_MAX_AGE_S
  ) return;

  const speed = Math.hypot(smoothedVelocityX, smoothedVelocityY);
  if (speed < INERTIA_MIN_SPEED) return;

  inertia = {
    gesture: activeAction,
    vx: smoothedVelocityX * INERTIA_VELOCITY_GAIN,
    vy: smoothedVelocityY * INERTIA_VELOCITY_GAIN
  };
}

/**
 * Borra acciones y velocidades anteriores para que no afecten una pieza nueva.
 */
function clearGestureState() {
  captureInertia();

  activeGesture = null;
  activeAction = null;
  gestureReferencePoint = null;
  smoothedVelocityX = 0;
  smoothedVelocityY = 0;
  lastGestureSampleTime = null;
}

/**
 * Calcula velocidad a partir de puntos de la mano y descarta muestras demasiado antiguas.
 */
export function updateVelocity(results, session) {
  if (!session?.centeringComplete || !session.model) return;

  const detectionId = getDetectionId();
  if (detectionId === lastProcessedDetectionId) return;
  lastProcessedDetectionId = detectionId;

  const now = performance.now();

  if (!results || !results.landmarks.length) {
    clearGestureState();
    pendingPose = null;
    pendingPoseStreak = 0;
    setGestureState({ active: null, detected: false });
    return;
  }

  const landmarks = results.landmarks[0];
  const rawPose = classifyHandPose(landmarks);
  const wrist = landmarks[0];

  if (rawPose === pendingPose) pendingPoseStreak++;
  else { pendingPose = rawPose; pendingPoseStreak = 1; }

  const pose = pendingPoseStreak >= POSE_DEBOUNCE_FRAMES ? pendingPose : activeGesture;

  setGestureState({ active: pose, detected: true });

  if (pose === null) {
    clearGestureState();
    return;
  }

  if (pose !== activeGesture || !gestureReferencePoint || lastGestureSampleTime === null) {
    inertia = null;
    activeGesture = pose;
    activeAction = resolveAction(session, pose);
    gestureReferencePoint = { x: wrist.x, y: wrist.y };
    smoothedVelocityX = 0;
    smoothedVelocityY = 0;
    lastGestureSampleTime = now;
    return;
  }

  const dtSample = (now - lastGestureSampleTime) / 1000;
  if (dtSample <= 0) return;

  const rawVelocityX = (wrist.x - gestureReferencePoint.x) / dtSample;
  const rawVelocityY = (wrist.y - gestureReferencePoint.y) / dtSample;

  const alpha = 1 - Math.exp(-dtSample / GESTURE_TIME_CONSTANT_S);
  smoothedVelocityX = THREE.MathUtils.lerp(smoothedVelocityX, rawVelocityX, alpha);
  smoothedVelocityY = THREE.MathUtils.lerp(smoothedVelocityY, rawVelocityY, alpha);

  gestureReferencePoint = { x: wrist.x, y: wrist.y };
  lastGestureSampleTime = now;
}

/**
 * Integra movimientos e inercia y aplica límites a la transformación 3D.
 */
export function applyMotion(session) {
  const now = performance.now();
  const previousFrameTime = lastGestureFrameTime;
  lastGestureFrameTime = now;

  if (!session?.centeringComplete || !session.model) return;
  if (previousFrameTime === null) return;

  const dtFrame = (now - previousFrameTime) / 1000;
  if (!Number.isFinite(dtFrame) || dtFrame <= 0) return;
  if (dtFrame > INERTIA_MAX_FRAME_GAP_S) {
    inertia = null;
    smoothedVelocityX = 0;
    smoothedVelocityY = 0;
    gestureReferencePoint = null;
    lastGestureSampleTime = null;
    return;
  }

  if (activeGesture) {
    if (lastGestureSampleTime !== null && (now - lastGestureSampleTime) / 1000 > GESTURE_VELOCITY_MAX_AGE_S) {
      smoothedVelocityX = 0;
      smoothedVelocityY = 0;
    }

    applyDelta(activeAction, smoothedVelocityX * dtFrame, smoothedVelocityY * dtFrame, session);
    return;
  }

  if (!inertia) return;

  const decay = Math.exp(-dtFrame / INERTIA_TIME_CONSTANT_S);
  inertia.vx *= decay;
  inertia.vy *= decay;

  if (Math.hypot(inertia.vx, inertia.vy) < INERTIA_STOP_SPEED) {
    inertia = null;
    return;
  }

  applyDelta(inertia.gesture, inertia.vx * dtFrame, inertia.vy * dtFrame, session);
}

/**
 * Asocia la postura detectada con la acción permitida en la sesión actual.
 */
function resolveAction(session, pose) {
  const type = session?.contentInstance?.type ?? 'model3d';
  if (type !== 'video') return pose;
  if (pose === 'rotateY') return 'seek';
  if (pose === 'rotateX') return 'volume';
  return pose;
}

/**
 * Convierte desplazamientos normalizados en escala, giro o traslación con sensibilidad configurable.
 */
function applyDelta(gesture, deltaX, deltaY, session) {
  const model = session.model;
  const baseModelScale = session.baseModelScale;

  const baseRotationX = session.baseRotation?.x ?? 0;
  const baseRotationY = session.baseRotation?.y ?? 0;

  switch (gesture) {
    case 'scale': {
      const currentMultiplier = model.scale.x / baseModelScale;
      const nextMultiplier = currentMultiplier - deltaY * SCALE_SENSITIVITY;
      const clamped = THREE.MathUtils.clamp(nextMultiplier, SCALE_MULTIPLIER_MIN, SCALE_MULTIPLIER_MAX);
      model.scale.setScalar(baseModelScale * clamped);
      break;
    }
    case 'rotateY': {
      accumulatedRotationY = THREE.MathUtils.clamp(
        accumulatedRotationY + deltaX * ROTATION_SENSITIVITY, -ROTATION_MAX_RAD, ROTATION_MAX_RAD
      );
      model.rotation.y = baseRotationY + accumulatedRotationY;
      break;
    }
    case 'rotateX': {
      accumulatedRotationX = THREE.MathUtils.clamp(
        accumulatedRotationX - deltaY * ROTATION_SENSITIVITY, -ROTATION_MAX_RAD, ROTATION_MAX_RAD
      );
      model.rotation.x = baseRotationX + accumulatedRotationX;
      break;
    }
    case 'seek': {
      session.contentInstance?.controller?.seekBy?.(deltaX * VIDEO_SEEK_SECONDS_PER_UNIT);
      break;
    }
    case 'volume': {
      session.contentInstance?.controller?.volumeBy?.(-deltaY * VIDEO_VOLUME_SENSITIVITY);
      break;
    }
    case 'move': {
      model.position.x = THREE.MathUtils.clamp(
        model.position.x + deltaX * MOVE_SENSITIVITY, -MOVE_LIMIT_X, MOVE_LIMIT_X
      );
      model.position.y = THREE.MathUtils.clamp(
        model.position.y - deltaY * MOVE_SENSITIVITY, -MOVE_LIMIT_Y, MOVE_LIMIT_Y
      );
      break;
    }
  }
}

/**
 * Restablece el controlador al abandonar la interacción o recuperar el escaneo.
 */
export function reset() {
  clearGestureState();
  inertia = null;
  pendingPose = null;
  pendingPoseStreak = 0;
  lastGestureFrameTime = null;
  lastProcessedDetectionId = -1;
  accumulatedRotationX = 0;
  accumulatedRotationY = 0;
  resetPoseState();
}
