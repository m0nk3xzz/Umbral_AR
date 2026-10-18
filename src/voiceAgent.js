/**
 * Cliente de conversación en tiempo real con Gemini Live. Controla credenciales efímeras, micrófono,
 * turnos de voz, respuestas PCM y recuperación frente a cortes.
 */


import { GoogleGenAI, Modality } from '@google/genai';
import { PCMPlayer } from './audio/pcmPlayer.js';
import { getLang } from './i18n.js';
import { TOKEN_FETCH_TIMEOUT_MS, LIVE_CONNECT_TIMEOUT_MS } from './config.js';


const RECORDER_WORKLET_URL = '/pcm-recorder-worklet.js';

export const VoiceState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error'
};

export const VoiceErrorDetail = {
  MIC_DENIED: 'micDenied',
  MIC_MISSING: 'micMissing',
  NETWORK: 'network',
  RATE_LIMITED: 'rateLimited',
  SESSION_LOST: 'sessionLost',
  UNKNOWN: 'unknown'
};

/**
 * Diferencia la expiración de una espera de los errores de la conexión.
 */
class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Limita la espera de una operación de red sin afirmar que se canceló por sí misma.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Convierte errores técnicos en categorías que la interfaz puede explicar y recuperar.
 */
function classifyError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return VoiceErrorDetail.MIC_DENIED;
  if (
    err?.name === 'NotFoundError' ||
    err?.name === 'NotReadableError' ||
    err?.name === 'OverconstrainedError' ||
    err?.name === 'NotSupportedError'
  ) {
    return VoiceErrorDetail.MIC_MISSING;
  }
  if (err?.status === 429) return VoiceErrorDetail.RATE_LIMITED;
  if (err instanceof TypeError) return VoiceErrorDetail.NETWORK;
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return VoiceErrorDetail.NETWORK;
  if (typeof err?.status === 'number' && err.status >= 500) return VoiceErrorDetail.NETWORK;
  return VoiceErrorDetail.UNKNOWN;
}

/**
 * El estado de voz es único para evitar que una conexión antigua actualice una interacción nueva.
 */
let state = VoiceState.IDLE;
let stateDetail = null;
let onStateChange = null;
let onTranscript = null;
let onHoldHint = null;

/**
 * Publica un único estado de voz y su diagnóstico asociado.
 */
function setState(next, detail = null) {
  state = next;
  stateDetail = next === VoiceState.ERROR ? detail ?? VoiceErrorDetail.UNKNOWN : null;
  if (onStateChange) onStateChange(state, stateDetail);
}

/**
 * Entrega fragmentos de transcripción a quien representa la conversación.
 */
function emitTranscript(payload) {
  if (onTranscript) onTranscript(payload);
}

let activeEntry = null;
let activeStage = 'discovery';

let liveSession = null;
let liveSessionObjectId = null;
let sessionGeneration = 0;
let pendingOpen = null;

const intentionallyClosed = new WeakSet();

let isHolding = false;
let talkSequence = 0;

let recordContext = null;
let workletLoaded = false;
let recorderNode = null;
let micStream = null;
let micGeneration = 0;
let workletLoadPromise = null;
let micSourceNode = null;
let recorderSilentGain = null;
let pendingCaptureStop = Promise.resolve();
const drainingCaptures = new Set();
let flushSequence = 0;
let inputMode = null;
let inputModeGeneration = 0;

/**
 * Determina si el turno activo se envía mediante micrófono o texto.
 */
function selectInputMode(mode) {
  if (mode !== inputMode) { inputMode = mode; inputModeGeneration++; }
  return inputModeGeneration;
}

const player = new PCMPlayer();

player.onPlaybackEnd = () => {
  if (state === VoiceState.SPEAKING) setState(VoiceState.IDLE);
};


/**
 * Registra callbacks para mantener voz e interfaz desacopladas.
 */
export function initVoiceAgent({ onStateChange: stateCallback, onTranscript: transcriptCallback, onHoldHint: holdHintCallback } = {}) {
  onStateChange = stateCallback ?? null;
  onTranscript = transcriptCallback ?? null;
  onHoldHint = holdHintCallback ?? null;

  if (onStateChange) onStateChange(state);
}

/**
 * Prepara la salida de sonido durante el gesto de inicio del visitante.
 */
