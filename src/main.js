/**
 * Punto de entrada de WebAR. Conecta tema, catálogo, permisos, calibración, rastreo, sesiones, audio e
 * interfaz, y controla el orden de inicio y cierre.
 */


import { getRuntimeCatalog, isFieldTestEnabled } from './runtimeCatalog.js';
import { hasGeoEntries } from './catalogUtils.js';
import { validateMarkerCatalog, updateContactShadow } from './modelCache.js';
import { preloadContent } from './content.js';
import { createScene, createAnchors } from './sceneSetup.js';
import * as handTracking from './handTracking.js';
import * as gestureControl from './gestureControl.js';
import * as sessionManager from './sessionManager.js';
import * as motion from './motion.js';
import * as ui from './ui.js';
import { initVoiceAgent, startTalking, stopTalking, sendText, warmUpAudio, resumeAudio, getVoiceState, getVoiceErrorDetail, VoiceState, VoiceErrorDetail } from './voiceAgent.js';
import { watchCamera } from './cameraRecovery.js';
import { withinBudget } from './async.js';
import { applyTheme } from './theme.js';
import { initI18n } from './i18n.js';
import { configureFeedback, unlockAudio } from './feedback.js';
import { GEO_INVOKE_CONSECUTIVE_FIXES, GEO_EXIT_CONSECUTIVE_FIXES, GEO_JUMP_CONFIRM_FIXES } from './config.js';
import './style.css';


/**
 * Se configura la pantalla inicial sin solicitar aún acceso a cámara o micrófono. Los permisos se
 * activan desde la acción de comenzar.
 */
const museum = applyTheme();
const APP_CATALOG = getRuntimeCatalog();
const fieldTestEnabled = isFieldTestEnabled();
const geoEnabled = hasGeoEntries(APP_CATALOG);
const geoModulePromise = geoEnabled ? import('./geoTracker.js').catch(error => {
  console.warn('Geo no disponible; MindAR continúa normalmente:', error);
  return null;
}) : null;
let geo = null;
let runtime = null;
let geoBootBusy = true;
let geoPreloadId = null;
let fieldDebugSimulation = false;
let fieldDebugBusy = false;
const fieldTestEntry = APP_CATALOG.find((entry) => entry.geo) ?? APP_CATALOG.find((entry) => entry.id === 'objeto-1') ?? null;
configureFeedback({ haptics: museum.haptics, sound: museum.sound });
initI18n();
let catalogValidationError = null;
try {
  validateMarkerCatalog(APP_CATALOG);
} catch (error) {
  catalogValidationError = error;
  console.error('El arranque se ha bloqueado por errores del catálogo:', error);
}

ui.fieldDebug.init({
  enabled: fieldTestEnabled,
  entry: fieldTestEntry,
  geoEnabled,
  onSimulationChange: (enabled) => {
    fieldDebugSimulation = Boolean(enabled);
    geo?.setSimulationMode(fieldDebugSimulation);
  },
  onBusyChange: (busy) => {
    fieldDebugBusy = Boolean(busy);
    geo?.setDebugBusy(fieldDebugBusy);
  },
  onInject: injectGeoDebugFix,
  onPreset: runGeoDebugPreset
});

initVoiceAgent({
  onStateChange: (state, detail) => {
    ui.setVoiceState(state, detail);
    sessionManager.handleVoiceState(state);
  },
  onTranscript: ui.addTranscript,
  onHoldHint: ui.holdHintPtt
});

ui.initIntro(museum, { onStart: begin, geoEnabled });
if (catalogValidationError) ui.showBootError('generic');

ui.onAskQuestion((question) => {
  return sendText(question);
});

ui.onAsk(() => {
  const micBroken =
    getVoiceState() === VoiceState.ERROR &&
    (getVoiceErrorDetail() === VoiceErrorDetail.MIC_DENIED ||
      getVoiceErrorDetail() === VoiceErrorDetail.MIC_MISSING);
  if (micBroken) ui.revealKeyboard();
  else ui.coachPtt();
});

ui.onRecalibrate(() => {
  sessionManager.recalibrate();
});

ui.onSheetToggle((open) => {
  sessionManager.setSheetOpen(open);
});

ui.wireControls();
ui.onMediaToggle(() => sessionManager.toggleMediaPlayback());
ui.onMediaAudioEnable(() => sessionManager.enableMediaAudio());

ui.wireTalkButton({ onPressStart: startTalking, onPressEnd: stopTalking });

ui.onRescan(() => {
  sessionManager.resetToScanMode();
});

ui.onRecenter(() => {
  sessionManager.recenterModel();
});

