/**
 * Reproductor de respuestas de voz en flujo. Decodifica los fragmentos PCM de Gemini y los programa sin
 * huecos perceptibles mediante Web Audio.
 */


import { PLAYBACK_END_DEBOUNCE_MS } from '../config.js';

/**
 * Mantiene el contexto de audio, la siguiente posición de reproducción y los avisos de fin de respuesta.
 */
export class PCMPlayer {

  constructor() {
    this._context = null;
    this._nextStartTime = 0;
    this._activeSources = [];
    this._onPlaybackEnd = null;
    this._endTimer = null;
  }

  /**
   * Crea el contexto de Web Audio bajo demanda y reutiliza el existente.
   */
  _ensureContext() {
    if (!this._context || this._context.state === 'closed') {
      this.stopAndClear();
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctx) throw new DOMException('Audio no soportado', 'NotSupportedError');
      this._context = new Ctx({ sampleRate: 24000 });
      this._nextStartTime = 0;
    }
    if (this._context.state !== 'running') {
      this._context.resume().catch(err => console.warn('[PCMPlayer] No se pudo reanudar audio:', err));
    }
    return this._context;
  }

  /**
   * Reanuda el audio dentro de una interacción del usuario para satisfacer las restricciones móviles.
   */
  unlock() {
    this._ensureContext();
  }

  /**
   * Decodifica el bloque PCM recibido y lo encadena temporalmente detrás del sonido pendiente.
   */
  enqueue(base64Chunk) {
    let binary;
    try { binary = atob(base64Chunk); }
    catch { console.warn('[PCMPlayer] Base64 inválido; descartado.'); return; }
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (bytes.byteLength === 0 || bytes.byteLength % 2 !== 0) {
      console.warn('[PCMPlayer] Chunk PCM16 vacío o truncado; descartado.');
      return;
    }
    const context = this._ensureContext();
    this._clearEndTimer();
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);

    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }

    const audioBuffer = context.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime, this._nextStartTime);

    source.start(startAt);
    this._nextStartTime = startAt + audioBuffer.duration;

    this._activeSources.push(source);

    source.onended = () => {
      source.disconnect();
      this._activeSources = this._activeSources.filter((s) => s !== source);
      if (this._activeSources.length === 0) this._scheduleEndNotice();
    };
  }

  /**
   * Interrumpe el audio actual, vacía la cola y restablece el estado de reproducción.
   */
  stopAndClear() {
    this._clearEndTimer();

    this._activeSources.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // La reproducción puede finalizar naturalmente antes de recibir una interrupción.
      }
    });
    this._activeSources = [];

    if (this._context) {
      this._nextStartTime = this._context.currentTime;
    }
  }

  get isPlaying() {
    return this._activeSources.length > 0;
  }

  set onPlaybackEnd(callback) {
    this._onPlaybackEnd = callback;
  }

  /**
   * Retrasa el aviso de fin para no interpretar como silencio los intervalos breves entre paquetes.
   */
  _scheduleEndNotice() {
    this._clearEndTimer();
    this._endTimer = setTimeout(() => {
      this._endTimer = null;
      if (this._activeSources.length === 0 && this._onPlaybackEnd) {
        this._onPlaybackEnd();
      }
    }, PLAYBACK_END_DEBOUNCE_MS);
  }

  /**
   * Cancela el aviso pendiente de finalización cuando llega nuevo audio o se interrumpe el turno.
   */
  _clearEndTimer() {
    if (this._endTimer !== null) {
      clearTimeout(this._endTimer);
      this._endTimer = null;
    }
  }
}
