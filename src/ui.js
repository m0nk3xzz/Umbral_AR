/**
 * Único punto de coordinación de los elementos de la interfaz. Presenta introducción, calibración,
 * escaneo e interacción, y comunica las acciones del visitante a los controladores.
 */


import * as THREE from 'three';
import { t, getLang, toggleLang } from './i18n.js';
import { VoiceState, VoiceErrorDetail, getVoiceErrorDetail } from './voiceAgent.js';
import { feedback } from './feedback.js';
import * as motion from './motion.js';
import { getStageMetadata } from './catalogUtils.js';
import {
  SCAN_HELP_DELAY_MS,
  UI_IDLE_DIM_MS,
  PTT_COACH_MS,
  RESCAN_CONFIRM_MS,
  RECENTER_SLIDE_X,
  RECENTER_SLIDE_Y,
  COMPACT_CONTAINER_WIDTH_PX
} from './config.js';

const $ = (sel) => document.querySelector(sel);

export const elements = {
  intro: $('#s-intro'),
  introHome: $('#intro-home'),
  introLoading: $('#intro-loading'),
  introError: $('#intro-error'),
  introPrivacy: $('#intro-privacy'),
  errorIcon: $('#intro-error .err-ico'),
  errorTitle: $('#error-title'),
  errorBody: $('#error-body'),
  errorRetry: $('#error-retry'),
  errorHowto: $('#error-howto'),
  errorHowtoText: $('#error-howto-text'),
  startBtn: $('#start-btn'),
  langBtn: $('#lang-btn'),
  langLabel: $('#lang-label'),
  museumMark: $('#museum-mark'),
  museumName: $('#museum-name'),
  bootRingWrap: $('#intro-loading .ring-big'),
  bootRing: $('#boot-ring'),
  bootPercent: $('#boot-percent'),
  bootNote: $('#boot-note'),
  checkCamera: $('#check-camera'),
  checkHands: $('#check-hands'),
  checkCatalog: $('#check-catalog'),

  calibrateLayer: $('#s-calibrate'),
  calRing: $('#cal-ring'),
  calHandFist: $('#cal-hand-fist'),
  calHandOpen: $('#cal-hand-open'),
  calOk: $('#cal-ok'),
  calPillOk: $('#cal-pill-ok'),
  calPillWarn: $('#cal-pill-warn'),
  calHint: $('#cal-hint'),
  calSeg1: $('#cal-seg1'),
  calSeg2: $('#cal-seg2'),
  calTitle: $('#cal-title'),
  calHelp: $('#cal-help'),
  calStartBtn: $('#calibration-start-btn'),
  calSkipBtn: $('#calibration-skip-btn'),
  calSheet: $('#s-calibrate .sheet-bottom'),

  scanLayer: $('#s-scan'),
  scanSearch: $('#scan-block-search'),
  scanHelp: $('#scan-help'),
  scanGeo: $('#scan-block-geo'),
  geoPieceName: $('#geo-piece-name'),
  geoPieceSummary: $('#geo-piece-summary'),
  geoDistance: $('#geo-distance'),
  geoRefining: $('#geo-refining'),
  geoExitBtn: $('#geo-exit-btn'),
  geoManualBtn: $('#geo-manual-btn'),
  geoDenied: $('#geo-denied'),
  geoDeniedClose: $('#geo-denied-close'),
  scanLock: $('#scan-block-lock'),
  scanPieceName: $('#scan-piece-name'),
  scanBar: $('#scan-bar'),
  scanDecouple: $('#scan-block-decouple'),
  scanRing: $('#decouple-ring-prog'),
  scanError: $('#scan-error'),
  scanErrorText: $('#scan-error-text'),
  scanErrorRetry: $('#scan-error-retry'),
  scanHelpBtn: $('#scan-help-btn'),
  scanBottom: $('#s-scan .bottom3'),

  geoDebug: $('#geo-debug'),
  geoDebugBody: $('#geo-debug-body'),
  geoDebugCollapse: $('#geo-debug-collapse'),
  geoDebugTracker: $('#geo-debug-tracker'),
  geoDebugEngine: $('#geo-debug-engine'),
  geoDebugSession: $('#geo-debug-session'),
  geoDebugTarget: $('#geo-debug-target'),
  geoDebugRadii: $('#geo-debug-radii'),
  geoDebugSim: $('#geo-debug-sim'),
  geoDebugBusy: $('#geo-debug-busy'),
  geoDebugLat: $('#geo-debug-lat'),
  geoDebugLng: $('#geo-debug-lng'),
  geoDebugAccuracy: $('#geo-debug-accuracy'),
  geoDebugRepeats: $('#geo-debug-repeats'),
  geoDebugInject: $('#geo-debug-inject'),
  geoDebugLastFix: $('#geo-debug-last-fix'),
  geoDebugLastRawFix: $('#geo-debug-last-raw-fix'),
  geoDebugFixStats: $('#geo-debug-fix-stats'),
  geoDebugAccuracyStats: $('#geo-debug-accuracy-stats'),
  geoDebugIntervalStats: $('#geo-debug-interval-stats'),
  geoDebugRejectStats: $('#geo-debug-reject-stats'),
  geoDebugPieces: $('#geo-debug-pieces'),
  geoDebugPresetButtons: [...document.querySelectorAll('[data-geo-preset]')],

  interactLayer: $('#s-interact'),
  objOverlay: $('#obj-overlay'),
  scaleChip: $('#scale-chip'),
  pieceName: $('#piece-name'),
  pieceInv: $('#piece-inv'),
  titleChip: $('.title-chip'),
  mediaControls: $('#media-controls'),
  mediaBtn: $('#media-btn'),
  mediaSoundBtn: $('#media-sound-btn'),
  rail: $('#s-interact .rail'),
  railDot: $('#s-interact .rail .hd'),
  rescanBtn: $('#rescan-btn'),
  rescanConfirm: $('#rescan-confirm'),
  rescanConfirmYes: $('#rescan-confirm-yes'),
  rescanConfirmNo: $('#rescan-confirm-no'),
  recenterBtn: $('#recenter-btn'),
  gestureHelpBtn: $('#gesture-help-btn'),
  helpPanel: $('#help-panel'),
  recalibrateBtn: $('#recalibrate-btn'),
  chips: $('#suggest-chips'),
  caption: $('#caption'),
  captionYou: $('#caption-you'),
  captionAi: $('#caption-ai'),
  voiceError: $('#voice-error'),
  voiceErrorText: $('#voice-error-text'),
  voiceErrorHowto: $('#voice-error-howto'),
  voiceErrorHowtoText: $('#voice-error-howto-text'),
  btnKeyboard: $('#btn-keyboard'),
  kbBar: $('#kb-bar'),
  kbInput: $('#kb-input'),
  kbSend: $('#kb-send'),
  talkBtn: $('#talk-btn'),
  pttIdle: $('#ptt-idle'),
  pttWave: $('#ptt-wave'),
  pttSpin: $('#ptt-spin'),
  pttLabel: $('#ptt-label'),
  sheet: $('#piece-sheet'),
  sheetTitle: $('#sheet-title'),
  sheetSummary: $('#sheet-summary'),
  entryContext: $('#entry-context'),
  visitInvite: $('#visit-invite'),
  sheetClose: $('#sheet-close'),
  sheetAsk: $('#sheet-ask'),
  btnSheet: $('#btn-sheet'),
  sheetFields: {
    culture: $('#sheet-culture'),
    period: $('#sheet-period'),
    material: $('#sheet-material'),
    origin: $('#sheet-origin'),
    inventoryNumber: $('#sheet-inventory')
  }
};