export function warmUpAudio() {
  player.unlock();
}

/**
 * Reanuda el contexto suspendido antes de reproducir la respuesta.
 */
export function resumeAudio() {
  try { player.unlock(); }
  catch (err) { console.warn('Audio no disponible al volver:', err); }
  if (recordContext && recordContext.state !== 'running' && recordContext.state !== 'closed') {
    recordContext.resume().catch(() => {});
  }
}

export function getVoiceState() {
  return state;
}

export function getVoiceErrorDetail() {
  return stateDetail;
}

/**
 * Asocia el diálogo con la pieza y etapa actualmente invocadas.
 */
export function setActiveObject(entry, source = 'marker') {
  const stage = source === 'geo' ? 'onsite' : 'discovery';
  if (activeEntry?.id === entry.id && activeStage === stage) return;
  sessionGeneration++;
  talkSequence++;
  isHolding = false;
  releaseMic();
  closeSession();
  activeEntry = entry;
  activeStage = stage;
  setState(VoiceState.IDLE);
}

/**
 * Elimina el contexto de pieza e invalida respuestas que lleguen tarde.
 */
export function clearActiveObject() {
  sessionGeneration++;
  activeEntry = null;
  isHolding = false;
  talkSequence++;
  stopMicCapture();
  releaseMic();
  flushTranscript('user');
  flushTranscript('model');
  closeSession();
  setState(VoiceState.IDLE);
}

/**
 * Abre el turno de micrófono y protege la secuencia frente a pulsaciones interrumpidas.
 */
export async function startTalking() {
  if (!activeEntry || isHolding) return;
  isHolding = true;
  const sequence = ++talkSequence;
  const entry = activeEntry;
  const generation = sessionGeneration;
  const mode = selectInputMode('voice');
  const isCurrent = () => sequence === talkSequence &&
    generation === sessionGeneration && mode === inputModeGeneration;

  try {
    if (player.isPlaying) player.stopAndClear();
    player.unlock();
    const micReady = prepareMic();
    setState(VoiceState.CONNECTING);
    const sessionReady = !liveSession || liveSessionObjectId !== entry.id
      ? openSession(entry) : Promise.resolve(liveSession);
    const [, micAvailable] = await Promise.all([sessionReady, micReady, pendingCaptureStop]);
    if (!isCurrent()) return;
    if (!micAvailable || !isHolding || activeEntry?.id !== entry.id) {
      releaseMic();
      setState(VoiceState.IDLE);
      if (!isHolding) onHoldHint?.();
      return;
    }
    attachRecorderIfSessionAlive();
  } catch (err) {
    if (!isCurrent()) return;
    console.error('Error iniciando la escucha:', err);
    isHolding = false;
    releaseMic();
    setState(VoiceState.ERROR, classifyError(err));
  }
}

function attachRecorderIfSessionAlive() {
  if (!liveSession) {
    releaseMic();
    isHolding = false;
    setState(VoiceState.ERROR, VoiceErrorDetail.SESSION_LOST);
    return;
  }
  attachRecorder();
  if (safeSend({ activityStart: {} })) setState(VoiceState.LISTENING);
}

/**
 * Envía preguntas escritas vinculadas a la pieza vigente.
 */
export async function sendText(text) {
  const entry = activeEntry;
  const generation = sessionGeneration;
  const question = typeof text === 'string' ? text.trim() : '';
  if (!entry || !question) return false;
  const mode = selectInputMode('text');
  const isCurrent = () => generation === sessionGeneration && mode === inputModeGeneration &&
    activeEntry?.id === entry.id;

  try {
    player.unlock();
    if (player.isPlaying) player.stopAndClear();
    const captureStopped = stopTalking({ showHint: false });
    const sessionReady = !liveSession || liveSessionObjectId !== entry.id
      ? openSession(entry) : Promise.resolve(liveSession);
    setState(VoiceState.CONNECTING);
    await Promise.all([sessionReady, captureStopped]);
    if (!isCurrent()) return false;
    if (!liveSession || liveSessionObjectId !== entry.id) {
      setState(VoiceState.ERROR, VoiceErrorDetail.SESSION_LOST);
      return false;
    }
    liveSession.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: question }] }], turnComplete: true
    });
    emitTranscript({ role: 'user', text: question, final: true });
    setState(VoiceState.PROCESSING);
    return true;
  } catch (err) {
    if (!isCurrent()) return false;
    console.error('[voiceAgent] No se pudo enviar el texto:', err);
    releaseMic();
    setState(VoiceState.ERROR, classifyError(err));
    return false;
  }
}