ui.onGeoManual((entryId) => {
  if (!geo || !entryId || sessionManager.isSessionBusy()) return;
  const snapshot = geo.engine.getSnapshot();
  const piece = snapshot.pieces.find((p) => p.id === entryId);
  const recent = piece && piece.lastValidAt != null && performance.now() - piece.lastValidAt < 15000;
  if (!recent || piece.state !== 'near' || piece.distanceM > Math.min(piece.enterRadiusM, 35) ||
      piece.lastTrustedAccuracyM > 30 || !piece.insideAllowedZone) return;
  const entry = findEntry(entryId);
  if (!entry) return;
  const claimed = sessionManager.handleGeoInvoke(entry);
  if (!claimed) return;
  geo.engine.onSessionClaimed({ entryId, source: 'geo' });
});

ui.onGeoExit((entryId) => {
  if (!geo || !entryId) return;
  handleGeoEvents(geo.engine.dismiss(entryId));
});


let booting = false;
let runtimeGeneration = 0;

/**
 * Desactiva seguimiento y sesiones, y libera los recursos propios del ciclo actual.
 */
function stopExperience() {
  runtimeGeneration++;
  geoBootBusy = true;
  handTracking.dispose();
  if (!runtime) return;
  const current = runtime;
  runtime = null;
  geo?.stop();
  current.stopWatch?.();
  if (current.onVisibility) document.removeEventListener('visibilitychange', current.onVisibility);
  current.renderer.setAnimationLoop(null);
  current.mindarThree.controller?.stopProcessVideo?.();
  current.mindarThree.video?.srcObject?.getTracks().forEach(track => track.stop());
  sessionManager.shutdown();
  current.scene.userData.disposeEnvironment?.();
  current.renderer.dispose();
}
window.addEventListener('pagehide', event => { if (!event.persisted) stopExperience(); });

/**
 * Coordina permisos y preparación de subsistemas antes de entrar al escaneo.
 */