let activeEntry = null;
let activeSource = 'marker';
let onRecalibrateCallback = null;
let onSheetToggleCallback = null;
let onAskCallback = null;
let onRescanCallback = null;
let onRecenterCallback = null;
let onGeoExitCallback = null;
let geoDeniedShown = false;
let currentGeoEntryId = null;
let activeContentType = 'model3d';
let mediaPlaying = false;
let mediaAudioEnabled = false;
let onMediaToggleCallback = null;
let onMediaAudioCallback = null;
let fieldDebugEntry = null;
let fieldDebugWired = false;
let fieldDebugCallbacks = {
  onSimulationChange: null,
  onBusyChange: null,
  onInject: null,
  onPreset: null
};


const LAYERS = ['intro', 'calibrateLayer', 'scanLayer', 'interactLayer'];


export function isSheetOpen() {
  return elements.interactLayer.dataset.sheet === 'open';
}

export function isInteractionVisible() {
  return motion.isVisible(elements.interactLayer);
}

export function fadeOut(el) { return motion.conceal(el, { rise: 0, dur: 220 }); }
export function fadeIn(el) { return motion.reveal(el, { rise: 0, dur: 220 }); }
function setSoft(el, visible) {
  if (visible) motion.reveal(el, { rise: 6 });
  else motion.conceal(el, { rise: 6 });
}

/**
 * Selecciona una de las pantallas principales sin superponer estados incompatibles.
 */
function showLayer(key) {
  LAYERS.forEach((layerKey) => {
/**
 * Referencias a nodos reutilizados por las distintas pantallas; se evita buscar el mismo elemento
 * repetidamente.
 */
    const el = elements[layerKey];
    if (layerKey === key) fadeIn(el);
    else fadeOut(el);
  });
}


/**
 * Presenta la identidad de la experiencia y conecta la acción que inicia permisos y carga.
 */
export function initIntro(museum, { onStart, geoEnabled = false } = {}) {
  document.querySelectorAll('[data-geo-copy]').forEach(el => setSoft(el, geoEnabled));
  if (!geoEnabled) {
    const subtitle = document.querySelector('.hero-sub');
    subtitle.dataset.i18n = 'intro.subtitleScan';
    subtitle.textContent = t('intro.subtitleScan');
  }
  if (geoEnabled) {
    elements.introPrivacy.dataset.i18n = 'intro.privacyGeo';
    elements.introPrivacy.textContent = t('intro.privacyGeo');
  }
  elements.museumMark.textContent = museum.mark;
  elements.museumName.textContent = museum.name;
  elements.langLabel.textContent = getLang().toUpperCase();

  elements.langBtn.addEventListener('click', () => {
    const view = [elements.introHome, elements.introLoading, elements.introError]
      .find((v) => motion.isVisible(v));
    motion.flow(view ?? elements.introHome, () => {
      toggleLang();
      refreshDynamicTexts();
      motion.swapText(elements.langLabel, getLang().toUpperCase());
    });
  });

  const privacy = elements.introPrivacy.closest('details');
  if (privacy) {
    const summary = privacy.querySelector('summary');
    summary.addEventListener('click', event => {
      event.preventDefault();
      const open = !privacy.open || !motion.isVisible(elements.introPrivacy);
      if (open) {
        if (!privacy.open) {
          elements.introPrivacy.hidden = true;
          privacy.open = true;
        }
        motion.reveal(elements.introPrivacy, { rise: 0 });
      } else {
        const animation = motion.conceal(elements.introPrivacy, { rise: 0 });
        animation?.addEventListener('finish', () => {
          if (!motion.isVisible(elements.introPrivacy)) privacy.open = false;
        }, { once: true });
      }
    });
  }

  elements.errorHowto.addEventListener('click', () => {
    const text = elements.errorHowtoText;
    if (!motion.isVisible(text)) motion.reveal(text, { rise: 6 });
    else motion.conceal(text);
  });
  elements.errorRetry.addEventListener('click', () => window.location.reload());

  elements.startBtn.addEventListener('click', () => {
    fadeOut(elements.introHome);
    fadeIn(elements.introLoading);
    setBootStep('camera', 'doing');
    onStart?.();
  });
}

const bootSteps = ['camera', 'hands', 'catalog'];
const bootState = { camera: 'pending', hands: 'pending', catalog: 'pending' };

/**
 * Actualiza el progreso de preparación de subsistemas mostrado al visitante.
 */
export function setBootStep(step, state) {
  bootState[step] = state;
  const el = { camera: elements.checkCamera, hands: elements.checkHands, catalog: elements.checkCatalog }[step];
  el.classList.remove('done', 'doing', 'warn');
  if (state !== 'pending') el.classList.add(state);

  const resolved = bootSteps.filter((s) => bootState[s] === 'done' || bootState[s] === 'warn').length;
  const percent = Math.round((resolved / bootSteps.length) * 100);
  motion.countTo(elements.bootPercent, percent, { dur: 380 });
  elements.bootRing.style.strokeDashoffset = String(100 - percent);

  if (state === 'warn') {
    motion.swapText(elements.bootNote, t(`loading.${step}Warn`), { durOut: 140, durIn: 200 });
  }
}

function flashBootRing() {
  const loading = elements.introLoading;
  if (!motion.isVisible(loading)) return;
  motion.pulse(elements.bootRingWrap, { scale: 1.07, dur: 520 });
}

/**
 * Retira la portada cuando las capacidades necesarias están preparadas.
 */
export function hideIntro() {
  flashBootRing();
  showLayer(null);
}

/**
 * Traduce un fallo de arranque a un mensaje comprensible y una ruta de salida.
 */
export function showBootError(kind = 'camera') {
  showLayer('intro');
  fadeOut(elements.introHome);
  fadeOut(elements.introLoading);
  fadeIn(elements.introError);
  elements.errorTitle.textContent = t(`error.${kind}.title`);
  elements.errorBody.textContent = t(`error.${kind}.body`);
  feedback.error();
  setTimeout(() => motion.nudge(elements.errorIcon), 320);
}