/**
 * Detiene la captura y notifica el fin del turno al servidor.
 */
export function stopTalking({ showHint = true } = {}) {
  const wasHolding = isHolding;
  isHolding = false;
  talkSequence++;
  const wasConnecting = state === VoiceState.CONNECTING;
  const hasRecorder = recorderNode !== null;
  if (!hasRecorder) {
    micGeneration++;
    micStream?.getTracks().forEach(track => track.stop());
    micStream = null;
    if (wasConnecting && wasHolding) {
      setState(VoiceState.IDLE);
      if (showHint) onHoldHint?.();
    }
    return pendingCaptureStop;
  }

  const node = recorderNode;
  const source = micSourceNode;
  const gain = recorderSilentGain;
  const owner = liveSession;
  const generation = sessionGeneration;
  recorderNode = micSourceNode = recorderSilentGain = null;
  micGeneration++;
  try { source?.disconnect(); } catch {}
  micStream?.getTracks().forEach(track => track.stop());
  micStream = null;
  if (state !== VoiceState.ERROR) setState(VoiceState.PROCESSING);

  const id = ++flushSequence;
  pendingCaptureStop = new Promise(resolve => {
    let settled = false;
    let timer;
    const capture = { cancel: () => finish(false, true) };
    const finish = (flushed, canceled = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      drainingCaptures.delete(capture);
      if (!canceled && owner === liveSession && generation === sessionGeneration) {
        if (!flushed) console.warn('[voiceAgent] Vaciado PCM sin ACK; se cierra el turno.');
        safeSend({ activityEnd: {} }, owner);
      }
      node.port.onmessage = null;
      node.port.onmessageerror = null;
      try { node.disconnect(); } catch {}
      try { gain?.disconnect(); } catch {}
      node.port.close?.();
      resolve();
    };
    const sendAudio = node.port.onmessage;
    node.port.onmessage = event => {
      if (event.data?.type === 'flushed' && event.data.id === id) finish(true);
      else sendAudio?.(event);
    };
    node.port.onmessageerror = () => finish(false);
    drainingCaptures.add(capture);
    timer = setTimeout(() => finish(false), 250);
    try { node.port.postMessage({ type: 'flush', id }); }
    catch { finish(false); }
  });
  return pendingCaptureStop;
}


/**
 * Solicita al backend una credencial temporal sin exponer claves permanentes.
 */
