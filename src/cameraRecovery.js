/**
 * Supervisa la cámara cuando la pestaña cambia de estado. Comprueba el avance de fotogramas y recupera
 * el flujo sin reemplazar el elemento de vídeo que usan MindAR y MediaPipe.
 */


import {
  CAMERA_RECHECK_DELAY_MS,
  CAMERA_FRAME_PROBE_MS,
  CAMERA_MAX_ATTEMPTS,
  CAMERA_RETRY_DELAY_MS
} from './config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Instala observadores para detectar una cámara congelada y restaurarla de forma acotada.
 */
export function watchCamera(video, { onRecovered, onFailure } = {}) {
  let recovering = false;
  let recheckTimer = null;
  let stopped = false;
  const trackListeners = new Map();

  function unbindTracks() {
    for (const [track, listener] of trackListeners) {
      track.removeEventListener('ended', listener);
    }
    trackListeners.clear();
  }

  /**
   * Busca una pista de vídeo vigente dentro del flujo asociado al elemento.
   */
  function liveTrack() {
    const track = video.srcObject?.getVideoTracks?.()[0];
    return track && track.readyState === 'live' ? track : null;
  }

  /**
   * Verifica que el vídeo avanza realmente y no conserva un fotograma inmóvil.
   */
  async function framesAdvance(ms = CAMERA_FRAME_PROBE_MS) {
    const startTime = video.currentTime;
    await sleep(ms);
    return video.currentTime > startTime;
  }

  /**
   * Combina el estado de la pista y el avance de imagen para determinar si hace falta recuperar.
   */
  async function isHealthy() {
    if (!liveTrack()) return false;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        // Si el navegador bloquea la reproducción, la comprobación de avance detectará la inmovilidad.
      }
    }
    return framesAdvance();
  }

  function bindTrack(stream) {
    unbindTracks();
    if (stopped) return;
    stream.getVideoTracks().forEach((track) => {
      const listener = () => scheduleCheck('track-ended');
      track.addEventListener('ended', listener);
      trackListeners.set(track, listener);
    });
  }

  /**
   * Solicita un flujo nuevo manteniendo el mismo elemento de vídeo que consumen los detectores.
   */
  async function restartStream() {
    const oldStream = video.srcObject;
    const width = video.videoWidth;
    const height = video.videoHeight;

    oldStream?.getTracks().forEach((track) => track.stop());

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        ...(width && height ? { width: { ideal: width }, height: { ideal: height } } : {})
      }
    });

    if (stopped || document.hidden) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    video.srcObject = stream;
    bindTrack(stream);
    await video.play();
  }

  /**
   * Decide si recuperar según visibilidad, estado actual e intentos disponibles.
   */
  async function check(reason) {
    if (stopped || recovering || document.hidden) return;
    recovering = true;

    try {
      for (let attempt = 0; attempt < CAMERA_MAX_ATTEMPTS; attempt++) {
        if (stopped || document.hidden) return;
        if (await isHealthy()) return;
        if (stopped || document.hidden) return;

        console.warn(`Cámara congelada (${reason}); reiniciando stream, intento ${attempt + 1}.`);
        try {
          await restartStream();
          if (await framesAdvance(600) && !stopped && !document.hidden) {
            console.log('Cámara recuperada.');
            onRecovered?.(reason);
            return;
          }
        } catch (err) {
          console.warn('No se pudo reiniciar la cámara:', err);
          if (err?.name === 'NotAllowedError' || err?.name === 'NotFoundError') {
            if (!stopped && !document.hidden) onFailure?.(err);
            return;
          }
        }

        await sleep(CAMERA_RETRY_DELAY_MS);
      }
      if (!stopped && !document.hidden) onFailure?.(new Error('No se pudo recuperar la cámara.'));
    } finally {
      recovering = false;
    }
  }

  /**
   * Pospone la revisión para dejar que el navegador reactive sus dispositivos al volver al primer plano.
   */
  function scheduleCheck(reason) {
    if (stopped) return;
    clearTimeout(recheckTimer);
    recheckTimer = setTimeout(() => check(reason), CAMERA_RECHECK_DELAY_MS);
  }

  const onVisibility = () => {
    if (!document.hidden) scheduleCheck('visible');
  };
  const onPageShow = (event) => {
    if (event.persisted) scheduleCheck('pageshow');
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  if (video.srcObject) bindTrack(video.srcObject);

  return () => {
    stopped = true;
    clearTimeout(recheckTimer);
    unbindTracks();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
  };
}