let lastCalibrationHandState = null;
let lastCalibrationProgress = -1;
export const calibration = {
  show() {
    flashBootRing();
    showLayer('calibrateLayer');
    this.setStep('ready');
    this.setProgress(0);
    this.setHandDetected(null);
    motion.conceal(elements.calHint);
  },

  hide() {
    fadeOut(elements.calibrateLayer);
  },

  setStep(step) {
    lastCalibrationHandState = null;
    const finished = ['done', 'skipped', 'partial', 'failed'].includes(step);
    const showOk = step === 'done' || step === 'skipped';

    elements.calibrateLayer.dataset.step = step;
    setSoft(elements.calOk, showOk);
    setSoft(elements.calStartBtn, step === 'ready');
    setSoft(elements.calSkipBtn, !finished);
    setSoft(elements.calPillOk, false);
    setSoft(elements.calPillWarn, false);
    motion.conceal(elements.calHint, { rise: 8 });

    elements.calSeg1.classList.toggle('current', step === 'fist');
    elements.calSeg1.classList.toggle('done', step === 'open' || finished);
    elements.calSeg2.classList.toggle('current', step === 'open');
    elements.calSeg2.classList.toggle('done', finished);

    motion.swapTextRise(elements.calTitle, t(`cal.${step}.title`));
    motion.swapTextRise(elements.calHelp, t(`cal.${step}.help`), { delay: 80 });

    if (step === 'done') feedback.calibrationDone();

    if (step === 'failed') {
      motion.nudge(elements.calTitle);
      feedback.error();
    }
  },

  setProgress(value) {
    const percent = Math.round(value * 100);
    if (percent === lastCalibrationProgress) return;
    lastCalibrationProgress = percent;
    elements.calRing.style.strokeDashoffset = String(100 - percent);
  },

  setHandDetected(detected, showHint = false) {
    const state = `${detected}:${showHint}`;
    if (state === lastCalibrationHandState) return;
    lastCalibrationHandState = state;
    if (detected === null) {
      setSoft(elements.calPillOk, false);
      setSoft(elements.calPillWarn, false);
      elements.calibrateLayer.dataset.nohand = 'false';
      motion.conceal(elements.calHint, { rise: 8 });
      return;
    }
    setSoft(elements.calPillOk, detected);
    setSoft(elements.calPillWarn, !detected);
    elements.calibrateLayer.dataset.nohand = String(!detected);
    if (detected || !showHint) motion.conceal(elements.calHint);
    else motion.reveal(elements.calHint, { rise: 8 });
  },

  awaitStartOrSkip(onSkip) {
    let waitingForStart = true;
    let onStart;
    let onSkipClick;
    const choice = new Promise((resolve) => {
      onStart = () => {
        if (!waitingForStart) return;
        waitingForStart = false;
        elements.calStartBtn.removeEventListener('click', onStart);
        resolve('start');
      };
      onSkipClick = () => {
        onSkip?.();
        if (!waitingForStart) return;
        waitingForStart = false;
        elements.calStartBtn.removeEventListener('click', onStart);
        resolve('skip');
      };
      elements.calStartBtn.addEventListener('click', onStart);
      elements.calSkipBtn.addEventListener('click', onSkipClick);
    });

    return {
      choice,
      cancel: onSkipClick,
      dispose() {
        elements.calStartBtn.removeEventListener('click', onStart);
        elements.calSkipBtn.removeEventListener('click', onSkipClick);
      }
    };
  }
};


let scanHelpTimer = null;
let decouplePulseTimer = null;

/**
 * Elige el panel apropiado mientras se busca un marcador o una ubicación.
 */
function showScanBlock(block) {
  const blocks = { search: elements.scanSearch, lock: elements.scanLock,
    decouple: elements.scanDecouple, geo: elements.scanGeo, error: elements.scanError };
  for (const [key, el] of Object.entries(blocks)) setSoft(el, key === block);
  motion.conceal(elements.scanHelp);
}

function isScanErrorVisible() {
  return elements.scanLayer.dataset.state === 'error';
}

export const scan = {
  show() {
    showLayer('scanLayer');
    this.toSearch();
  },

  hide() {
    clearTimeout(scanHelpTimer);
    clearTimeout(decouplePulseTimer);
    fadeOut(elements.scanLayer);
  },

  toSearch() {
    clearTimeout(decouplePulseTimer);
    elements.scanLayer.dataset.state = 'search';
    elements.scanLayer.dataset.source = '';
    currentGeoEntryId = null;
    elements.scanBar.classList.remove('done');
    elements.scanBar.classList.add('indeterminate');
    showScanBlock('search');

    clearTimeout(scanHelpTimer);
    scanHelpTimer = setTimeout(() => {
      if (elements.scanLayer.dataset.state === 'search' && !motion.isVisible(elements.geoDenied)) {
        motion.reveal(elements.scanHelp, { rise: 8 });
      }
    }, SCAN_HELP_DELAY_MS);
  },

  found(entry, source = 'marker') {
    clearTimeout(scanHelpTimer);
    clearTimeout(decouplePulseTimer);
    feedback.targetFound();
    elements.scanLayer.dataset.state = 'lock';
    elements.scanLayer.dataset.source = source;
    showScanBlock('lock');
    motion.swapText(elements.scanPieceName, localizedName(entry));
    elements.scanBar.classList.remove('done');
    elements.scanBar.classList.add('indeterminate');
  },

  modelReady() {
    if (isScanErrorVisible()) return;
    elements.scanBar.classList.remove('indeterminate');
    elements.scanBar.classList.add('done');
  },

  decouple(durationMs) {
    elements.scanLayer.dataset.state = 'decouple';
    showScanBlock('decouple');

    const ring = elements.scanRing;
    ring.getAnimations().forEach(animation => animation.cancel());
    ring.style.strokeDashoffset = '0';
    ring.animate([{ strokeDashoffset: '100' }, { strokeDashoffset: '0' }], {
      duration: durationMs, easing: 'linear'
    });

    clearTimeout(decouplePulseTimer);
    decouplePulseTimer = setTimeout(() => {
      if (elements.scanLayer.dataset.state !== 'decouple') return;
      motion.pulse(ring.closest('.decouple-ring'), { scale: 1.12, dur: 420 });
    }, durationMs);
  },

  geoNear({ entry, distanceM, canInvokeAccuracy = true, canManual = false }) {
    clearTimeout(scanHelpTimer);
    clearTimeout(decouplePulseTimer);
    const changedEntry = currentGeoEntryId !== entry.id || !motion.isVisible(elements.scanGeo);
    elements.scanLayer.dataset.state = 'geo';
    elements.scanLayer.dataset.source = 'geo';
    if (changedEntry) {
      currentGeoEntryId = entry.id;
      showScanBlock('geo');
      motion.swapText(elements.geoPieceName, localizedName(entry));
      motion.swapText(elements.geoPieceSummary, localizedSummary(entry, 'geo'));
    }
    const distanceText = distanceM <= 10 ? t('geo.distanceNear') : t('geo.distance', { m: distanceM });
    if (elements.geoDistance.textContent !== distanceText) motion.swapText(elements.geoDistance, distanceText);
    setSoft(elements.geoRefining, !canInvokeAccuracy);
    setSoft(elements.geoManualBtn, canManual);
  },

  geoPermissionDeniedOnce() {
    if (geoDeniedShown) return;
    geoDeniedShown = true;
    motion.conceal(elements.scanHelp);
    motion.reveal(elements.geoDenied, { rise: 8 });
  },

  getGeoCandidateId() { return currentGeoEntryId; },

  error(message) {
    elements.scanLayer.dataset.state = 'error';
    elements.scanErrorText.textContent = message;
    feedback.error();
    showScanBlock('error');
    motion.reveal(elements.scanError, { rise: 10 });
    setTimeout(() => motion.nudge(elements.scanError), 140);
  }
};

