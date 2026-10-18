/**
 * Señales hápticas y sonoras de la interfaz. Gestiona permisos de audio y ofrece respuestas breves a
 * acciones relevantes sin bloquear la experiencia.
 */


let enabled = { haptics: true, sound: true };
let audioContext = null;

/**
 * Actualiza las preferencias de vibración y sonido proporcionadas por la experiencia.
 */
export function configureFeedback({ haptics = true, sound = true } = {}) {
  enabled = { haptics, sound };
}

/**
 * Inicializa el contexto sonoro tras una acción válida del visitante.
 */
export function unlockAudio() {
  if (!enabled.sound) return;
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return;
    }
  }
  if (audioContext.state !== 'running' && audioContext.state !== 'closed') {
    audioContext.resume().catch(() => {});
  }
}

/**
 * Solicita vibración solamente si el dispositivo admite la API y está habilitada.
 */
function vibrate(pattern) {
  if (enabled.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

/**
 * Sintetiza una señal breve para confirmar acciones sin cargar archivos de audio.
 */
function tone(frequency, durationMs = 90, endFrequency = null) {
  if (!enabled.sound || !audioContext || audioContext.state !== 'running') return;

  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, now);
  if (endFrequency) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, now + durationMs / 1000);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

  osc.connect(gain).connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.05);
}

export const feedback = {
  targetFound() {
    vibrate(18);
    tone(440, 90);
  },
  calibrationDone() {
    vibrate(18);
    tone(587, 90);
  },
  modelReady() {
    tone(494, 200, 370);
  },
  listeningStart() {
    vibrate(10);
  },
  error() {
    vibrate([40, 60, 40]);
  }
};
