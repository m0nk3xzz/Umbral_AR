/**
 * Animaciones de interfaz y transiciones espaciales. Respeta la preferencia de movimiento reducido y
 * evita que animaciones interrumpidas dejen estados incoherentes.
 */

import * as THREE from 'three';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
/**
 * Respeta la preferencia del sistema de reducir animaciones.
 */
export function prefersReducedMotion() { return REDUCED_MOTION.matches; }

const tokenCache = new Map();
/**
 * Consulta las variables CSS que regulan duraciones y curvas de movimiento.
 */
function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
export function tokenMs(name, fallback) {
  if (tokenCache.has(name)) return tokenCache.get(name);
  const raw = readToken(name);
  const ms = raw.endsWith('ms') ? parseFloat(raw) : raw.endsWith('s') ? parseFloat(raw) * 1000 : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return fallback;
  tokenCache.set(name, ms);
  return ms;
}
export function tokenEase(name, fallback) {
  if (tokenCache.has(name)) return tokenCache.get(name);
  const raw = readToken(name);
  if (!raw) return fallback;
  tokenCache.set(name, raw);
  return raw;
}
const easing = () => tokenEase('--ease-std', 'cubic-bezier(.4,0,.2,1)');
const duration = (ms) => prefersReducedMotion() ? 100 : Math.min(300, Math.max(120, ms));
const presence = new WeakMap();
const contentJobs = new WeakMap();
const accents = new WeakMap();

export function isVisible(el) {
  return !!el && (presence.get(el)?.visible ?? !el.hidden);
}
function restoreAccess(el, state) {
  const modalBlocks = el.closest('#s-interact[data-sheet="open"]') && !el.closest('#piece-sheet');
  el.inert = state.inert || Boolean(modalBlocks) || (el.id === 'piece-sheet' && el.hidden);
  if (state.aria === null) el.removeAttribute('aria-hidden');
  else el.setAttribute('aria-hidden', state.aria);
  delete el.dataset.uiLeaving;
}
function blockAccess(el) {
  el.inert = true;
  el.setAttribute('aria-hidden', 'true');
  el.dataset.uiLeaving = '';
}
function cancelAccent(el) {
  accents.get(el)?.cancel();
  accents.delete(el);
}
function offsets(opts) {
  if (prefersReducedMotion()) return {};
  const rise = opts.rise ?? (opts.origin === 'top' ? -8 : opts.origin === 'trigger' ? 0 : 8);
  const scale = opts.scale ?? (opts.origin === 'trigger' ? .98 : 1);
  return { translate: `${opts.dx ?? 0}px ${rise}px`, scale: String(scale) };
}

function sampleFrame(el, moving) {
  const style = getComputedStyle(el);
  return { opacity: style.opacity, ...(moving ? { translate: style.translate, scale: style.scale } : {}) };
}
/**
 * Crea o invierte la transición visual sin bloquear el acceso de forma prematura.
 */
function animatePresence(el, state, opts, sampled = null) {
  const ms = duration(opts.dur ?? tokenMs('--dur-base', 220));
  const shift = offsets(opts);
  const rest = { opacity: 1, ...('translate' in shift ? { translate: '0px 0px', scale: '1' } : {}) };
  const away = { opacity: 0, ...shift };
  state.moving = 'translate' in shift;
  state.reversible = !sampled;
  const animation = el.animate(sampled ? [sampled, state.visible ? rest : away] : [away, rest], {
    duration: ms, delay: state.visible ? Math.min(80, opts.delay ?? 0) : 0,
    easing: easing(), fill: 'both'
  });
  state.animation = animation;
  presence.set(el, state);
  if (!state.visible && !sampled) { animation.reverse(); animation.currentTime = ms; }
  animation.onfinish = () => {
    if (presence.get(el) !== state || state.animation !== animation) return;
    el.hidden = !state.visible;
    restoreAccess(el, state);
    presence.delete(el);
    animation.cancel();
    if (state.pendingContent) {
      if (el.hidden) state.pendingContent();
      else flow(el, state.pendingContent);
    }
  };
  return animation;
}
/**
 * Coordina visibilidad, accesibilidad y animación de aparición o desaparición.
 */
