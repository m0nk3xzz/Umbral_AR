/**
 * Controlador del ciclo de vida de cada pieza invocada. Arbitra la entrada desde marcador o GPS, su
 * materialización, interacción y salida con limpieza de recursos.
 */


import * as THREE from 'three';
import { setContactShadowFreeFloat } from './modelCache.js';
import { loadContent, instantiateContent } from './content.js';
import { getExperienceStage } from './catalogUtils.js';
import { journeyProgress } from './journeyProgress.js';
import { withDeadline } from './async.js';
import * as motion from './motion.js';
import * as ui from './ui.js';
import * as handTracking from './handTracking.js';
import * as gestureControl from './gestureControl.js';
import { feedback } from './feedback.js';
import { t } from './i18n.js';
import { VoiceState, getVoiceState } from './voiceAgent.js';
import {
  setActiveObject as setVoiceActiveObject,
  clearActiveObject as clearVoiceActiveObject
} from './voiceAgent.js';
import {
  DECOUPLE_DELAY_MS,
  CENTER_DELAY_MS,
  CENTER_ANIMATION_MS,
  CENTER_POSITION,
  CENTER_ROTATION,
  SHEET_OPEN_POSITION,
  SHEET_OPEN_ROTATION,
  SHEET_OPEN_SCALE_FACTOR,
  EXIT_DURATION_MS,
  KEY_LIGHT_INTENSITY,
  KEY_LIGHT_RAMP_FROM,
  KEY_LIGHT_RAMP_MS,
  SHADOW_FADE_DELAY_MS,
  SHADOW_FADE_MS,
  GEO_VIEW_FILL,
  GEO_SPAWN_OFFSET,
  VIDEO_RESUME_AFTER_AI
} from './config.js';

let camera = null;
let mindarThree = null;
let container = null;
let keyLight = null;
let anchors = [];
let activeSession = null;
const pendingDisposals = new Set();

/**
 * Detiene reproducción, audio y geometría pertenecientes a una sesión anterior.
 */
function disposeSessionContent(session) {
  if (!session || session.contentDisposed) return;
  session.contentDisposed = true;
  if (session.disposeTimeoutId != null) clearTimeout(session.disposeTimeoutId);
  pendingDisposals.delete(session);
  if (session.model) {
    motion.cancelPose(session.model);
    session.model.parent?.remove(session.model);
  }
  session.contentInstance?.dispose?.();
  session.contentInstance = null;
  session.model = null;
}

/**
 * Libera reservas que perdieron vigencia durante una carga asíncrona.
 */
function disposePendingSessions() {
  for (const session of [...pendingDisposals]) disposeSessionContent(session);
}

let callbacks = { onClaimed: null, onReleased: null, onFailed: null };

/**
 * Recibe las dependencias de escena y registra observadores para gestionar invocaciones.
 */
export function init({
  camera: cam,
  mindarThree: mindar,
  container: cont,
  keyLight: key = null,
  anchors: markerAnchors = [],
  onClaimed = null,
  onReleased = null,
  onFailed = null
}) {
  disposePendingSessions();
  camera = cam;
  mindarThree = mindar;
  container = cont;
  keyLight = key;
  anchors = markerAnchors;
  callbacks = { onClaimed, onReleased, onFailed };
}

/**
 * Expone la sesión actual sin transferir su propiedad al consumidor.
 */
export function getActiveSession() {
  return activeSession;
}

/**
 * Indica si existe una pieza reservada o visible que impide otra invocación.
 */
export function isSessionBusy() {
  return activeSession !== null;
}

/**
 * Cierra el ciclo de vida y libera recursos al abandonar la experiencia.
 */
export function shutdown() {
  releaseActiveObject();
  disposePendingSessions();
  handTracking.deactivate();
  gestureControl.reset();
}

/**
 * Reserva sin espera una única pieza antes de comenzar cargas asíncronas.
 */
