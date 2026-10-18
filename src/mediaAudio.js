/**
 * Control del volumen de vídeo integrado con Web Audio. Permite habilitar o silenciar una pieza
 * multimedia y liberar sus conexiones de sonido.
 */


let context = null;
const nodes = new WeakMap();

/**
 * Abre el contexto compartido de audio para piezas multimedia.
 */
function getAudioContext() {
  const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctx) return null;
  if (!context || context.state === 'closed') context = new Ctx();
  return context;
}

/**
 * Activa sonido tras el consentimiento del usuario y prepara el control de ganancia.
 */
export async function enableVideoAudio(video, initialVolume = 0.5, { isCurrent = () => true } = {}) {
  if (!isCurrent()) return null;
  const ctx = getAudioContext();
  if (!ctx) {
    video.muted = false;
    try { video.volume = initialVolume; } catch {}
    return { mode: 'element', volume: initialVolume };
  }

  if (ctx.state !== 'running') await ctx.resume();
  if (!isCurrent()) return null;

  let node = nodes.get(video);
  if (!node) {
    const source = ctx.createMediaElementSource(video);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    node = { source, gain, volume: initialVolume };
    nodes.set(video, node);
  }

  node.volume = initialVolume;
  node.gain.gain.value = initialVolume;
  video.muted = false;
  return { mode: 'webaudio', volume: initialVolume };
}

/**
 * Aplica un nivel de volumen dentro de los límites admitidos.
 */
export function setVideoVolume(video, value) {
  const volume = Math.max(0, Math.min(1, value));
  const node = nodes.get(video);
  if (node) {
    node.volume = volume;
    node.gain.gain.value = volume;
    return volume;
  }
  try { video.volume = volume; } catch {}
  return volume;
}

/**
 * Consulta el nivel vigente sin depender de un valor ausente.
 */
export function getVideoVolume(video, fallback = 0.5) {
  return nodes.get(video)?.volume ?? (Number.isFinite(video?.volume) ? video.volume : fallback);
}

/**
 * Apaga la salida del vídeo cuando otra función necesita prioridad sonora.
 */
export function silenceVideo(video) {
  const node = nodes.get(video);
  if (node) node.gain.gain.value = 0;
  if (video) video.muted = true;
}

/**
 * Recupera el nivel del vídeo que estaba activo antes del silencio temporal.
 */
export function restoreVideoGain(video) {
  const node = nodes.get(video);
  if (node) node.gain.gain.value = node.volume;
}

/**
 * Desconecta nodos de Web Audio y elimina referencias al salir de la pieza.
 */
export function disconnectVideoAudio(video) {
  const node = nodes.get(video);
  if (!node) return;
  try { node.source.disconnect(); } catch {}
  try { node.gain.disconnect(); } catch {}
  nodes.delete(video);
}