elements.scanErrorRetry.addEventListener('click', () => {
  scan.toSearch();
});

elements.scanHelpBtn.addEventListener('click', () => {
  if (!motion.isVisible(elements.scanHelp)) { motion.conceal(elements.geoDenied); motion.reveal(elements.scanHelp, { rise: 8 }); }
  else motion.conceal(elements.scanHelp);
});

let onGeoManualCallback = null;
/**
 * Conecta la activación explícita de una pieza cercana con el controlador geográfico.
 */
export function onGeoManual(callback) { onGeoManualCallback = callback; }
elements.geoManualBtn.addEventListener('click', () => onGeoManualCallback?.(currentGeoEntryId));
elements.geoExitBtn.addEventListener('click', () => {
  onGeoExitCallback?.(currentGeoEntryId);
});
elements.geoDeniedClose.addEventListener('click', () => motion.conceal(elements.geoDenied));


function fieldDebugNumber(input, fallback = null) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Convierte distancias de diagnóstico en una representación legible.
 */
function formatDebugDistance(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} m` : '∞';
}

export const fieldDebug = {
  init({
    enabled = false,
    entry = null,
    geoEnabled = false,
    onSimulationChange = null,
    onBusyChange = null,
    onInject = null,
    onPreset = null
  } = {}) {
    if (!enabled || !elements.geoDebug) return;
    fieldDebugEntry = entry;
    fieldDebugCallbacks = { onSimulationChange, onBusyChange, onInject, onPreset };
    motion.reveal(elements.geoDebug);

    if (entry?.geo) {
      elements.geoDebugTarget.textContent = `${entry.id} · ${entry.geo.latitude.toFixed(6)}, ${entry.geo.longitude.toFixed(6)}`;
      elements.geoDebugRadii.textContent = `enter ${entry.geo.enterRadiusM} m · invoke ${entry.geo.invokeRadiusM} m · exit ${entry.geo.exitRadiusM} m`;
      elements.geoDebugLat.value = entry.geo.latitude.toFixed(6);
      elements.geoDebugLng.value = entry.geo.longitude.toFixed(6);
      elements.geoDebugAccuracy.value = String(Math.min(10, entry.geo.maxInvokeAccuracyM ?? 10));
    } else {
      elements.geoDebugTarget.textContent = t('debug.geo.notConfigured');
      elements.geoDebugRadii.textContent = t('debug.geo.coordsRequired');
    }
    elements.geoDebugTracker.textContent = geoEnabled ? 'starting' : 'disabled';
    this.setReady(false);

    if (fieldDebugWired) return;
    fieldDebugWired = true;

    elements.geoDebugCollapse.addEventListener('click', () => {
      const collapsed = elements.geoDebug.classList.toggle('collapsed');
      setSoft(elements.geoDebugBody, !collapsed);
      elements.geoDebugCollapse.textContent = collapsed ? '+' : '−';
      elements.geoDebugCollapse.setAttribute('aria-expanded', String(!collapsed));
    });
    elements.geoDebugSim.addEventListener('change', () => {
      fieldDebugCallbacks.onSimulationChange?.(elements.geoDebugSim.checked);
    });
    elements.geoDebugBusy.addEventListener('change', () => {
      fieldDebugCallbacks.onBusyChange?.(elements.geoDebugBusy.checked);
    });
    elements.geoDebugInject.addEventListener('click', () => {
      fieldDebugCallbacks.onInject?.({
        latitude: fieldDebugNumber(elements.geoDebugLat),
        longitude: fieldDebugNumber(elements.geoDebugLng),
        accuracy: fieldDebugNumber(elements.geoDebugAccuracy, 10),
        repeats: Math.max(1, Math.min(5, Math.round(fieldDebugNumber(elements.geoDebugRepeats, 1))))
      });
    });
    elements.geoDebugPresetButtons.forEach((button) => {
      button.addEventListener('click', () => {
        fieldDebugCallbacks.onPreset?.({
          preset: button.dataset.geoPreset,
          accuracy: fieldDebugNumber(elements.geoDebugAccuracy, 10)
        });
      });
    });
  },

  setReady(ready) {
    if (!elements.geoDebug || elements.geoDebug.hidden) return;
    const disabled = !ready;
    for (const control of [
      elements.geoDebugSim, elements.geoDebugBusy, elements.geoDebugLat,
      elements.geoDebugLng, elements.geoDebugAccuracy, elements.geoDebugRepeats,
      elements.geoDebugInject, ...elements.geoDebugPresetButtons
    ]) control.disabled = disabled;
  },

  setSimulationMode(enabled) {
    if (!elements.geoDebug || elements.geoDebug.hidden) return;
    elements.geoDebugSim.checked = Boolean(enabled);
  },

  update(snapshot) {
    if (!elements.geoDebug || elements.geoDebug.hidden || !snapshot) return;
    elements.geoDebugTracker.textContent = `${snapshot.trackerStatus}${snapshot.watchActive ? ' · watch' : ''}${snapshot.simulationMode ? ' · mock' : ''}`;
    elements.geoDebugSim.checked = Boolean(snapshot.simulationMode);

    const engine = snapshot.engine;
    const targetPiece = engine?.pieces?.find((piece) => piece.id === fieldDebugEntry?.id) ?? engine?.pieces?.[0];
    const busySuffix = engine?.busy ? ` · busy:${engine.busyReasons.join('+')}` : '';
    elements.geoDebugEngine.textContent = targetPiece
      ? `${targetPiece.state} · ${formatDebugDistance(targetPiece.distanceM)}${engine.candidateId === targetPiece.id ? ' · candidate' : ''}${busySuffix}`
      : engine?.busy ? `busy (${engine.busyReasons.join(', ')})` : 'idle';
    elements.geoDebugBusy.checked = Boolean(engine?.busyReasons?.includes('debug-ui'));

    if (snapshot.lastFix) {
      const fix = snapshot.lastFix;
      elements.geoDebugLastFix.textContent = `${fix.source} · ${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)} · ±${Math.round(fix.accuracy)} m`;
      if (fix.source === 'mock') {
        elements.geoDebugLat.value = fix.latitude.toFixed(6);
        elements.geoDebugLng.value = fix.longitude.toFixed(6);
      }
    } else {
      elements.geoDebugLastFix.textContent = '—';
    }

    if (snapshot.lastRawFix) {
      const raw = snapshot.lastRawFix;
      const lat = Number.isFinite(raw.latitude) ? raw.latitude.toFixed(6) : '—';
      const lng = Number.isFinite(raw.longitude) ? raw.longitude.toFixed(6) : '—';
      const accuracy = Number.isFinite(raw.accuracy) ? `±${Math.round(raw.accuracy)} m` : '±—';
      elements.geoDebugLastRawFix.textContent = `${raw.source} · ${lat}, ${lng} · ${accuracy}`;
    } else {
      elements.geoDebugLastRawFix.textContent = '—';
    }

    const m = snapshot.metrics;
    if (m) {
      elements.geoDebugFixStats.textContent = `${m.accepted}/${m.received} accepted${m.jumpRecoveries ? ` · ${m.jumpRecoveries} recovered` : ''}`;
      elements.geoDebugAccuracyStats.textContent = m.accuracyAvgM == null
        ? '—'
        : `min ${m.accuracyMinM.toFixed(1)} · avg ${m.accuracyAvgM.toFixed(1)} · max ${m.accuracyMaxM.toFixed(1)} m`;
      elements.geoDebugIntervalStats.textContent = m.intervalAvgMs == null
        ? '—'
        : `avg ${(m.intervalAvgMs / 1000).toFixed(2)} s · min ${(m.intervalMinMs / 1000).toFixed(2)} · max ${(m.intervalMaxMs / 1000).toFixed(2)}`;
      elements.geoDebugRejectStats.textContent = `acc ${m.rejectedAccuracy} · jump ${m.rejectedJump} · stale ${m.rejectedStale} · struct ${m.rejectedStructural}${m.lastRejectReason ? ` · last:${m.lastRejectReason}` : ''}`;
    }

    elements.geoDebugPieces.replaceChildren();
    for (const piece of engine?.pieces ?? []) {
      const row = document.createElement('code');
      const observed = Number.isFinite(piece.lastObservedDistanceM) && Math.abs(piece.lastObservedDistanceM - piece.distanceM) >= 1
        ? ` · obs ${formatDebugDistance(piece.lastObservedDistanceM)}`
        : '';
      row.textContent = `${piece.id}: ${piece.state} · trusted ${formatDebugDistance(piece.distanceM)}${observed} · ±${Number.isFinite(piece.lastTrustedAccuracyM) ? Math.round(piece.lastTrustedAccuracyM) : '—'} m · in ${piece.invokeStreak} / out ${piece.exitStreak}`;
      elements.geoDebugPieces.append(row);
    }
  },

  setSession(session) {
    if (!elements.geoDebug || elements.geoDebug.hidden) return;
    elements.geoDebugSession.textContent = session
      ? `${session.source} · ${session.entry.id}${session.decoupled ? ' · camera' : ' · preparing'}`
      : 'none';
  }
};


let handSeen = false;

export const interaction = {
  show(entry, { contentType = 'model3d', stage = 'discovery' } = {}) {
    activeEntry = entry;
    activeContentType = contentType;
    activeSource = stage === 'onsite' ? 'geo' : 'marker';
    elements.interactLayer.dataset.source = activeSource;
    mediaAudioEnabled = false;
    applyTypeLabels();
    setSoft(elements.mediaControls, contentType === 'video');
    setSoft(elements.mediaSoundBtn, contentType === 'video');
    if (contentType === 'video') {
      setMediaPlaying(false);
      setMediaAudioEnabled(false);
    }
    handSeen = false;
    lastGesture = null;
    fillPieceData(entry);
    buildChips(entry);
    motion.reveal(elements.chips, { rise: 0, dur: 180 });

    showLayer('interactLayer');
    setVoiceState(VoiceState.IDLE);
    setGestureState({ active: null, detected: false });

    resetDim();
  },

  hide() {
    activeEntry = null;
    fadeOut(elements.interactLayer);
    setSheetOpen(false);
    clearCaptions();
    recenterVisible = false;
    motion.conceal(elements.recenterBtn);
    hideRescanConfirm();
    motion.conceal(elements.mediaControls);

    motion.conceal(elements.helpPanel, { origin: 'trigger' });
    motion.conceal(elements.kbBar, { rise: 16 });
    elements.kbInput.blur();
    elements.kbInput.value = '';
  },

  reshow() {
    fadeIn(elements.interactLayer);
    resetDim();
  }
};

const PTT_ERROR_LABEL = {
  [VoiceErrorDetail.MIC_DENIED]: 'ptt.errMicDenied',
  [VoiceErrorDetail.MIC_MISSING]: 'ptt.errMicMissing',
  [VoiceErrorDetail.NETWORK]: 'ptt.errNetwork',
  [VoiceErrorDetail.RATE_LIMITED]: 'ptt.errRateLimited',
  [VoiceErrorDetail.SESSION_LOST]: 'ptt.errSessionLost',
  [VoiceErrorDetail.UNKNOWN]: 'ptt.errUnknown'
};

/**
 * Actualiza micrófono, estados de escucha y errores según la sesión de voz.
 */
export function setVoiceState(state, detail = null) {
  const layer = elements.interactLayer;
  layer.dataset.voice = state;

  const isWave = state === VoiceState.LISTENING || state === VoiceState.SPEAKING;
  const isSpin = state === VoiceState.CONNECTING || state === VoiceState.PROCESSING;

  setSoft(elements.pttIdle, !isWave && !isSpin);
  setSoft(elements.pttWave, isWave);
  setSoft(elements.pttSpin, isSpin);

  const labelKey = {
    [VoiceState.IDLE]: 'ptt.idle',
    [VoiceState.CONNECTING]: 'ptt.thinking',
    [VoiceState.LISTENING]: 'ptt.listening',
    [VoiceState.PROCESSING]: 'ptt.thinking',
    [VoiceState.SPEAKING]: 'ptt.speaking'
  }[state] ?? PTT_ERROR_LABEL[detail ?? VoiceErrorDetail.UNKNOWN];
  motion.swapText(elements.pttLabel, t(labelKey), { durOut: 100, durIn: 150 });

  if (state === VoiceState.LISTENING) feedback.listeningStart();

  if (state === VoiceState.ERROR) {
    const errorDetail = detail ?? VoiceErrorDetail.UNKNOWN;
    motion.swapText(elements.voiceErrorText, t(`voice.err.${errorDetail}`));
    setSoft(elements.voiceErrorHowto, errorDetail === VoiceErrorDetail.MIC_DENIED);
    if (motion.isVisible(elements.voiceErrorHowtoText)) motion.conceal(elements.voiceErrorHowtoText, { dur: 150, box: true });
    motion.conceal(elements.caption);
    motion.reveal(elements.voiceError, { rise: 12 });
    elements.interactLayer.dataset.caption = 'open';
    motion.conceal(elements.chips, { dur: 160 });
    feedback.error();
    motion.nudge(elements.talkBtn);
    setTimeout(() => motion.nudge(elements.voiceError), 200);
  } else {
    motion.conceal(elements.voiceError);
    if (!motion.isVisible(elements.caption)) elements.interactLayer.dataset.caption = 'closed';
    updateCaptionVisibility(state);
  }

  resetDim();
}

let lastGesture = null;
let lastGestureActivity = 0;
/**
 * Refleja visualmente si hay una mano detectada y un gesto activo.
 */
export function setGestureState({ active, detected }) {
  const stamp = `${activeContentType}:${active}:${detected}`;
  if (active && performance.now() - lastGestureActivity > 1000) {
    lastGestureActivity = performance.now();
    resetDim();
  }
  if (stamp === lastGesture) return;
  lastGesture = stamp;
  elements.interactLayer.dataset.hand = detected ? 'yes' : 'no';
  elements.interactLayer.dataset.gesture = active ?? '';

  elements.interactLayer.querySelectorAll('.rail .g').forEach((g) => {
    const isActive = g.dataset.g === active;
    g.classList.toggle('active', isActive);
    const key = activeContentType === 'video' && ['rotateY', 'rotateX'].includes(g.dataset.g)
      ? `gesture.video.${g.dataset.g}` : `gesture.${g.dataset.g}`;
    g.setAttribute('aria-label', t(key) + (isActive ? ` · ${t('gesture.active')}` : ''));
  });

  setSoft(elements.scaleChip, active === 'scale' || (activeContentType === 'video' && (active === 'rotateY' || active === 'rotateX')));

  if (detected && !handSeen) {
    handSeen = true;
    motion.pulse(elements.railDot, { scale: 1.9, dur: 520 });
  }
}


let captionNeedsReset = false;
function resetCaptionIfNeeded() {
  if (!captionNeedsReset) return;
  captionNeedsReset = false;
  motion.swapText(elements.captionYou, '');
  motion.swapText(elements.captionAi, '');
  elements.captionAi.classList.remove('thinking');
}
/**
 * Inserta o actualiza segmentos de conversación sin duplicar texto provisional.
 */
export function addTranscript({ role, text, final }) {
  resetCaptionIfNeeded();
  motion.conceal(elements.chips, { dur: 160 });
  if (role === 'user') {
    motion.streamText(elements.captionYou, final
      ? `${t('caption.you')} ${text}` : `${t('caption.typing')} ${text}`);
  } else {
    elements.captionAi.classList.remove('thinking');
    motion.streamText(elements.captionAi, text);
    elements.captionAi.scrollTop = elements.captionAi.scrollHeight;
  }
  motion.reveal(elements.caption, { rise: 6 });
  elements.interactLayer.dataset.caption = 'open';
}

/**
 * Decide cuándo presentar subtítulos de voz sin tapar otros controles.
 */
function updateCaptionVisibility(state) {
  if (state === VoiceState.IDLE) return;
  resetCaptionIfNeeded();
  if (state === VoiceState.PROCESSING) {
    motion.swapText(elements.captionAi, t('caption.thinking'));
    elements.captionAi.classList.add('thinking');
  }
  if (state === VoiceState.LISTENING) {
    elements.captionAi.classList.remove('thinking');
    motion.swapText(elements.captionYou, t('caption.typing'));
    motion.swapText(elements.captionAi, '');
  }
  motion.reveal(elements.caption, { rise: 6 });
  elements.interactLayer.dataset.caption = 'open';
  motion.conceal(elements.chips, { dur: 160 });
}

/**
 * Restablece subtítulos cuando se termina o sustituye una conversación.
 */
function clearCaptions() {
  captionNeedsReset = true;
  motion.conceal(elements.caption);
  elements.interactLayer.dataset.caption = 'closed';
}

elements.voiceErrorHowto.addEventListener('click', () => {
  const text = elements.voiceErrorHowtoText;
  if (!motion.isVisible(text)) motion.reveal(text, { rise: 6, box: true });
  else motion.conceal(text, { box: true });
});

let coachTimer = null;

/**
 * Enseña el control de mantener pulsado para conversar por primera vez.
 */
export function coachPtt() {
  elements.talkBtn.classList.add('coach');
  clearTimeout(coachTimer);
  coachTimer = setTimeout(() => elements.talkBtn.classList.remove('coach'), PTT_COACH_MS);
  resetDim();
}

/**
 * Presenta la alternativa escrita cuando hablar no es posible o no se desea.
 */
export function revealKeyboard() {
  motion.reveal(elements.kbBar, { rise: 16 });
  elements.kbInput.focus();
  resetDim();
}

export function holdHintPtt() {
  motion.swapText(elements.pttLabel, t('ptt.holdHint'), { durOut: 100, durIn: 150 });
}


let rescanConfirmTimer = null;

function hideRescanConfirm() {
  clearTimeout(rescanConfirmTimer);
  rescanConfirmTimer = null;
  motion.conceal(elements.rescanConfirm, { origin: 'trigger' });
  elements.rescanConfirm.classList.remove('armed');
}

/**
 * Exige una segunda acción para evitar perder una pieza por un toque accidental.
 */
function armRescanConfirm() {
  const pop = elements.rescanConfirm;
  pop.style.setProperty('--confirm-ms', `${RESCAN_CONFIRM_MS}ms`);
  pop.classList.add('armed');
  pop.getAnimations().filter(a => a.animationName === 'consume').forEach(a => { a.currentTime = 0; });

  clearTimeout(rescanConfirmTimer);
  rescanConfirmTimer = setTimeout(hideRescanConfirm, RESCAN_CONFIRM_MS);
}

elements.rescanBtn.addEventListener('click', () => {
  if (!motion.isVisible(elements.rescanConfirm)) {
    if (motion.isVisible(elements.helpPanel)) motion.conceal(elements.helpPanel, { origin: 'trigger' });
    motion.reveal(elements.rescanConfirm, { origin: 'trigger', dur: 260 });
    armRescanConfirm();
  } else {
    hideRescanConfirm();
  }
  resetDim();
});

elements.rescanConfirmYes.addEventListener('click', () => {
  hideRescanConfirm();
  onRescanCallback?.();
});

elements.rescanConfirmNo.addEventListener('click', hideRescanConfirm);


elements.recenterBtn.addEventListener('click', () => {
  onRecenterCallback?.();
  resetDim();
});


const projectVec = new THREE.Vector3();
function setReadout(text) {
  if (elements.scaleChip.textContent !== text) elements.scaleChip.textContent = text;
}

let recenterVisible = false;

/**
 * Coloca datos de la pieza y ayudas visuales según su proyección en la pantalla.
 */
export function updateObjectOverlay(session, camera) {
  if (!session?.model || !motion.isVisible(elements.interactLayer)) return;

  session.model.getWorldPosition(projectVec);
  projectVec.project(camera);

  const x = (projectVec.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projectVec.y * 0.5 + 0.5) * window.innerHeight;

  if (elements.interactLayer.dataset.gesture === 'scale' && !isSheetOpen()) {
    const position = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0) translate(-50%,-50%)`;
    if (elements.objOverlay.style.transform !== position) elements.objOverlay.style.transform = position;
  }

  const sheetOpen = isSheetOpen();
  const helpOpen = motion.isVisible(elements.helpPanel);
  const offscreen = Math.abs(projectVec.x) > 1.1 || Math.abs(projectVec.y) > 1.1;
  const shouldShow = offscreen && !sheetOpen && !helpOpen && session.centeringComplete;

  if (shouldShow !== recenterVisible) {
    recenterVisible = shouldShow;
    if (shouldShow) {
      const lostSideways = Math.abs(projectVec.x) > Math.abs(projectVec.y);
      motion.reveal(elements.recenterBtn, lostSideways
        ? { rise: 0, dx: Math.sign(projectVec.x) * RECENTER_SLIDE_X }
        : { rise: projectVec.y > 0 ? -RECENTER_SLIDE_Y : RECENTER_SLIDE_Y });
    } else {
      motion.conceal(elements.recenterBtn, { rise: 8, dur: 200 });
    }
  }

  const gesture = elements.interactLayer.dataset.gesture;
  if (gesture === 'scale' && session.baseModelScale > 0) {
    const multiplier = session.model.scale.x / session.baseModelScale;
    setReadout(`${multiplier.toFixed(1)}×`);
  } else if (activeContentType === 'video' && gesture === 'rotateY') {
    setReadout(session.contentInstance?.controller?.readout?.('seek') ?? '');
  } else if (activeContentType === 'video' && gesture === 'rotateX') {
    setReadout(session.contentInstance?.controller?.readout?.('volume') ?? '');
  }
}