async function begin() {
  if (booting || catalogValidationError) return;
  booting = true;
  const generation = ++runtimeGeneration;
  const isCurrent = () => generation === runtimeGeneration;

  try {
    try { unlockAudio(); warmUpAudio(); }
    catch (audioError) { console.warn('Audio no disponible al iniciar:', audioError); }
    const container = document.querySelector('#app');
    const { mindarThree, camera, scene, renderer, keyLight } = await createScene(container);
    if (!isCurrent()) {
      scene.userData.disposeEnvironment?.();
      renderer.dispose();
      return;
    }
    runtime = { mindarThree, scene, renderer, stopWatch: null, onVisibility: null };

    const markerBindings = createAnchors(mindarThree, APP_CATALOG);
    sessionManager.init({
      camera,
      mindarThree,
      container,
      keyLight,
      anchors: markerBindings,
      onClaimed: (entry, source) => {
        ui.fieldDebug.setSession(sessionManager.getActiveSession());
        if (!geo) return;
        handleGeoEvents(geo.engine.onSessionClaimed({ entryId: entry.id, source }));
        geo.setBusy('session', true);
      },
      onFailed: (entry) => {
        geo?.engine.markFailed(entry.id, performance.now());
      },
      onReleased: () => {
        geo?.setBusy('session', false);
        ui.fieldDebug.setSession(null);
      }
    });

    markerBindings.forEach(({ entry, anchor }) => {
      anchor.onTargetFound = () => sessionManager.handleTargetFound(entry, anchor);
      anchor.onTargetLost = () => sessionManager.handleTargetLost(entry, anchor);
    });

    await mindarThree.start();
    if (!isCurrent()) {
      mindarThree.controller?.stopProcessVideo?.();
      mindarThree.video?.srcObject?.getTracks().forEach(track => track.stop());
      return;
    }
    mindarThree.controller.stopProcessVideo();
    ui.setBootStep('camera', 'done');

    if (geoModulePromise) {
      geoModulePromise.then((module) => {
        if (!module || !isCurrent() || !runtime) return;
        const { startGeoTracker } = module;
        geo = startGeoTracker({
          catalog: APP_CATALOG,
          debugEnabled: fieldTestEnabled,
          onEvents: handleGeoEvents,
          onStatus: (status) => {
            if (status === 'denied') ui.scan.geoPermissionDeniedOnce();
            if (status === 'unsupported') console.warn('Geolocalización no soportada; MindAR continúa normalmente.');
          },
          onDebug: (snapshot) => {
            ui.fieldDebug.update(snapshot);
            ui.fieldDebug.setSession(sessionManager.getActiveSession());
          }
        });
        geo.setBusy('boot', geoBootBusy);
        const currentSession = sessionManager.getActiveSession();
        if (currentSession) geo.engine.onSessionClaimed({
          entryId: currentSession.entry.id, source: currentSession.source
        });
        geo.setBusy('session', Boolean(currentSession));
        ui.fieldDebug.setReady(fieldTestEnabled);
        if (fieldDebugSimulation) geo.setSimulationMode(true);
        if (fieldDebugBusy) geo.setDebugBusy(true);
        ui.fieldDebug.update(geo.getDebugSnapshot());
      }).catch((err) => console.warn('Geo no disponible; MindAR continúa normalmente:', err));
    }

    runtime.stopWatch = watchCamera(mindarThree.video, {
      onRecovered: () => {
        if (runtime?.mindarThree !== mindarThree) return;
        const { video, controller } = mindarThree;
        const unchanged = video.videoWidth === controller.inputWidth && video.videoHeight === controller.inputHeight;
        const rotated = video.videoWidth === controller.inputHeight && video.videoHeight === controller.inputWidth;
        if (!unchanged && !rotated) {
          stopExperience();
          ui.showBootError('generic');
          return;
        }
        mindarThree.resize?.();
        handTracking.refreshLayout();
        restartImageTracking(mindarThree);
      },
      onFailure: () => {
        if (runtime?.mindarThree !== mindarThree) return;
        stopExperience();
        ui.showBootError('camera');
      }
    });
    runtime.onVisibility = () => {
      if (!document.hidden) resumeAudio();
    };
    document.addEventListener('visibilitychange', runtime.onVisibility);

    const handTrackingReady = handTracking.init({ onReady: markHandsReady })
      .then(() => { if (isCurrent()) ui.setBootStep('hands', 'done'); })
      .catch((err) => {
        if (!isCurrent()) return;
        console.error('No se pudo inicializar HandLandmarker:', err);
        ui.setBootStep('hands', 'warn');
      });

    const preloadReady = Promise.all(
      APP_CATALOG.filter((entry) => entry.preload).map((entry) =>
        preloadContent(entry).then(
          () => null,
          (err) => {
            console.error(`No se pudo precargar "${entry.name}":`, err);
            return entry;
          }
        )
      )
    ).then((failed) => {
      if (!isCurrent()) return;
      ui.setBootStep('catalog', failed.some(Boolean) ? 'warn' : 'done');
    });

    await handTrackingReady;
    if (!isCurrent()) return;
    markHandsReady();
    const preloaded = await withinBudget(preloadReady, 20000);
    if (!isCurrent()) return;
    if (!preloaded) ui.setBootStep('catalog', 'warn');

    if (handTracking.isReady()) {
      await handTracking.runCalibration(mindarThree.video, container);
      if (!isCurrent()) return;
    } else {
      console.warn('HandLandmarker no disponible: se omite la calibración.');
    }

    mindarThree.controller.processVideo(mindarThree.video);

    ui.hideIntro();
    ui.scan.show();
    geoBootBusy = false;
    geo?.setBusy('boot', false);

    let renderErrorStreak = 0;
    let lastRenderErrorLogAt = 0;
    renderer.setAnimationLoop(() => {
      try {
        const session = sessionManager.getActiveSession();

        motion.updatePoses();

        const sheetOpen = ui.isSheetOpen();
        const modelPosing = motion.isPosing(session?.model);

        const handResults = handTracking.detect(mindarThree.video);
        if (!sheetOpen) {
          gestureControl.updateVelocity(handResults, session);
          if (!modelPosing) gestureControl.applyMotion(session);
        }

        session?.contentInstance?.controller?.update?.();

        if (session?.model) updateContactShadow(session.model);

        ui.updateObjectOverlay(session, camera);
        renderer.render(scene, camera);
        renderErrorStreak = 0;
      } catch (loopError) {
        renderErrorStreak += 1;
        const current = performance.now();
        if (current - lastRenderErrorLogAt >= 5000 || renderErrorStreak === 1) {
          console.error('Error en el loop de render:', loopError);
          lastRenderErrorLogAt = current;
        }
        if (renderErrorStreak >= 60) {
          stopExperience();
          ui.showBootError('generic');
        }
      }
    });

    console.log('WebAR iniciado correctamente', fieldTestEnabled ? '[FIELD TEST]' : '');
  } catch (error) {
    if (!isCurrent()) return;
    console.error('Error iniciando WebAR:', error);
    stopExperience();
    const isCamera = error?.name === 'NotAllowedError' || error?.name === 'NotFoundError';
    ui.showBootError(isCamera ? 'camera' : 'generic');
  }
}


/**
 * Introduce una lectura GPS simulada en el sistema de diagnóstico de campo.
 */