function claimSession(entry, source, anchor = null) {
  if (activeSession) return null;
  disposePendingSessions();
  const session = {
    entry,
    source,
    stage: getExperienceStage(source),
    anchor,
    model: null,
    contentInstance: null,
    decoupled: false,
    centered: false,
    centeringComplete: false,
    baseModelScale: 1,
    baseRotation: new THREE.Euler(),
    decoupleTimeoutId: null,
    sheetSavedTransform: null,
    contentAbortController: new AbortController(),
    contentDisposed: false,
    disposeTimeoutId: null
  };
  activeSession = session;
  setVoiceActiveObject(entry, source);
  if (source === 'geo') journeyProgress.record(entry.id, 'arrived');
  callbacks.onClaimed?.(entry, source);
  return session;
}

/**
 * Desvincula la pieza activa del agente de voz y de los controles.
 */
function releaseActiveObject(session = activeSession) {
  if (session && activeSession !== session) return;
  const released = activeSession;
  activeSession = null;
  released?.unsubscribeEnded?.();
  released?.contentAbortController?.abort();
  released?.contentInstance?.stopImmediate?.();
  if (released?.decoupleTimeoutId != null) clearTimeout(released.decoupleTimeoutId);
  disposeSessionContent(released);
  clearVoiceActiveObject();
  if (released) callbacks.onReleased?.(released.entry, released.source);
}

/**
 * Anima la intensidad principal para acompañar la entrada de la pieza.
 */
function rampKeyLight() {
  if (!keyLight) return;
  motion.tween(keyLight, {
    from: KEY_LIGHT_INTENSITY * KEY_LIGHT_RAMP_FROM,
    to: KEY_LIGHT_INTENSITY,
    dur: KEY_LIGHT_RAMP_MS,
    ease: 'out',
    apply: (value) => { keyLight.intensity = value; }
  });
}

function fadeShadowIn(instance) {
  const shadow = instance?.userData?.contactShadow;
  if (!shadow) return;
  motion.tween(shadow, {
    from: 0,
    to: 1,
    dur: SHADOW_FADE_MS,
    delay: SHADOW_FADE_DELAY_MS,
    ease: 'out',
    apply: (value) => { shadow.material.opacity = value; }
  });
}

function fadeShadowOut(instance) {
  const shadow = instance?.userData?.contactShadow;
  if (!shadow) return;
  motion.tween(shadow, {
    from: shadow.material.opacity,
    to: 0,
    dur: EXIT_DURATION_MS,
    ease: 'in',
    apply: (value) => { shadow.material.opacity = value; }
  });
}

/**
 * Presenta progresivamente el contenido preparado y su sombra.
 */
function materialize(session) {
  const targetScale = session.model.scale.x;
  session.model.scale.multiplyScalar(0.86);
  motion.pose(session.model, { scale: targetScale }, { tau: 0.09 });
  rampKeyLight();
  fadeShadowIn(session.model);
  feedback.modelReady();
}

/**
 * Inicia una sesión desde un marcador si ninguna otra se encuentra activa.
 */
export function handleTargetFound(entry, anchor) {
  const session = claimSession(entry, 'marker', anchor);
  if (!session) return false;
  console.log(`Marcador detectado: ${entry.name}`);
  ui.scan.found(entry, 'marker');
  void runClaimedSession(session);
  return true;
}

/**
 * Acepta la invocación geográfica solo si el gestor puede reservar la sesión.
 */
export function handleGeoInvoke(entry) {
  const session = claimSession(entry, 'geo', null);
  if (!session) return false;
  console.log(`Invocación Geo: ${entry.name}`);
  ui.scan.found(entry, 'geo');
  void runClaimedSession(session);
  return true;
}

/**
 * Carga el contenido y consolida la reserva si la petición sigue vigente.
 */