let dimTimer = null;

export function resetDim() {
  elements.interactLayer.classList.remove('dim');
  clearTimeout(dimTimer);
  dimTimer = setTimeout(() => {
    if (motion.isVisible(elements.interactLayer)) elements.interactLayer.classList.add('dim');
  }, UI_IDLE_DIM_MS);
}

elements.interactLayer.addEventListener('pointerdown', resetDim);


/**
 * Coordina la expansión de la ficha con los elementos visibles de interacción.
 */
export function setSheetOpen(open) {
  const changed = isSheetOpen() !== open;
  elements.interactLayer.dataset.sheet = open ? 'open' : 'closed';
  const siblings = Array.from(elements.interactLayer.children).filter(el => el !== elements.sheet);
  if (open) {
    elements.sheet.inert = false;
    motion.reveal(elements.sheet, { rise: 24, dur: 260 });
    siblings.forEach(el => { el.inert = true; });
    elements.sheetClose.focus({ preventScroll: true });
  } else {
    siblings.forEach(el => { el.inert = el.hasAttribute('data-ui-leaving'); });
    if (elements.sheet.contains(document.activeElement)) elements.btnSheet.focus({ preventScroll: true });
    motion.conceal(elements.sheet, { rise: 24, dur: 260 });
    elements.sheet.inert = true;
  }
  if (changed) onSheetToggleCallback?.(open);
  resetDim();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && isSheetOpen()) {
    const focusable = [...elements.sheet.querySelectorAll('button, [href], input, [tabindex="0"]')].filter(el => !el.disabled && !el.hidden);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if (event.key === 'Escape' && elements.interactLayer.dataset.sheet === 'open') {
    setSheetOpen(false);
  }
});