function setPresence(el, visible, opts = {}) {
  if (!el) return;
  const current = presence.get(el);
  if (current) {
    if (current.visible === visible) return current.animation;
    if (visible && el.id === 'piece-sheet') current.inert = false;
    current.visible = visible;
    if (visible) restoreAccess(el, current);
    else blockAccess(el);
    if (current.reversible) {
      const time = current.animation.currentTime ?? 0;
      current.animation.reverse();
      current.animation.currentTime = time;
      return current.animation;
    }
    const sampled = sampleFrame(el, current.moving);
    current.animation.cancel();
    return animatePresence(el, current, opts, sampled);
  }
  if (visible === !el.hidden) return;
  cancelAccent(el);
  const job = contentJobs.get(el);
  const sampled = job ? sampleFrame(el, !prefersReducedMotion()) : null;
  if (job) { job.animation.cancel(); contentJobs.delete(el); }
  const modalBlocks = el.closest('#s-interact[data-sheet="open"]') && !el.closest('#piece-sheet');
  const state = { visible, inert: el.inert && !modalBlocks,
    aria: el.getAttribute('aria-hidden'), pendingContent: job?.mutate, animation: null };
  el.hidden = false;
  if (!visible) blockAccess(el);
  return animatePresence(el, state, opts, sampled);
}
/**
 * Hace visible un elemento y restaura sus posibilidades de interacción.
 */
export function reveal(el, opts = {}) { return setPresence(el, true, opts); }
/**
 * Oculta gradualmente un elemento y evita que reciba acciones mientras no está visible.
 */
export function conceal(el, opts = {}) { return setPresence(el, false, opts); }

/**
 * Sustituye contenido entre una salida y una entrada sin parpadeos.
 */
function replaceContent(el, key, mutate, { durOut = 90, durIn = 140, rise = 0 } = {}) {
  if (!el) return;
  const previous = contentJobs.get(el);
  if (previous?.key === key) return;
  if (previous) {
    previous.key = key;
    previous.mutate = mutate;
    return;
  }
  if (!isVisible(el) || el.closest('[hidden]')) { mutate(); return; }
  const job = { key, mutate, animation: null, phase: 'out' };
  contentJobs.set(el, job);
  const runIn = () => {
    job.mutate();
    job.phase = 'in';
    const shift = prefersReducedMotion() || !rise ? {} : { translate: `0px ${Math.min(8, rise)}px` };
    const from = { opacity: 0, ...shift };
    const to = { opacity: 1, ...('translate' in shift ? { translate: '0px 0px' } : {}) };
    const old = job.animation;
    job.animation = el.animate([from, to], { duration: duration(durIn), easing: easing(), fill: 'both' });
    old?.cancel();
    job.animation.onfinish = () => {
      if (contentJobs.get(el) !== job) return;
      const applied = job.appliedKey;
      const nextKey = job.key, nextMutation = job.mutate;
      contentJobs.delete(el);
      job.animation.cancel();
      if (applied !== nextKey) replaceContent(el, nextKey, nextMutation, { durOut, durIn, rise });
    };
    job.appliedKey = job.key;
  };
  if (presence.has(el)) {
    mutate();
    contentJobs.delete(el);
    return;
  }
  job.animation = el.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: duration(durOut), easing: easing(), fill: 'both'
  });
  job.animation.onfinish = () => {
    if (contentJobs.get(el) === job) runIn();
  };
}
export function swapText(el, text, opts = {}) {
  if (!el || (!contentJobs.has(el) && el.textContent === String(text))) return;
  replaceContent(el, String(text), () => { el.textContent = text; }, opts);
}
/**
 * Presenta texto progresivamente cuando la interfaz recibe actualizaciones.
 */