async function runClaimedSession(session) {
  let loaded;
  try {
    const signal = session.contentAbortController.signal;
    loaded = await withDeadline(() => loadContent(session.entry, session.source), {
      signal, onLateResult: resource => resource.release?.()
    });
    if (activeSession !== session) return;

    const content = await withDeadline(() => instantiateContent(session.entry, loaded, {
      source: session.source,
      cameraSpace: session.source === 'geo',
      camera,
      signal
    }), { signal, onLateResult: content => content.dispose?.() });
    if (activeSession !== session) {
      content.dispose?.();
      return;
    }

    session.contentInstance = content;
    session.model = content.object;

    if (session.source === 'marker') {
      session.anchor.group.add(session.model);
      materialize(session);
      beginPreparationToCenter(session, () => decoupleModelFromMarker(session));
      return;
    }

    placeGeoContent(session, content.bbox);
    camera.add(session.model);
    session.model.visible = true;
    materialize(session);
    beginPreparationToCenter(session, () => beginGeoCentering(session));
  } catch (err) {
    console.error(`No se pudo cargar/mostrar "${session.entry.name}" (${session.source}):`, err);
    if (activeSession !== session) return;
    callbacks.onFailed?.(session.entry, session.source, err);
    releaseActiveObject(session);
    ui.scan.toSearch();
    const key = session.source === 'geo' ? 'scan.errorLoadGeo' : 'scan.errorLoad';
    ui.scan.error(t(key, { name: ui.localizedName(session.entry) }));
  } finally {
    loaded?.release?.();
  }
}

/**
 * Secuencia el desacople del marcador y la colocación frente a la cámara.
 */
function beginPreparationToCenter(session, startCentering) {
  if (activeSession !== session) return;
  ui.scan.modelReady();
  session.decoupleTimeoutId = setTimeout(() => {
    if (activeSession !== session) return;
    session.decoupleTimeoutId = null;
    startCentering();
  }, DECOUPLE_DELAY_MS);
}

/**
 * Coloca el contenido geográfico en el espacio de la cámara.
 */
function beginGeoCentering(session) {
  if (activeSession !== session || session.decoupled || !session.model) return;
  session.decoupled = true;
  enterCameraSpace(session);
  ui.scan.decouple(CENTER_DELAY_MS + CENTER_ANIMATION_MS);
  setTimeout(() => centerModelOnCamera(session), CENTER_DELAY_MS);
}

/**
 * Responde a la pérdida visual del marcador según la fase de la sesión.
 */
export function handleTargetLost(entry, anchor) {
  const session = activeSession;
  if (!session || session.source !== 'marker') return;
  if (session.entry !== entry || session.anchor !== anchor || session.decoupled) return;

  if (session.decoupleTimeoutId !== null) {
    clearTimeout(session.decoupleTimeoutId);
    session.decoupleTimeoutId = null;
  }
  if (!session.model) {
    releaseActiveObject(session);
    ui.scan.toSearch();
    return;
  }
  decoupleModelFromMarker(session);
}

/**
 * Evita que los movimientos posteriores del marcador arrastren una pieza ya invocada.
 */
function decoupleModelFromMarker(session) {
  if (activeSession !== session || session.decoupled || !session.model || !session.anchor) return;
  session.decoupleTimeoutId = null;
  console.log(`Desacoplando "${session.entry.name}" del marcador...`);

  session.model.updateMatrixWorld(true);
  const worldMatrix = session.model.matrixWorld.clone();
  session.anchor.group.remove(session.model);
  camera.add(session.model);
  camera.updateMatrixWorld(true);
  const cameraInverse = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const localMatrix = new THREE.Matrix4().multiplyMatrices(cameraInverse, worldMatrix);
  localMatrix.decompose(session.model.position, session.model.quaternion, session.model.scale);
  session.decoupled = true;
  session.model.visible = true;

  enterCameraSpace(session);
  ui.scan.decouple(CENTER_DELAY_MS + CENTER_ANIMATION_MS);
  setTimeout(() => centerModelOnCamera(session), CENTER_DELAY_MS);
}

/**
 * Reparenta el contenido al sistema de coordenadas necesario para la interacción.
 */
function enterCameraSpace(session) {
  if (activeSession !== session || !session.model) return;
  setContactShadowFreeFloat(session.model, true);
  mindarThree?.controller?.stopProcessVideo?.();
  handTracking.activate(container, mindarThree.renderer.domElement);
}

/**
 * Posiciona y escala una pieza invocada desde GPS.
 */
function placeGeoContent(session, bbox) {
  const targetPosition = session.entry.centerPosition ?? CENTER_POSITION;
  session.model.position.copy(targetPosition).add(GEO_SPAWN_OFFSET);
  session.model.rotation.copy(session.entry.centerRotation ?? CENTER_ROTATION);
  session.model.scale.setScalar(scaleForViewFill(session.entry, bbox));
}

