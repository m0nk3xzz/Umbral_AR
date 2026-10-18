// Regresiones de la sección 2 sin cámara ni dependencias del navegador.
// Ejecuta el controlador y la UI reales con colaboradores simulados.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';

const [uiSource, trackingSource, motionSource, css] = await Promise.all([
  'ui.js', 'handTracking.js', 'motion.js', 'style.css'
].map((file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')));

class FakeElement {
  constructor(hidden = false) {
    this.hidden = hidden;
    this.listeners = new Map();
    this.dataset = {};
    this.style = { setProperty() {}, strokeDashoffset: '' };
    this.classList = { toggle() {} };
    this.textContent = '';
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }
  click() {
    for (const listener of [...(this.listeners.get('click') ?? [])]) listener();
  }
  listenerCount() { return this.listeners.get('click')?.size ?? 0; }
}

const elements = {};
for (const key of [
  'calibrateLayer', 'calOk', 'calPillOk', 'calPillWarn', 'calHint',
  'calStartBtn', 'calSkipBtn', 'calSeg1', 'calSeg2', 'calTitle',
  'calHelp', 'calRing'
]) elements[key] = new FakeElement(key === 'calHint' || key === 'calStartBtn');

const motion = {
  reveal(el) { el.hidden = false; },
  conceal(el) { el.hidden = true; },
  swapTextRise(el, value) { el.textContent = value; },
  nudge() {},
  pulse() {}
};
const uiCode = uiSource.slice(
  uiSource.indexOf('export const calibration = {'),
  uiSource.indexOf('// --- 3 · Escaneo ---')
).replace('export const calibration', 'const calibration');
assert.ok(uiCode.includes('awaitStartOrSkip'), 'No se pudo extraer el controlador UI');
const calUI = vm.runInNewContext(`(() => { ${uiCode} return calibration; })()`, {
  elements, motion, t: (key) => key, setSoft: (el, visible) => { el.hidden = !visible; },
  fadeOut() {}, showLayer() {}, flashBootRing() {}, feedback: { calibrationDone() {}, error() {} }
});

// El aviso no debe persistir durante otra etapa ni durante el cierre.
calUI.setStep('fist');
calUI.setHandDetected(false, true);
assert.equal(elements.calHint.hidden, false);
calUI.setStep('open');
assert.equal(elements.calHint.hidden, true);
calUI.setHandDetected(false, true);
calUI.setHandDetected(null);
assert.equal(elements.calHint.hidden, true);
calUI.setHandDetected(false, true);
calUI.setStep('skipped');
assert.equal(elements.calHint.hidden, true);

const resetStart = trackingSource.indexOf('function resetCalibrationToDefaults()');
const resetCode = trackingSource.slice(resetStart, trackingSource.indexOf('\n}\n', resetStart) + 3);
const calibrationCode = trackingSource.slice(trackingSource.indexOf('// --- Calibración por usuario ---'))
  .replace('export function runCalibration', 'function runCalibration');

const tracking = vm.runInNewContext(`(() => {
  let fingerExtensionMargins = { index: 999, middle: 999, ring: 999, pinky: 999 };
  let thumbEnterThreshold = 999, thumbExitThreshold = 999, thumbWasExtended = true;
  let landmarkOpacity = 0.2, detectionPaused = false, overlayCanvas = {};
  let handLandmarker = { detectForVideo: () => ({ landmarks: [] }) };
  function pauseDetection() { detectionPaused = true; }
  function resumeDetection() { detectionPaused = false; }
  function ensureOverlay() {}
  function clearOverlay() {}
  function drawLandmarks() {}
  function distance2D() { return 1; }
  ${resetCode}
  ${calibrationCode}
  return {
    runCalibration,
    seed() {
      fingerExtensionMargins.index = 999;
      thumbEnterThreshold = 999;
      thumbExitThreshold = 999;
      thumbWasExtended = true;
    },
    snapshot() {
      return { margins: { ...fingerExtensionMargins }, thumbEnterThreshold,
        thumbExitThreshold, thumbWasExtended, detectionPaused, landmarkOpacity };
    }
  };
})()`, {
  calUI, console: { log() {}, warn() {}, error() {} }, performance,
  requestAnimationFrame: (callback) => setTimeout(() => callback(performance.now()), 4),
  setTimeout,
  DEFAULT_FINGER_EXTENSION_MARGIN: 0.15,
  DEFAULT_THUMB_ENTER_THRESHOLD: 0.675,
  DEFAULT_THUMB_EXIT_THRESHOLD: 0.575,
  CALIBRATION_COUNTDOWN_MS: 40,
  CALIBRATION_SAMPLE_MS: 100,
  CALIBRATION_DONE_MESSAGE_MS: 8,
  CALIBRATION_LANDMARK_OPACITY: 0.75,
  NO_HAND_HINT_MS: 30
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function runScenario(label, startAfterMs, skipAfterMs, expectedStep) {
  tracking.seed();
  const run = tracking.runCalibration({ readyState: 2 }, {});
  assert.equal(elements.calStartBtn.listenerCount(), 1, `${label}: no escucha iniciar`);
  assert.equal(elements.calSkipBtn.listenerCount(), 1, `${label}: no escucha omitir`);
  await delay(startAfterMs);
  if (skipAfterMs !== null) {
    if (skipAfterMs > 0) {
      elements.calStartBtn.click();
      await delay(skipAfterMs);
    }
    elements.calSkipBtn.click();
  } else {
    elements.calStartBtn.click();
  }
  await run;
  assert.equal(elements.calibrateLayer.dataset.step, expectedStep, `${label}: paso final incorrecto`);
  assert.equal(elements.calStartBtn.listenerCount(), 0, `${label}: listener iniciar sin liberar`);
  assert.equal(elements.calSkipBtn.listenerCount(), 0, `${label}: listener omitir sin liberar`);
  const values = tracking.snapshot();
  assert.equal(values.detectionPaused, false, `${label}: tracking siguió pausado`);
  assert.equal(values.landmarkOpacity, 0.2, `${label}: opacidad no restaurada`);
  assert.equal(values.thumbEnterThreshold, 0.675, `${label}: no restauró pulgar`);
  assert.equal(values.thumbExitThreshold, 0.575, `${label}: no restauró pulgar`);
  assert.equal(values.thumbWasExtended, false, `${label}: histéresis persistente`);
  for (const margin of Object.values(values.margins)) {
    assert.equal(margin, 0.15, `${label}: umbral no estándar`);
  }
  console.log(`OK: ${label}`);
}

await runScenario('omitir antes de iniciar', 5, 0, 'skipped');
await runScenario('omitir durante la cuenta atrás', 5, 10, 'skipped');
await runScenario('omitir durante la captura de puño', 5, 65, 'skipped');
await runScenario('omitir durante la cuenta atrás de mano abierta', 5, 154, 'skipped');
await runScenario('omitir durante la captura de mano abierta', 5, 196, 'skipped');
await runScenario('calibración completa sin mano y recalibración sin listeners viejos', 5, null, 'failed');

// Las animaciones de aparición/salida y otros efectos compartidos deben
// respetar la posición CSS, no sustituirla por "none".
for (const fn of ['reveal', 'conceal', 'stagger', 'swapTextRise']) {
  const start = motionSource.indexOf(`export function ${fn}(`);
  assert.ok(start >= 0, `No existe motion.${fn}`);
  const next = motionSource.indexOf('\nexport function ', start + 1);
  const body = motionSource.slice(start, next < 0 ? undefined : next);
  assert.match(body, /withBaseTransform\(/, `${fn} no preserva el transform CSS`);
}
assert.match(css, /\.hint-chip\{[^}]*transform:translateX\(-50%\)/);
console.log('OK: animaciones compartidas preservan los centrados CSS');