export function onSheetToggle(cb) { onSheetToggleCallback = cb; }
export function onRecalibrate(cb) { onRecalibrateCallback = cb; }
export function onAsk(cb) { onAskCallback = cb; }
export function onRescan(cb) { onRescanCallback = cb; }
export function onRecenter(cb) { onRecenterCallback = cb; }
export function onGeoExit(cb) { onGeoExitCallback = cb; }

elements.sheetClose.addEventListener('click', () => setSheetOpen(false));
elements.sheetAsk.addEventListener('click', () => {
  setSheetOpen(false);
  onAskCallback?.();
});


let onAskQuestionCallback = null;
export function onAskQuestion(cb) { onAskQuestionCallback = cb; }

/**
 * Resuelve el nombre de la pieza en el idioma elegido.
 */
function localizedName(entry) {
  const lang = getLang();
  return (lang !== 'es' && entry.translations?.[lang]?.name) || entry.name;
}
/**
 * Selecciona la descripción apropiada para la etapa y el idioma.
 */
function localizedSummary(entry, source = activeSource) {
  const lang = getLang();
  const stage = getStageMetadata(entry, source);
  const translatedStage = stage?.translations?.[lang];
  const translated = entry.translations?.[lang];
  return translatedStage?.summary ?? translatedStage?.description ?? stage?.summary ??
    stage?.description ?? translated?.summary ?? translated?.description ??
    entry.summary ?? entry.description ?? '';
}
export { localizedName, localizedSummary };