/**
 * Calcula una escala compatible con la proporción de pantalla deseada.
 */
function scaleForViewFill(entry, bbox) {
  if (!bbox || bbox.isEmpty?.()) return 1;
  const targetPosition = entry.centerPosition ?? CENTER_POSITION;
  const z = Math.abs(targetPosition.z);
  const visibleH = 2 * z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fill = entry.geo?.viewFill ?? GEO_VIEW_FILL;
  return (fill * visibleH) / maxDim;
}

/**
 * Alinea el contenido para que pueda observarse y manipularse delante de la cámara.
 */
function centerModelOnCamera(session) {
  if (activeSession !== session || session.centered || !session.model || !session.decoupled) return;
  session.centered = true;
  const targetPosition = session.entry.centerPosition ?? CENTER_POSITION;
  const targetRotation = session.entry.centerRotation ?? CENTER_ROTATION;
  const targetQuaternion = new THREE.Quaternion().setFromEuler(targetRotation);

  motion.pose(session.model, { position: targetPosition, quaternion: targetQuaternion }, {
    mode: 'glide',
    duration: CENTER_ANIMATION_MS,
    onArrive: () => {
      if (activeSession !== session) return;
      session.baseModelScale = session.model.scale.x;
      session.model.rotation.copy(targetRotation);
      session.baseRotation = targetRotation.clone();
      session.centeringComplete = true;
      ui.scan.hide();
      if (session.source === 'marker') journeyProgress.record(session.entry.id, 'discovered');
      ui.interaction.show(session.entry, {
        contentType: session.contentInstance?.type ?? 'model3d',
        stage: session.stage,
        mediaController: session.contentInstance?.controller ?? null
      });
      if (session.contentInstance?.type === 'video') {
        const controller = session.contentInstance.controller;
        if (session.source === 'geo') {
          session.unsubscribeEnded = controller?.onEnded?.(() => {
            if (activeSession === session) {
              journeyProgress.record(session.entry.id, 'completed');
            }
          });
        }
        controller?.onPlayState?.((playing) => {
          if (activeSession === session) ui.setMediaPlaying(Boolean(playing));
        });
        void controller?.play?.().then((playing) => {
          if (activeSession === session) ui.setMediaPlaying(Boolean(playing));
        });
      }
    }
  });
}

/**
 * Finaliza la sesión y devuelve al visitante al modo de búsqueda.
 */
export function resetToScanMode() {
  const session = activeSession;
  if (!session || !session.decoupled || !session.model) return;

  session.contentAbortController.abort();
  session.unsubscribeEnded?.();
  clearVoiceActiveObject();
  ui.interaction.hide();
  handTracking.deactivate();
  gestureControl.reset();

  const model = session.model;
  session.contentInstance?.stopImmediate?.();
  motion.cancelPose(model);
  fadeShadowOut(model);
  pendingDisposals.add(session);
  session.disposeTimeoutId = setTimeout(() => disposeSessionContent(session), EXIT_DURATION_MS + 250);
  motion.pose(model, { scale: model.scale.x * 0.55 }, {
    mode: 'exit',
    duration: EXIT_DURATION_MS,
    onArrive: () => disposeSessionContent(session)
  });

  if (session.anchor) {
    session.anchor.visible = false;
    session.anchor.group.visible = false;
  }
  for (const { anchor } of anchors) {
    anchor.visible = false;
    anchor.group.visible = false;
  }

  if (session.decoupleTimeoutId !== null) clearTimeout(session.decoupleTimeoutId);
  activeSession = null;
  callbacks.onReleased?.(session.entry, session.source);

  mindarThree?.controller?.processVideo?.(mindarThree.video);
  ui.scan.show();
}

/**
 * Pausa o reanuda el vídeo activo desde los controles de la ficha.
 */
export function toggleMediaPlayback() {
  const session = activeSession;
  const controller = session?.contentInstance?.controller;
  if (!controller?.togglePause) return;
  void controller.togglePause().then((playing) => {
    if (activeSession === session) ui.setMediaPlaying(Boolean(playing));
  });
}