function injectGeoDebugFix({ latitude, longitude, accuracy = 10, repeats = 1 } = {}) {
  if (!fieldTestEnabled || !geo) return false;
  if (![latitude, longitude, accuracy].every(Number.isFinite)) return false;
  geo.setSimulationMode(true);
  ui.fieldDebug.setSimulationMode(true);
  const count = Math.max(1, Math.min(5, Math.round(repeats)));
  let ok = true;
  for (let i = 0; i < count; i += 1) ok = geo.injectMock(latitude, longitude, accuracy) && ok;
  ui.fieldDebug.update(geo.getDebugSnapshot());
  return ok;
}

/**
 * Calcula un punto de prueba al norte de una referencia real sin alterar el catálogo.
 */
function coordinateNorthAtDistance(entry, distanceM) {
  if (!entry?.geo || !Number.isFinite(distanceM)) return null;
  return {
    latitude: entry.geo.latitude + distanceM / 111320,
    longitude: entry.geo.longitude
  };
}

/**
 * Ejecuta un escenario geográfico reproducible para comprobar transiciones.
 */
function runGeoDebugPreset({ preset, accuracy = 10 } = {}) {
  if (!fieldTestEnabled || !geo || !fieldTestEntry?.geo) return false;
  const g = fieldTestEntry.geo;
  let distanceM;
  let repeats = 1;
  if (preset === 'near') {
    distanceM = g.invokeRadiusM + Math.max(1, (g.enterRadiusM - g.invokeRadiusM) * 0.5);
  } else if (preset === 'invoke') {
    distanceM = Math.max(0.5, g.invokeRadiusM * 0.5);
    repeats = Math.min(5, GEO_INVOKE_CONSECUTIVE_FIXES + GEO_JUMP_CONFIRM_FIXES);
  } else if (preset === 'exit') {
    distanceM = g.exitRadiusM + Math.max(5, g.exitRadiusM * 0.15);
    repeats = Math.min(5, GEO_EXIT_CONSECUTIVE_FIXES + GEO_JUMP_CONFIRM_FIXES);
  } else {
    return false;
  }
  const point = coordinateNorthAtDistance(fieldTestEntry, distanceM);
  return injectGeoDebugFix({ ...point, accuracy, repeats });
}

/**
 * Recupera una pieza del catálogo vigente por su identificador.
 */
function findEntry(id) {
  return APP_CATALOG.find((entry) => entry.id === id) ?? null;
}

/**
 * Traduce los eventos de proximidad a mensajes y cambios en la sesión de la interfaz.
 */
function handleGeoEvents(events) {
  for (const event of events ?? []) {
    if (event.type === 'near') {
      if (sessionManager.isSessionBusy()) continue;
      const entry = findEntry(event.id);
      if (!entry) continue;
      ui.scan.geoNear({ entry, distanceM: event.distanceM, canInvokeAccuracy: event.canInvokeAccuracy && event.canInvokeConfidence,
        canManual: event.accuracyM <= 30 && event.rawDistanceM <= 35 &&
        (geo?.engine.getSnapshot().pieces.find(p => p.id === event.id)?.insideAllowedZone ?? false) && !(event.canInvokeAccuracy && event.canInvokeConfidence) });
      if (geoPreloadId !== entry.id) {
        geoPreloadId = entry.id;
        preloadContent(entry, 'geo').catch((err) => console.warn(`No se pudo precargar "${entry.name}" por Geo:`, err));
      }
    } else if (event.type === 'far') {
      geoPreloadId = null;
      if (!sessionManager.isSessionBusy()) ui.scan.toSearch();
    } else if (event.type === 'invoke') {
      const entry = findEntry(event.id);
      if (!entry) continue;
      const claimed = sessionManager.handleGeoInvoke(entry);
      if (!claimed) {
        const active = sessionManager.getActiveSession();
        if (active) geo?.engine.onSessionClaimed({ entryId: active.entry.id, source: active.source });
        else geo?.engine.rollbackInvoke(event.id);
      }
    }
  }
}

/**
 * Refleja en la experiencia que la detección de manos quedó preparada.
 */
function markHandsReady() {
  ui.setRecalibrateAvailable(handTracking.isReady());
}

/**
 * Reanuda el seguimiento de marcadores tras volver de contenido geográfico.
 */
function restartImageTracking(mindarThree) {
  const generation = runtimeGeneration;
  const scanning = () =>
    generation === runtimeGeneration &&
    !geoBootBusy &&
    !ui.isInteractionVisible() && !sessionManager.getActiveSession()?.decoupled;
  if (!scanning()) return;

  mindarThree.controller.stopProcessVideo();
  setTimeout(() => {
    if (scanning()) mindarThree.controller.processVideo(mindarThree.video);
  }, 200);
}