export function streamText(el, text) {
  if (!el) return;
  const value = String(text);
  const job = contentJobs.get(el);
  if (job) {
    job.key = value;
    job.mutate = () => { el.textContent = value; };
    if (job.phase === 'in') { job.mutate(); job.appliedKey = value; }
  } else if (el.textContent !== value) el.textContent = value;
}
export function swapTextRise(el, text, opts = {}) { swapText(el, text, { rise: 6, ...opts }); }
export function countTo(el, target, { suffix = '%' } = {}) {
  swapText(el, `${target}${suffix}`);
}
export function flow(container, mutate) {
  replaceContent(container, Symbol('content'), mutate);
}

/**
 * Distribuye el inicio de las animaciones de varios elementos.
 */
export function stagger(items, opts = {}) {
  items?.slice(0, 6).forEach((item) => {
    for (const el of Array.isArray(item) ? item : [item]) {
      if (!el || el.hidden || presence.has(el)) continue;
      cancelAccent(el);
      const animation = el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: duration(opts.dur ?? 180), easing: easing()
      });
      accents.set(el, animation);
      animation.onfinish = () => { if (accents.get(el) === animation) accents.delete(el); };
    }
  });
}
/**
 * Emite un énfasis breve sin modificar el estado permanente del componente.
 */
export function pulse(el, { scale = 1.04, dur = 220 } = {}) {
  if (!el || el.hidden || prefersReducedMotion() || presence.has(el)) return;
  cancelAccent(el);
  const animation = el.animate([{ scale: '1' }, { scale: String(Math.min(scale, 1.12)) }, { scale: '1' }], {
    duration: duration(dur), easing: easing()
  });
  accents.set(el, animation);
  animation.onfinish = () => { if (accents.get(el) === animation) accents.delete(el); };
}
/**
 * Sugiere una acción con un desplazamiento sutil y reversible.
 */
export function nudge(el, { dur = 200, distance = 2 } = {}) {
  if (!el || el.hidden || prefersReducedMotion() || presence.has(el)) return;
  cancelAccent(el);
  const animation = el.animate([{ translate: '0px' }, { translate: `${-Math.min(distance, 2)}px` }, { translate: '0px' }], {
    duration: duration(dur), easing: easing()
  });
  accents.set(el, animation);
  animation.onfinish = () => { if (accents.get(el) === animation) accents.delete(el); };
}


const tweens = new Map();

const TWEEN_EASE = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
};

/**
 * Registra la interpolación temporal de una propiedad y su callback de cierre.
 */
export function tween(key, { from, to, dur = 400, delay = 0, ease = 'out', apply, onDone = null }) {
  if (!key || typeof apply !== 'function') return;

  if (prefersReducedMotion()) {
    tweens.delete(key);
    apply(to);
    onDone?.();
    return;
  }

  apply(from);
  tweens.set(key, {
    from,
    to,
    dur: dur / 1000,
    delay: delay / 1000,
    ease: TWEEN_EASE[ease] ?? TWEEN_EASE.out,
    apply,
    onDone,
    elapsed: 0
  });
}

/**
 * Actualiza un tween en el fotograma vigente y detecta su finalización.
 */
function stepTween(key, state, dt) {
  state.elapsed += dt;
  if (state.elapsed < state.delay) return;

  const t = Math.min((state.elapsed - state.delay) / state.dur, 1);
  state.apply(state.from + (state.to - state.from) * state.ease(t));

  if (t >= 1) {
    tweens.delete(key);
    state.onDone?.();
  }
}


const EPS_REL = 0.01;
const EPS_POS_ABS = 0.5;
const EPS_SCALE_ABS = 0.0005;
const EPS_QUAT_ANGLE = 0.002;

const poses = new Map();

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInQuad(t) {
  return t * t;
}

/**
 * Programa una pose espacial para una pieza 3D.
 */