/**
 * Solicita activar sonido únicamente sobre una pieza multimedia vigente.
 */
export function enableMediaAudio() {
  const session = activeSession;
  const controller = session?.contentInstance?.controller;
  if (!controller?.enableAudio) return;
  void controller.enableAudio().then((enabled) => {
    if (activeSession !== session || !enabled) return;
    handleVoiceState(getVoiceState());
    ui.setMediaAudioEnabled(true);
  }).catch((err) => {
    console.warn('No se pudo activar el audio del video:', err);
  });
}

/**
 * Coordina el audio conversacional con el estado del contenido de vídeo.
 */
export function handleVoiceState(state) {
  const session = activeSession;
  const controller = session?.contentInstance?.controller;
  if (!controller || session?.contentInstance?.type !== 'video' || !controller.isAudioEnabled?.()) return;
  if ([VoiceState.CONNECTING, VoiceState.LISTENING, VoiceState.PROCESSING, VoiceState.SPEAKING].includes(state)) {
    controller.pauseForVoice?.();
    ui.setMediaPlaying(false);
  } else if (state === VoiceState.IDLE && VIDEO_RESUME_AFTER_AI) {
    void controller.play?.().then((playing) => {
      if (activeSession === session) ui.setMediaPlaying(Boolean(playing));
    });
  }
}


/**
 * Inicia otra calibración de mano conservando la sesión según su estado.
 */
export async function recalibrate() {
  if (!mindarThree?.video || !handTracking.isReady()) return false;

  const session = activeSession;
  const modelWasVisible = session?.model?.visible ?? false;

  if (session?.model) session.model.visible = false;

  gestureControl.reset();

  await handTracking.runCalibration(mindarThree.video, container);

  if (session?.model && modelWasVisible) {
    const reappearScale = session.model.scale.x;
    session.model.scale.multiplyScalar(0.9);
    session.model.visible = true;
    motion.pose(session.model, { scale: reappearScale }, { tau: 0.09 });
  }
  ui.interaction.reshow();

  return true;
}


/**
 * Devuelve el objeto a una pose visible si fue desplazado por gestos.
 */
export function recenterModel() {
  const session = activeSession;
  if (!session?.model || !session.centeringComplete || session.sheetSavedTransform) return;

  const targetPosition = session.entry.centerPosition ?? CENTER_POSITION;
  const targetRotation = session.entry.centerRotation ?? CENTER_ROTATION;

  gestureControl.reset();

  motion.pose(
    session.model,
    { position: targetPosition, quaternion: new THREE.Quaternion().setFromEuler(targetRotation) },
    {
      mode: 'glide',
      duration: 600,
      onArrive: () => {
        if (activeSession !== session) return;
        session.model.rotation.copy(targetRotation);
        session.baseRotation = targetRotation.clone();
      }
    }
  );
}


/**
 * Reajusta posición y escala del objeto para mantenerlo visible con la ficha abierta.
 */
export function setSheetOpen(open) {
  const session = activeSession;
  if (!session?.model || !session.centeringComplete) return;

  if (open && !session.sheetSavedTransform) {
    session.sheetSavedTransform = {
      position: session.model.position.clone(),
      quaternion: session.model.quaternion.clone(),
      scale: session.model.scale.x
    };

    const sheetPosition = session.entry.sheetPosition ?? SHEET_OPEN_POSITION;
    const sheetRotation = session.entry.sheetRotation ?? SHEET_OPEN_ROTATION;
    const sheetScaleFactor = session.entry.sheetScaleFactor ?? SHEET_OPEN_SCALE_FACTOR;

    motion.pose(
      session.model,
      {
        position: sheetPosition,
        quaternion: new THREE.Quaternion().setFromEuler(sheetRotation),
        scale: session.baseModelScale * sheetScaleFactor
      },
      { tau: 0.11 }
    );
  } else if (!open && session.sheetSavedTransform) {
    const saved = session.sheetSavedTransform;
    session.sheetSavedTransform = null;
    motion.pose(session.model, saved, { tau: 0.11 });
  }
}
