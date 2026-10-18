// Regresiones de la auditoría cruzada (sin npm, red ni navegador).
// Simula respuestas fuera de orden de Gemini Live y permisos getUserMedia.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const voiceStates = [];
const transcripts = [];
const connections = [];
let permissionPending = null;
let gumCalls = 0;

const mock = {
  GoogleGenAI: class {
    constructor() {
      this.live = { connect(options) {
        return new Promise((resolveConnect) => {
          connections.push({ options, resolveConnect });
        });
      } };
    }
  },
  Modality: { AUDIO: 'AUDIO' },
  PCMPlayer: class {
    unlock() {}
    get isPlaying() { return false; }
    stopAndClear() {}
    enqueue() {}
  },
  getLang: () => 'es',
  TOKEN_FETCH_TIMEOUT_MS: 5000,
  LIVE_CONNECT_TIMEOUT_MS: 5000
};

globalThis.__voiceAuditStub = mock;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'fake', model: 'fake-live' }) });
globalThis.AudioContext = class {
  constructor() {
    this.state = 'running';
    this.audioWorklet = { addModule: () => Promise.resolve() };
  }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  resume() { return Promise.resolve(); }
};
globalThis.AudioWorkletNode = class {
  constructor() { this.port = { onmessage: null }; }
  connect() {}
  disconnect() {}
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  mediaDevices: {
    getUserMedia() {
      gumCalls++;
      return new Promise((resolvePermission) => { permissionPending = resolvePermission; });
    }
  }
}});

let source = readFileSync(resolve(root, 'src/voiceAgent.js'), 'utf8');
source = source.replace(/import \{ GoogleGenAI, Modality \} from '@google\/genai';/,
  'const { GoogleGenAI, Modality } = globalThis.__voiceAuditStub;');
source = source.replace(/import \{ PCMPlayer \} from '\.\/audio\/pcmPlayer\.js';/,
  'const { PCMPlayer } = globalThis.__voiceAuditStub;');
source = source.replace(/import \{ getLang \} from '\.\/i18n\.js';/,
  'const { getLang } = globalThis.__voiceAuditStub;');
source = source.replace(/import \{ TOKEN_FETCH_TIMEOUT_MS, LIVE_CONNECT_TIMEOUT_MS \} from '\.\/config\.js';/,
  'const { TOKEN_FETCH_TIMEOUT_MS, LIVE_CONNECT_TIMEOUT_MS } = globalThis.__voiceAuditStub;');
assert(!source.includes("from '@google/genai'"));
const voice = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
voice.initVoiceAgent({ onStateChange: (s) => voiceStates.push(s), onTranscript: (t) => transcripts.push(t) });
const tick = async () => { await new Promise((res) => setImmediate(res)); };
function connectAt(index) {
  const item = connections[index];
  assert(item, `No existe conexión simulada ${index}`);
  const session = {
    closed: 0,
    messages: [],
    input: [],
    close() { this.closed++; },
    sendClientContent(data) { this.messages.push(data); },
    sendRealtimeInput(data) { this.input.push(data); }
  };
  item.session = session;
  item.resolveConnect(session);
  return session;
}

voice.setActiveObject({ id: 'obra-A' });
const first = voice.sendText('pregunta 1');
const second = voice.sendText('pregunta 2');
await tick();
assert.equal(connections.length, 1, 'dos sendText concurrentes solo abren un Live');
const session1 = connectAt(0);
assert.equal(await first, true);
assert.equal(await second, true);
assert.equal(session1.messages.length, 2);
console.log('PASS: conexión Live single-flight');

voice.clearActiveObject();
voice.setActiveObject({ id: 'obra-A' });
const obsolete = voice.sendText('pregunta sobre A');
await tick();
assert.equal(connections.length, 2);
voice.setActiveObject({ id: 'obra-B' });
const current = voice.sendText('pregunta sobre B');
await tick();
assert.equal(connections.length, 3);
const session2 = connectAt(2);
assert.equal(await current, true);
const previous = connectAt(1);
assert.equal(await obsolete, false);
assert.equal(previous.closed, 1);
assert.equal(previous.messages.length, 0);
assert.equal(session2.closed, 0);
assert.equal(session2.messages.length, 1);
connections[1].options.callbacks.onmessage({ serverContent: { outputTranscription: { text: 'viejo' } } });
assert(!transcripts.some((t) => t.text === 'viejo'), 'callbacks obsoletos no deben emitir texto');
console.log('PASS: nueva pieza no recibe sesión, texto ni callbacks de pieza antigua');

connections[2].options.callbacks.onerror({ message: 'fallo terminal' });
assert.equal(session2.closed, 1);
const retry = voice.sendText('reintento');
await tick();
assert.equal(connections.length, 4);
connectAt(3);
assert.equal(await retry, true);
console.log('PASS: error Live no conserva una conexión inutilizable');

voice.clearActiveObject();
voice.setActiveObject({ id: 'obra-A' });
const lateMic = voice.startTalking();
await tick();
assert.equal(gumCalls, 1);
const permit = permissionPending;
voice.clearActiveObject();
const track = { stopped: 0, readyState: 'live', stop() { this.stopped++; } };
permit({ getTracks: () => [track], getAudioTracks: () => [track] });
await tick();
assert.equal(track.stopped, 1, 'stream tardío se debe detener de inmediato');
connectAt(4);
await lateMic;
assert.equal(voice.getVoiceState(), voice.VoiceState.IDLE);
console.log('PASS: permiso de micrófono concedido tras abandonar una pieza se detiene');