async function fetchEphemeralToken(objectId, stage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId, locale: getLang(), stage }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const err = new Error(body.error || `Token request failed: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirma que una respuesta aún pertenece a la pieza y generación activas.
 */
function isCurrentObject(entry, generation) {
  return sessionGeneration === generation && activeEntry?.id === entry.id;
}

/**
 * Cierra conexiones tardías que nunca llegaron a tomar posesión de la sesión.
 */
function closeUnownedSession(session) {
  if (!session) return;
  intentionallyClosed.add(session);
  try { session.close(); } catch { /* El cierre puede haber ocurrido antes por un evento asíncrono. */ }
}

/**
 * Reutiliza o crea una conexión de Gemini Live cuando la sesión lo necesita.
 */
function openSession(entry) {
  const generation = sessionGeneration;
  if (liveSession && liveSessionObjectId === entry.id) return Promise.resolve(liveSession);
  if (pendingOpen && pendingOpen.entryId === entry.id && pendingOpen.generation === generation) {
    return pendingOpen.promise;
  }
  if (liveSession) closeSession();

  const opening = { entryId: entry.id, generation, promise: null };
  pendingOpen = opening;
  opening.promise = connectSession(entry, generation).finally(() => {
    if (pendingOpen === opening) pendingOpen = null;
  });
  return opening.promise;
}

/**
 * Negocia la conexión y descarta resultados de solicitudes antiguas.
 */
async function connectSession(entry, generation) {
  const { token, model } = await fetchEphemeralToken(entry.id, activeStage);
  if (!isCurrentObject(entry, generation)) return null;
  if (!token || !model) {
    throw new Error('Respuesta de /api/token incompleta (falta token o model).');
  }

  const ai = new GoogleGenAI({
    apiKey: token,
    httpOptions: { apiVersion: 'v1alpha' }
  });
  let thisSession = null;
  const isStale = () =>
    !thisSession || !isCurrentObject(entry, generation) ||
    intentionallyClosed.has(thisSession) || liveSession !== thisSession;

  const connectPromise = ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO]
    },
    callbacks: {
      onopen: () => console.log('[voiceAgent] Sesión Live abierta.'),
      onmessage: (message) => {
        if (!isStale()) handleServerMessage(message);
      },
      onerror: (e) => {
        if (isStale()) return;
        console.error('[voiceAgent] Error de Live API:', e?.message ?? e);
        closeSession();
        releaseMic();
        setState(VoiceState.ERROR, VoiceErrorDetail.SESSION_LOST);
      },
      onclose: (e) => {
        if (isStale()) return;
        console.log('[voiceAgent] Sesión Live cerrada:', e?.reason ?? '');
        const wasMidConversation = state !== VoiceState.IDLE;
        liveSession = null;
        liveSessionObjectId = null;
        discardTranscriptBuffers();
        player.stopAndClear();
        releaseMic();
        if (wasMidConversation) setState(VoiceState.ERROR, VoiceErrorDetail.SESSION_LOST);
      }
    }
  });

  try {
    thisSession = await withTimeout(connectPromise, LIVE_CONNECT_TIMEOUT_MS, 'Live API tardó demasiado en conectar');
  } catch (err) {
    connectPromise.then(closeUnownedSession).catch(() => {});
    throw err;
  }

  if (!isCurrentObject(entry, generation) || liveSession) {
    closeUnownedSession(thisSession);
    return null;
  }
  liveSession = thisSession;
  liveSessionObjectId = entry.id;
  return thisSession;
}

/**
 * Cierra explícitamente el canal de voz y evita eventos residuales.
 */
function closeSession() {
  const session = liveSession;
  discardTranscriptBuffers();

  liveSession = null;
  liveSessionObjectId = null;

  if (session) {
    intentionallyClosed.add(session);
    try {
      session.close();
    } catch {
      // Una conexión anterior puede haberse cerrado mientras llegaba este aviso.
    }
  }

  player.stopAndClear();
}

/**
 * Envía mensajes solo si la sesión todavía es la propietaria del canal.
 */
function safeSend(payload, owner = liveSession) {
  if (!owner || owner !== liveSession) return false;
  try {
    owner.sendRealtimeInput(payload);
    return true;
  } catch (err) {
    console.warn('[voiceAgent] No se pudo enviar:', err);
    talkSequence++;
    isHolding = false;
    closeSession();
    releaseMic();
    setState(VoiceState.ERROR, VoiceErrorDetail.SESSION_LOST);
    return false;
  }
}

let inputTranscriptBuffer = '';
let outputTranscriptBuffer = '';

/**
 * Limpia texto provisional para evitar mezclar turnos sucesivos.
 */
function discardTranscriptBuffers() {
  inputTranscriptBuffer = '';
  outputTranscriptBuffer = '';
}

/**
 * Confirma y entrega el texto acumulado para el hablante indicado.
 */
function flushTranscript(role) {
  if (role === 'user' && inputTranscriptBuffer) {
    emitTranscript({ role: 'user', text: inputTranscriptBuffer, final: true });
    inputTranscriptBuffer = '';
  }
  if (role === 'model' && outputTranscriptBuffer) {
    emitTranscript({ role: 'model', text: outputTranscriptBuffer, final: true });
    outputTranscriptBuffer = '';
  }
}

/**
 * Procesa audio, transcripciones y cambios de turno recibidos de Gemini.
 */
function handleServerMessage(message) {
  const content = message.serverContent;
  if (!content) return;

  if (content.interrupted) {
    player.stopAndClear();
    flushTranscript('model');
    return;
  }

  if (content.inputTranscription?.text) {
    inputTranscriptBuffer += content.inputTranscription.text;
    emitTranscript({ role: 'user', text: inputTranscriptBuffer, final: false });
  }

  if (content.outputTranscription?.text) {
    outputTranscriptBuffer += content.outputTranscription.text;
    emitTranscript({ role: 'model', text: outputTranscriptBuffer, final: false });
  }

  const userIsTalking = state === VoiceState.LISTENING || state === VoiceState.CONNECTING;

  if (content.modelTurn?.parts && !userIsTalking) {
    for (const part of content.modelTurn.parts) {
      if (part.inlineData?.data) {
        if (state !== VoiceState.SPEAKING) setState(VoiceState.SPEAKING);
        try { player.enqueue(part.inlineData.data); }
        catch (err) {
          player.stopAndClear();
          setState(VoiceState.ERROR, classifyError(err));
          return;
        }
      }
    }
  }

  if (content.turnComplete && !userIsTalking) {
    flushTranscript('user');
    flushTranscript('model');
    if (!player.isPlaying) setState(VoiceState.IDLE);
  }
}


/**
 * Solicita acceso al micrófono y configura captura con formato PCM esperado.
 */
async function prepareMic() {
  const generation = micGeneration;
  if (!recordContext || recordContext.state === 'closed') {
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) throw new DOMException('Audio no soportado', 'NotSupportedError');
    recordContext = new Ctx({ sampleRate: 16000 });
    workletLoaded = false;
    workletLoadPromise = null;
  }
  const resumePromise = recordContext.state !== 'running'
    ? recordContext.resume()
    : Promise.resolve();

  if (micStream && !micStream.getAudioTracks().some((track) => track.readyState === 'live')) {
    micStream = null;
  }

  const rawStream = micStream
    ? Promise.resolve(micStream)
    : navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

  const streamPromise = rawStream.then((stream) => {
    if (generation !== micGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    micStream = stream;
    return stream;
  });

  if (!workletLoaded && !workletLoadPromise) {
    workletLoadPromise = recordContext.audioWorklet.addModule(RECORDER_WORKLET_URL)
      .then(() => { workletLoaded = true; })
      .catch((err) => { workletLoadPromise = null; throw err; });
  }
  const workletPromise = workletLoaded ? Promise.resolve() : workletLoadPromise;

  try {
    const [stream] = await Promise.all([streamPromise, resumePromise, workletPromise]);
    return generation === micGeneration && Boolean(stream);
  } catch (err) {
    if (generation === micGeneration) releaseMic();
    throw err;
  }
}

/**
 * Enlaza el procesador de audio con el canal Live activo.
 */
function attachRecorder() {
  stopMicCapture();

  micSourceNode = recordContext.createMediaStreamSource(micStream);
  recorderNode = new AudioWorkletNode(recordContext, 'pcm-recorder');

  const owner = liveSession;
  const generation = sessionGeneration;
  recorderNode.port.onmessage = (event) => {
    if (!(event.data instanceof ArrayBuffer) || generation !== sessionGeneration || owner !== liveSession) return;
    safeSend({
      audio: {
        data: arrayBufferToBase64(event.data),
        mimeType: 'audio/pcm;rate=16000'
      }
    }, owner);
  };

  recorderSilentGain = recordContext.createGain();
  recorderSilentGain.gain.value = 0;
  micSourceNode.connect(recorderNode);
  recorderNode.connect(recorderSilentGain);
  recorderSilentGain.connect(recordContext.destination);
}

/**
 * Solicita vaciar o parar la captura sin perder paquetes pendientes.
 */
function stopMicCapture() {
  if (recorderNode) {
    recorderNode.port.onmessage = null;
    recorderNode.port.onmessageerror = null;
    recorderNode.port.close?.();
    try { recorderNode.disconnect(); } catch {}
    recorderNode = null;
  }
  if (micSourceNode) {
    try { micSourceNode.disconnect(); } catch {}
    micSourceNode = null;
  }
  if (recorderSilentGain) {
    try { recorderSilentGain.disconnect(); } catch {}
    recorderSilentGain = null;
  }
  // Se cierra la pista del micrófono al terminar cada pulsación para evitar capturas residuales.
}

/**
 * Cierra pistas, conexiones y procesador de audio después del turno.
 */
export function releaseMic() {
  micGeneration++;
  for (const capture of [...drainingCaptures]) capture.cancel();
  pendingCaptureStop = Promise.resolve();
  stopMicCapture();
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
}

/**
 * Codifica bytes de audio para enviarlos en el formato requerido por la API.
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