export function pose(object, target, opts = {}) {
  if (!object) return;

  const {
    mode = 'settle',
    tau = 0.16,
    duration = 300,
    onArrive = null
  } = opts;

  const state = {
    mode,
    tau,
    duration: duration / 1000,
    onArrive,
    position: target.position ? target.position.clone() : null,
    quaternion: target.quaternion ? target.quaternion.clone() : null,
    scale: typeof target.scale === 'number' ? target.scale : null,
    startPosition: object.position.clone(),
    startQuaternion: object.quaternion.clone(),
    startScale: object.scale.x,
    posDist: target.position ? object.position.distanceTo(target.position) : 0,
    quatAngle: target.quaternion
      ? 2 * Math.acos(Math.min(1, Math.abs(object.quaternion.dot(target.quaternion))))
      : 0,
    scaleDist: typeof target.scale === 'number' ? Math.abs(object.scale.x - target.scale) : 0,
    progress: 0
  };

  if (prefersReducedMotion()) {
    arrive(object, state);
    return;
  }

  poses.set(object, state);
}

/**
 * Interrumpe una pose pendiente sin afectar otras propiedades de la escena.
 */
export function cancelPose(object) {
  poses.delete(object);
}

export function isPosing(object) {
  return object ? poses.has(object) : false;
}

function snapToTarget(object, state) {
  if (state.position) object.position.copy(state.position);
  if (state.quaternion) {
    object.quaternion.copy(state.quaternion);
    object.rotation.setFromQuaternion(state.quaternion);
  }
  if (typeof state.scale === 'number') object.scale.setScalar(state.scale);
}

function arrive(object, state) {
  poses.delete(object);
  snapToTarget(object, state);
  if (state.onArrive) state.onArrive();
}

function settleStep(object, state, dt) {
  const k = 1 - Math.exp(-dt / state.tau);

  if (state.position) object.position.lerp(state.position, k);
  if (state.quaternion) object.quaternion.slerp(state.quaternion, k);
  if (typeof state.scale === 'number') {
    object.scale.setScalar(THREE.MathUtils.lerp(object.scale.x, state.scale, k));
  }

  if (state.position) {
    const threshold = Math.max(EPS_POS_ABS, EPS_REL * state.posDist);
    if (object.position.distanceTo(state.position) > threshold) return;
  }

  if (state.quaternion) {
    const angle = 2 * Math.acos(Math.min(1, Math.abs(object.quaternion.dot(state.quaternion))));
    if (angle > Math.max(EPS_QUAT_ANGLE, EPS_REL * state.quatAngle)) return;
  }

  if (typeof state.scale === 'number') {
    const threshold = Math.max(EPS_SCALE_ABS, EPS_REL * state.scaleDist);
    if (Math.abs(object.scale.x - state.scale) > threshold) return;
  }

  arrive(object, state);
}

function timedStep(object, state, dt) {
  state.progress = Math.min(state.progress + dt / state.duration, 1);
  const eased = state.mode === 'exit' ? easeInQuad(state.progress) : easeInOutCubic(state.progress);

  if (state.position) {
    object.position.lerpVectors(state.startPosition, state.position, eased);
  }
  if (state.quaternion) {
    object.quaternion.slerpQuaternions(state.startQuaternion, state.quaternion, eased);
  }
  if (typeof state.scale === 'number') {
    object.scale.setScalar(
      THREE.MathUtils.lerp(state.startScale, state.scale, eased)
    );
  }

  if (state.progress >= 1) arrive(object, state);
}

let lastFrameTime = null;

/**
 * Avanza las animaciones espaciales activas usando el tiempo del render.
 */
export function updatePoses() {
  const now = performance.now();

  if (poses.size === 0 && tweens.size === 0) {
    lastFrameTime = now;
    return;
  }

  const dt = lastFrameTime === null ? 0.016 : Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  for (const [object, state] of poses) {
    if (state.mode === 'settle') settleStep(object, state, dt);
    else timedStep(object, state, dt);
  }

  for (const [key, state] of tweens) {
    stepTween(key, state, dt);
  }
}