voice.setActiveObject({ id: 'obra-A' });
const hold = voice.startTalking();
await tick();
const permit2 = permissionPending;
voice.stopTalking();
const track2 = { stopped: 0, readyState: 'live', stop() { this.stopped++; } };
permit2({ getTracks: () => [track2], getAudioTracks: () => [track2] });
await tick();
connectAt(5);
await hold;
assert.equal(track2.stopped, 1);
assert.equal(voice.getVoiceState(), voice.VoiceState.IDLE, 'soltar durante CONNECTING no deja UI bloqueada');
console.log('PASS: permiso tardío tras soltar PTT no queda retenido ni bloquea la UI');

// Permiso concedido mientras se sostiene PTT: capturar y liberar al soltar.
voice.setActiveObject({ id: 'obra-A' });
const validHold = voice.startTalking();
await tick();
const grant = permissionPending;
const validTrack = { stopped: 0, readyState: 'live', stop() { this.stopped++; } };
grant({ getTracks: () => [validTrack], getAudioTracks: () => [validTrack] });
await tick();
await validHold;
assert.equal(voice.getVoiceState(), voice.VoiceState.LISTENING);
voice.stopTalking();
assert.equal(validTrack.stopped, 1);
assert.equal(voice.getVoiceState(), voice.VoiceState.PROCESSING);
console.log('PASS: PTT válido se captura al mantener y se libera al soltar');

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
const headers = vercel.headers.flatMap((group) => group.headers);
assert(headers.some((h) => h.key === 'Content-Security-Policy' && h.value.includes("frame-ancestors 'none'")));
assert(html.includes('id="caption-ai"'));
const ui = readFileSync(resolve(root, 'src/ui.js'), 'utf8');
assert(ui.includes("elements.captionYou.textContent = '';"));
assert(ui.includes("elements.captionAi.textContent = '';"));
const geoGuide = readFileSync(resolve(root, 'FIELD_TEST_GUIDE.md'), 'utf8');
assert(geoGuide.includes('**tres**') && geoGuide.includes('**3000 ms**'));
console.log('PASS: cabecera CSP, transcript UI y guía Geo alineadas');
console.log('OK: regresiones de auditoría');

// Ejercitar el estado de audio multimedia con un vídeo falso (sin Three real).
const mediaMock = {
  THREE: {
    Box3: class { constructor() {} },
    Vector3: class { constructor() {} },
    PlaneGeometry: class { dispose() {} },
    VideoTexture: class { dispose() {} },
    MeshBasicMaterial: class { dispose() {} },
    Mesh: class { constructor() {} },
    Group: class { add() {} },
    SRGBColorSpace: 'srgb',
    FrontSide: 0
  },
  VIDEO_DEFAULT_VOLUME: 0.5,
  VIDEO_SEEK_MIN_INTERVAL_MS: 250,
  enableVideoAudio: async (video) => { video.muted = false; },
  setVideoVolume: (_, volume) => volume,
  getVideoVolume: (_, volume) => volume,
  silenceVideo: (video) => { video.muted = true; },
  restoreVideoGain: () => {},
  disconnectVideoAudio: () => {}
};
globalThis.__mediaAuditStub = mediaMock;
let lastVideo;
globalThis.document = {
  createElement(type) {
    assert.equal(type, 'video');
    const callbacks = new Map();
    const video = {
      readyState: 1, videoWidth: 1920, videoHeight: 1080,
      paused: true, muted: true,
      play: async function () { this.paused = false; },
      pause() { this.paused = true; },
      addEventListener(name, callback) { callbacks.set(name, callback); },
      removeEventListener(name) { callbacks.delete(name); },
      removeAttribute() {},
      load() {},
      loop: false
    };
    lastVideo = video;
    return video;
  }
};
let mediaSource = readFileSync(resolve(root, 'src/mediaContent.js'), 'utf8');
mediaSource = mediaSource.replace(/import \* as THREE from 'three';/,
  'const THREE = globalThis.__mediaAuditStub.THREE;');
mediaSource = mediaSource.replace(/import \{\s*VIDEO_DEFAULT_VOLUME,\s*VIDEO_SEEK_MIN_INTERVAL_MS\s*\} from '\.\/config\.js';/,
  'const { VIDEO_DEFAULT_VOLUME, VIDEO_SEEK_MIN_INTERVAL_MS } = globalThis.__mediaAuditStub;');
mediaSource = mediaSource.replace(/import \{[\s\S]*?\} from '\.\/mediaAudio\.js';/,
  'const { enableVideoAudio, setVideoVolume, getVideoVolume, silenceVideo, restoreVideoGain, disconnectVideoAudio } = globalThis.__mediaAuditStub;');
assert(!mediaSource.includes("from './mediaAudio.js'"));
const media = await import('data:text/javascript;base64,' + Buffer.from(mediaSource).toString('base64'));
const videoContent = await media.instantiateVideo({}, { src: '/video.mp4' });
const controller = videoContent.controller;
await controller.enableAudio();
await controller.play();
controller.pause();
controller.pauseForVoice();
assert.equal(lastVideo.muted, true, 'Gemini debe silenciar video pausado');
await controller.play();
assert.equal(lastVideo.muted, false, 'Play debe restituir audio autorizado previamente');
videoContent.dispose();
console.log('PASS: vídeo pausado + voz + Play recupera sonido sin nuevo consentimiento');

const cancellation = new AbortController();
const originalCreate = globalThis.document.createElement;
globalThis.document.createElement = (...args) => {
  const video = originalCreate(...args);
  video.readyState = 0;
  return video;
};
const abandonedVideo = media.instantiateVideo({}, { src: '/otro.mp4' }, { signal: cancellation.signal });
cancellation.abort();
await assert.rejects(abandonedVideo, (e) => e.name === 'AbortError');
console.log('PASS: espera de metadatos abortable sin dejar la sesión colgada');