/**
 * Proporciona preguntas sugeridas adaptadas al contenido invocado.
 */
function localizedQuestions(entry, source = activeSource) {
  const lang = getLang();
  const stage = getStageMetadata(entry, source);
  return stage?.translations?.[lang]?.suggestedQuestions ?? stage?.suggestedQuestions ??
    entry.translations?.[lang]?.suggestedQuestions ?? entry.suggestedQuestions ?? [];
}

function optionalText(el, value) {
  if (value) { motion.swapText(el, value); motion.reveal(el, { rise: 0 }); }
  else motion.conceal(el, { rise: 0 });
}
/**
 * Vuelca metadatos de la pieza activa en los controles informativos.
 */
function fillPieceData(entry) {
  motion.swapText(elements.pieceName, localizedName(entry));
  const atPlace = elements.interactLayer.dataset.source === 'geo';
  elements.entryContext.textContent = t(atPlace ? 'entry.geo' : 'entry.marker');
  const invite = elements.visitInvite.querySelector('p');
  invite.dataset.i18n = atPlace ? 'sheet.arrived' : 'sheet.invitation';
  invite.textContent = t(invite.dataset.i18n);
  const summary = localizedSummary(entry);
  optionalText(elements.sheetSummary, summary);
  optionalText(elements.pieceInv, entry.inventoryNumber
    ? `${t('sheet.invPrefix')} ${entry.inventoryNumber}` : '');

  motion.swapText(elements.sheetTitle, localizedName(entry));
  for (const [field, el] of Object.entries(elements.sheetFields)) {
    const stage = getStageMetadata(entry, activeSource);
    const value = stage?.translations?.[getLang()]?.[field] ?? stage?.[field] ??
      entry.translations?.[getLang()]?.[field] ?? entry[field];
    const empty = value === undefined || value === null || value === '' || value === '—';
    optionalText(el, empty ? '' : String(value));
    const dt = el.previousElementSibling;
    if (dt && dt.tagName === 'DT') setSoft(dt, !empty);
  }
}

/**
 * Construye accesos a preguntas sugeridas sin dejar listeners anteriores.
 */
function buildChips(entry) {
  motion.flow(elements.chips, () => {
    elements.chips.replaceChildren();
    localizedQuestions(entry).forEach((question) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = question;
      chip.addEventListener('click', () => {
        resetDim();
        onAskQuestionCallback?.(question);
      });
      elements.chips.appendChild(chip);
    });

    const chips = Array.from(elements.chips.children);
    if (chips.length >= 2) {
      const middle = chips[Math.floor(chips.length / 2)];
      requestAnimationFrame(() => {
        const containerWidth = elements.chips.clientWidth;
        const centered = middle.offsetLeft + middle.offsetWidth / 2 - containerWidth / 2;
        elements.chips.scrollLeft = containerWidth < COMPACT_CONTAINER_WIDTH_PX
          ? 0
          : Math.max(0, centered);
      });
    }
  });
}

elements.gestureHelpBtn.addEventListener('click', () => {
  if (!motion.isVisible(elements.helpPanel)) {
    if (motion.isVisible(elements.rescanConfirm)) hideRescanConfirm();
    motion.reveal(elements.helpPanel, { origin: 'trigger', dur: 260 });
  } else {
    motion.conceal(elements.helpPanel, { origin: 'trigger' });
  }
  resetDim();
});

