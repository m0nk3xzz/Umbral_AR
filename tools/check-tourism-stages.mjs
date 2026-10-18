import assert from 'node:assert/strict';
import { getContentDescriptor, getExperienceStage, getStageMetadata, hasVideoEntries } from '../src/catalogUtils.js';
import { createGeoEngine } from '../src/geoEngine.js';
import { buildRuntimeCatalog } from '../src/runtimeCatalog.js';

const entry = {
  id: 'destino', markerIndex: 0, modelPath: '/legacy.glb',
  geo: { latitude: 0, longitude: 0 },
  stages: {
    discovery: { title: 'Descubrir', content: { type: 'model3d', src: '/discovery.glb' } },
    onsite: { title: 'Visitar', content: { type: 'video', src: '/onsite.mp4' } }
  }
};
assert.equal(getExperienceStage('marker'), 'discovery');
assert.equal(getExperienceStage('geo'), 'onsite');
assert.equal(getStageMetadata(entry, 'geo').title, 'Visitar');
assert.equal(getContentDescriptor(entry, 'marker').src, '/discovery.glb');
assert.equal(getContentDescriptor(entry, 'geo').src, '/onsite.mp4');
assert.equal(hasVideoEntries([entry]), true);
assert.equal(getContentDescriptor({modelPath: '/legacy.glb'}, 'geo').src, '/legacy.glb');
assert.equal(getContentDescriptor({content: {type: 'image', src: '/photo.webp'}}, 'geo').type, 'image');
const copy = buildRuntimeCatalog([entry], {VITE_FIELD_TEST: '1'});
copy[0].stages.onsite.title = 'Cambio';
assert.equal(entry.stages.onsite.title, 'Visitar', 'field test no debe alterar el catálogo original');

const engine = createGeoEngine({pieces: [{id: 'destino', latitude: 0, longitude: 0, enterRadiusM: 50, invokeRadiusM: 25, exitRadiusM: 65, maxProximityAccuracyM: 60, maxInvokeAccuracyM: 30}], thresholds: {invokeFixes: 2, exitFixes: 2, candidateSwitchFixes: 2, invokeMinDwellMs: 0, autoGoodAccuracyM: 30, confidenceRadiusFactor: 0.3, fixMaxAgeMs: 15000, signalLostMs: 20000, failedCooldownMs: 20000, distanceStepM: 5}});
const fix = {latitude: 0, longitude: 0, accuracy: 5};
engine.update(fix, 0);
engine.onSessionClaimed({entryId: 'destino', source: 'marker'});
assert.equal(engine.getState('destino'), 'idle', 'el descubrimiento no consume Geo');
engine.setBusy('session', true);
engine.update(fix, 500);
assert.equal(engine.getState('destino'), 'idle', 'durante MindAR no puede invocarse Geo');
engine.setBusy('session', false);
engine.update(fix, 1000);
assert.equal(engine.update(fix, 2000).some(event => event.type === 'invoke'), true, 'Geo vuelve a ser invocable sin abandonar el lugar');
engine.onSessionClaimed({entryId: 'destino', source: 'geo'});
assert.equal(engine.getState('destino'), 'consumed', 'la etapa presencial conserva el rearme por salida');
engine.onSessionClaimed({entryId: 'destino', source: 'marker'});
assert.equal(engine.getState('destino'), 'consumed', 'escanear después de Geo no rearma el destino');
console.log('OK: etapas turísticas y continuidad MindAR → Geo');
