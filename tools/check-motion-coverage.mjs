// Auditoría preventiva: los principales componentes de las cuatro secciones
// deben contar con entrada, feedback o transición de estado. Sin dependencias.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [ui, motion, css, html] = await Promise.all(
  ['src/ui.js', 'src/motion.js', 'src/style.css', 'index.html']
    .map(file => readFile(new URL(file, root), 'utf8'))
);
const checks = {
  'portada editorial': {
    html: ['intro-home', 'start-btn', 'lang-btn'],
    ui: ['.hero-copy > .eyebrow', '.journey li', '.cta-zone', '.hero-art', 'motion.stagger(items'],
    css: ['.privacy-details[open] p', '.museum .mark', '.journey-no', '#start-btn.launching']
  },
  'carga y error': {
    html: ['intro-loading', 'intro-error', 'check-camera', 'error-retry'],
    ui: ['[elements.introLoading', '[elements.introError', 'motion.pulse(el.querySelector'],
    css: ['.checks .b .i', '.checks li.done .b .i', '.checks li.warn .b .i']
  },
  'calibración': {
    html: ['s-calibrate', 'cal-ok', 'calibration-skip-btn', 'cal-seg1'],
    ui: ['[elements.calibrateLayer', "motion.pulse(elements.calSeg1", 'awaitStartOrSkip'],
    css: ['.seg svg', '.seg.done svg', '#cal-ok:not([hidden])']
  },
  'escaneo y geo': {
    html: ['s-scan', 'scan-block-search', 'scan-block-geo', 'geo-manual-btn'],
    ui: ['[elements.scanLayer', 'motion.stagger([entering]', 'setSoft(elements.geoManualBtn'],
    css: ['.reticle i', '.reticle .in', '.bar.done b::after']
  },
  'interacción AR y voz': {
    html: ['s-interact', 'talk-btn', 'gesture-help-btn', 'recenter-btn', 'btn-keyboard'],
    ui: ['[elements.interactLayer', 'motion.reveal(elements.recenterBtn', 'motion.pulse(elements.mediaBtn'],
    css: ['.rail .g.active', '.rail .hd', '.ptt.coach', '.kb-bar:focus-within', '#obj-overlay .brk']
  },
  'paneles y ficha': {
    html: ['piece-sheet', 'sheet-title', 'scan-help', 'rescan-confirm'],
    ui: ['motion.stagger(visibleSheetRows()', 'elements.sheetTitle, elements.sheetSummary', 'motion.reveal(elements.helpPanel'],
    css: ['#s-interact[data-sheet="open"] .sheet .grab', '.sheet .hd2 .iconbtn']
  },
  'consola de campo': {
    html: ['geo-debug', 'geo-debug-collapse'],
    ui: ['motion.reveal(elements.geoDebug', 'setSoft(elements.geoDebugBody'],
    css: ['.geo-debug{transition:width', '.geo-debug-grid input:focus']
  }
};

for (const [name, requirements] of Object.entries(checks)) {
  for (const [kind, selectors] of Object.entries(requirements)) {
    const source = { html, ui, css }[kind];
    for (const fragment of selectors) {
      assert.ok(source.includes(fragment), `${name}: falta ${fragment} en ${kind}`);
    }
  }
  console.log(`OK: cobertura de movimiento — ${name}`);
}

// Una misma primitiva sirve a todos los centrados CSS, incluso si entran
// durante otra transición o si se cancelan/reinician las cascadas.
assert.match(motion, /function withBaseTransform\(/);
assert.match(motion, /const staggerAnims = new WeakMap\(\)/);
assert.match(motion, /staggerAnims\.get\(el\)\?\.cancel\(\)/);
assert.match(ui, /function stageEntrance\(section\)/);
assert.match(ui, /stageEntrance\(el\);/);
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(css, /animation:none!important/);
assert.match(css, /:where\(button,summary,input\):focus-visible/);
assert.doesNotMatch(css, /\.det-pill\s*\{[^}]*animation\s*:/, 'Estado de manos no debe animarse por frame');
assert.doesNotMatch(ui, /classList\.add\('entering'\)/, 'No dejar estados vacíos sin animación CSS');
console.log('OK: transformaciones preservadas, reentrada, foco y movimiento reducido');

// Reproduce RAF y timers: una entrada no debe perder su coreografía por
// leer .fade-out antes de retirarla, ni resucitar tras una salida rápida.
const frames = [];
const timers = [];
const arrivals = [];
const navCode = ui.slice(ui.indexOf('const FADE_OUT_SLACK_MS'),
  ui.indexOf('// Mostrar/ocultar un elemento en flujo'))
  .replace('export function fadeOut', 'function fadeOut')
  .replace('export function fadeIn', 'function fadeIn');
const nav = vm.runInNewContext(`(() => {${navCode} return { fadeIn, fadeOut };})()`, {
  WeakMap,
  requestAnimationFrame: cb => frames.push(cb),
  setTimeout: cb => timers.push(cb),
  stageEntrance: el => arrivals.push(el),
  motion: { tokenMs: () => 160 }
});
function frame() { const batch = frames.splice(0); batch.forEach(fn => fn()); }
function mockLayer(hidden = true) {
  const classes = new Set();
  return {
    hidden,
    classList: {
      add: key => classes.add(key), remove: key => classes.delete(key),
      contains: key => classes.has(key)
    }
  };
}
const view = mockLayer();
nav.fadeIn(view);
assert.equal(view.hidden, false);
frame();
assert.equal(arrivals.length, 0, 'La llegada no debe ocurrir antes del segundo frame');
frame();
assert.equal(arrivals.length, 1, 'La entrada debe activar stageEntrance');
assert.equal(view.classList.contains('fade-out'), false);
nav.fadeOut(view);
nav.fadeIn(view); // reentrada antes de que venza el fade-out
frame(); frame();
timers.splice(0).forEach(cb => cb());
assert.equal(view.hidden, false, 'El temporizador anterior no puede ocultar la nueva vista');
assert.equal(arrivals.length, 2);
nav.fadeOut(view);
nav.fadeIn(view);
nav.fadeOut(view); // salir antes del segundo RAF de entrada
frame(); frame();
assert.equal(arrivals.length, 2, 'RAF vencido no debe revelar una vista saliente');
console.log('OK: coreografía tras fade-in y cancelación de entradas/salidas rápidas');