elements.recalibrateBtn.addEventListener('click', () => {
  motion.conceal(elements.helpPanel, { origin: 'trigger' });
  onRecalibrateCallback?.();
});

export function setRecalibrateAvailable(available) {
  setSoft(elements.recalibrateBtn, available);
}

function applyTypeLabels() {
  elements.interactLayer.querySelectorAll('.rail .g').forEach((g) => {
    const key = activeContentType === 'video' && (g.dataset.g === 'rotateY' || g.dataset.g === 'rotateX')
      ? `gesture.video.${g.dataset.g}`
      : `gesture.${g.dataset.g}`;
    g.setAttribute('aria-label', t(key));
    g.setAttribute('title', t(key));
    const use = g.querySelector('use');
    if (use && activeContentType === 'video' && g.dataset.g === 'rotateY') use.setAttribute('href', '#i-seek');
    else if (use && activeContentType === 'video' && g.dataset.g === 'rotateX') use.setAttribute('href', '#i-volume');
    else if (use && g.dataset.g === 'rotateY') use.setAttribute('href', '#i-roty');
    else if (use && g.dataset.g === 'rotateX') use.setAttribute('href', '#i-rotx');
  });
  elements.rail.setAttribute('aria-label', t('gesture.rail'));
  const help = elements.helpPanel.querySelector('[data-i18n^="help.gestures"]');
  if (help) help.textContent = t(activeContentType === 'video' ? 'help.gesturesVideo' : 'help.gestures');
}

export function setMediaPlaying(playing) {
  mediaPlaying = Boolean(playing);
  const use = elements.mediaBtn.querySelector('use');
  use?.setAttribute('href', mediaPlaying ? '#i-pause' : '#i-play');
  elements.mediaBtn.setAttribute('aria-label', t(mediaPlaying ? 'media.pause' : 'media.play'));
}

export function setMediaAudioEnabled(enabled) {
  mediaAudioEnabled = Boolean(enabled);
  setSoft(elements.mediaSoundBtn, !mediaAudioEnabled && activeContentType === 'video');
  elements.mediaSoundBtn.textContent = t('media.sound.enable');
}

export function onMediaToggle(cb) { onMediaToggleCallback = cb; }
export function onMediaAudioEnable(cb) { onMediaAudioCallback = cb; }

let kbHandlersWired = false;
/**
 * Registra acciones de los controles de la interfaz una sola vez.
 */
export function wireControls() {
  if (kbHandlersWired) return;
  kbHandlersWired = true;

  elements.btnKeyboard.addEventListener('click', () => {
    if (!motion.isVisible(elements.kbBar)) {
      revealKeyboard();
    } else {
      motion.conceal(elements.kbBar, { rise: 16 });
      resetDim();
    }
  });

  let sending = false;
  const send = async () => {
    const text = elements.kbInput.value.trim();
    if (!text || sending) return;
    const entry = activeEntry;
    sending = true;
    elements.kbSend.disabled = true;
    try {
      const sent = await onAskQuestionCallback?.(text);
      if (sent && entry === activeEntry && elements.kbInput.value.trim() === text) {
        elements.kbInput.value = '';
      }
    } catch (err) {
      console.warn('No se pudo enviar la pregunta:', err);
    } finally {
      sending = false;
      elements.kbSend.disabled = false;
      resetDim();
    }
  };

  elements.kbSend.addEventListener('click', send);
  let sendPointer = null;
  elements.kbSend.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || elements.talkBtn.getAttribute('aria-pressed') !== 'true') return;
    sendPointer = event.pointerId;
    try { elements.kbSend.setPointerCapture(sendPointer); } catch {}
  });
  elements.kbSend.addEventListener('pointerup', event => {
    if (event.pointerId !== sendPointer) return;
    sendPointer = null;
    event.preventDefault();
    const box = elements.kbSend.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom) return;
    void send();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    elements.kbSend.addEventListener(type, () => { sendPointer = null; });
  }
  window.addEventListener('blur', () => { sendPointer = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) sendPointer = null; });
  elements.kbInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  elements.mediaBtn.addEventListener('click', () => {
    onMediaToggleCallback?.();
    resetDim();
  });
  elements.mediaSoundBtn.addEventListener('click', () => {
    onMediaAudioCallback?.();
    resetDim();
  });

  elements.btnSheet.addEventListener('click', () => {
    if (!activeEntry) return;
    setSheetOpen(!isSheetOpen());
  });
}

/**
 * Captura pulsación y liberación real del botón de voz, también en dispositivos táctiles.
 */
export function wireTalkButton({ onPressStart, onPressEnd }) {
  const btn = elements.talkBtn;
  let pointerId = null;
  let activeKey = null;

  const pressStart = () => {
    btn.setAttribute('aria-pressed', 'true');
    onPressStart();
  };
  const pressEnd = () => {
    if (pointerId === null && activeKey === null) return;
    pointerId = null;
    activeKey = null;
    btn.setAttribute('aria-pressed', 'false');
    onPressEnd();
  };

  btn.addEventListener('pointerdown', (event) => {
    if (btn.disabled || pointerId !== null || activeKey !== null ||
        (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointerId = event.pointerId;
    try { btn.setPointerCapture(event.pointerId); } catch { /* Algunos navegadores no permiten capturar este puntero; se conserva el evento normal. */ }
    pressStart();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
    btn.addEventListener(type, (event) => {
      if (event.pointerId === pointerId) pressEnd();
    });
  });

  btn.addEventListener('keydown', (event) => {
    if (![' ', 'Enter'].includes(event.key) || event.repeat || btn.disabled ||
        event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (pointerId !== null || activeKey !== null) return;
    activeKey = event.key;
    pressStart();
  });
  btn.addEventListener('keyup', (event) => {
    if (event.key !== activeKey) return;
    event.preventDefault();
    pressEnd();
  });

  btn.addEventListener('blur', pressEnd);
  window.addEventListener('blur', pressEnd);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pressEnd(); });
}

/**
 * Actualiza textos variables cuando el visitante cambia de idioma.
 */
function refreshDynamicTexts() {
  if (activeEntry && motion.isVisible(elements.interactLayer)) {
    motion.flow(elements.titleChip, () => fillPieceData(activeEntry), { box: true });
    buildChips(activeEntry);
  }
  const voiceState = elements.interactLayer.dataset.voice || VoiceState.IDLE;
  if (voiceState === VoiceState.ERROR) {
    const detail = getVoiceErrorDetail() ?? VoiceErrorDetail.UNKNOWN;
    motion.swapText(elements.voiceErrorText, t(`voice.err.${detail}`));
    motion.swapText(elements.pttLabel, t(PTT_ERROR_LABEL[detail]), { durOut: 100, durIn: 150 });
  } else {
    setVoiceState(voiceState);
  }

  applyTypeLabels();
  if (activeContentType === 'video') {
    setMediaPlaying(mediaPlaying);
    setMediaAudioEnabled(mediaAudioEnabled);
  }
}
