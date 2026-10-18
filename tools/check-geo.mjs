import assert from 'node:assert/strict';
import { createGeoEngine, haversineMeters, roundDistance, insideAllowedZone } from '../src/geoEngine.js';
import { createGeoFixFilter } from '../src/geoFixFilter.js';
import { hasGeoEntries, entriesWithMarker, getContentDescriptor } from '../src/catalogUtils.js';
import { MARKER_CATALOG } from '../src/catalog.js';

const origin = { latitude: 0, longitude: 0 };
const northMeters = (m) => ({ latitude: m / 111194.9, longitude: 0 });
const piece = (id, meters = 0, overrides = {}) => ({
  id,
  ...northMeters(meters),
  enterRadiusM: 50,
  invokeRadiusM: 25,
  exitRadiusM: 65,
  maxProximityAccuracyM: 60,
  maxInvokeAccuracyM: 30,
  ...overrides
});

assert.equal(hasGeoEntries(MARKER_CATALOG), false, 'el catálogo base no debe activar Geo');
assert.equal(entriesWithMarker(MARKER_CATALOG).length, MARKER_CATALOG.length);
const soloGeo = { id: 'geo-only', name: 'Geo', modelPath: '/models/modelo.glb', geo: { latitude: 0, longitude: 0 } };
assert.equal(entriesWithMarker([soloGeo]).length, 0, 'una pieza solo-Geo no crea binding de marcador');
assert.deepEqual(getContentDescriptor(soloGeo), { type: 'model3d', src: '/models/modelo.glb' });

const engine = (pieces) => createGeoEngine({ pieces, thresholds: {
  invokeFixes: 2, exitFixes: 2, candidateSwitchFixes: 2,
  invokeMinDwellMs: 0, autoGoodAccuracyM: 30, confidenceRadiusFactor: 0.3,
  fixMaxAgeMs: 15000, signalLostMs: 20000, failedCooldownMs: 20000, distanceStepM: 5
}});
const fixAt = (meters, accuracy = 10) => ({ ...northMeters(meters), accuracy });

assert(Math.abs(haversineMeters(origin, northMeters(100)) - 100) < 0.5);
assert.equal(roundDistance(42, 5), 40);

{
  const e = engine([piece('a')]);
  assert.equal(e.update(fixAt(60), 0).some(x => x.type === 'near'), false);
  assert.equal(e.update(fixAt(45), 1000).find(x => x.type === 'near')?.id, 'a');
  assert.equal(e.getState('a'), 'near');
}
{
  const e = engine([piece('a')]);
  assert.equal(e.update(fixAt(20), 0).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(20), 1000).some(x => x.type === 'invoke'), true);
  assert.equal(e.getState('a'), 'pending');
}
{
  const e = engine([piece('a')]);
  e.update(fixAt(20, 80), 0);
  e.update(fixAt(20, 80), 1000);
  assert.equal(e.getState('a'), 'idle');
}
{
  const e = engine([piece('a')]);
  e.update(fixAt(20), 0); e.update(fixAt(20), 1000);
  e.onSessionClaimed({ entryId: 'a', source: 'geo' });
  assert.equal(e.getState('a'), 'consumed');
  e.update(fixAt(66), 2000);
  assert.equal(e.getState('a'), 'consumed');
  e.update(fixAt(66), 3000);
  assert.equal(e.getState('a'), 'idle');
}
{
  const e = engine([piece('a', 10), piece('b', 20)]);
  const ev = e.update(fixAt(0), 0);
  assert.equal(ev.find(x => x.type === 'near')?.id, 'a');
}
{
  const e = engine([piece('a')]);
  e.update(fixAt(40), 0);
  e.dismiss('a');
  assert.equal(e.getState('a'), 'muted');
  e.update(fixAt(20), 1000);
  assert.equal(e.getState('a'), 'muted');
  e.update(fixAt(70), 2000); e.update(fixAt(70), 3000);
  assert.equal(e.getState('a'), 'idle');
}
{
  const e = engine([piece('a')]);
  e.setBusy('boot', true);
  assert.equal(e.update(fixAt(20), 0).length, 0);
  assert.equal(e.getState('a'), 'idle');
  e.setBusy('boot', false);
  assert.equal(e.update(fixAt(20), 1000).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(20), 2000).some(x => x.type === 'invoke'), true);
}
{
  const e = engine([piece('a')]);
  e.update(fixAt(40), 0);
  const ev = e.tick(21000);
  assert.equal(ev.some(x => x.type === 'far'), true);
  assert.equal(e.getState('a'), 'idle');
}
{
  const e = engine([piece('a')]);
  e.update(fixAt(20), 0); e.update(fixAt(20), 1000);
  e.markFailed('a', 1000);
  assert.equal(e.getState('a'), 'failed');
  e.tick(22000);
  assert.equal(e.getState('a'), 'idle');
}
{
  const e = engine([piece('a')]);
  e.update(fixAt(40), 0);
  e.setBusy('debug-ui', true);
  const snap = e.getSnapshot();
  assert.equal(snap.busy, true);
  assert.deepEqual(snap.busyReasons, ['debug-ui']);
  assert.equal(snap.pieces[0].id, 'a');
  assert.equal(typeof snap.pieces[0].distanceM, 'number');
}

{
  const e = engine([piece('a')]);
  e.update(fixAt(40, 10), 0);
  const trustedBefore = e.getDistance('a');
  const events = e.update(fixAt(900, 500), 1000);
  assert.equal(events.length, 0, 'un fix impreciso no debe alterar la UI');
  assert.equal(e.getState('a'), 'near');
  assert.equal(e.getDistance('a'), trustedBefore, 'la distancia confiable no se sobrescribe con un fix descartado');
}
{
  const e = engine([piece('a')]);
  assert.equal(e.update(fixAt(20), 0).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(20), 100).some(x => x.type === 'invoke'), false, 'dos callbacks casi simultáneos no confirman invocación');
  assert.equal(e.update(fixAt(20), 800).some(x => x.type === 'invoke'), true, 'una segunda muestra temporalmente independiente sí confirma');
}
{
  const e = engine([piece('a')]);
  e.update(fixAt(20, 30), 0);
  assert.equal(e.update(fixAt(20, 30), 1000).some(x => x.type === 'invoke'), false, 'incertidumbre alta cerca del borde debe penalizar la invocación');
  e.update(fixAt(15, 30), 2000);
  assert.equal(e.update(fixAt(15, 30), 3000).some(x => x.type === 'invoke'), true, 'claramente dentro del radio puede invocar aun con accuracy aceptable alta');
}
{
  const f = createGeoFixFilter({
    maxUsefulAccuracyM: 60,
    maxSpeedMps: 12,
    baseAllowanceM: 15,
    jumpConfirmFixes: 2,
    jumpConsistencyM: 20,
    recoveryAccuracyRatio: 0.6
  });
  assert.equal(f.evaluate({ ...fixAt(0, 10) }, 0).accepted, true);
  const jump1 = f.evaluate({ ...fixAt(1000, 10) }, 1000);
  assert.equal(jump1.accepted, false);
  assert.equal(jump1.reason, 'jump');
  const jump2 = f.evaluate({ ...fixAt(1002, 10) }, 2000);
  assert.equal(jump2.accepted, true, 'dos posiciones nuevas coherentes permiten recuperar una corrección real');
  assert.equal(jump2.recoveredJump, true);
}
{
  const f = createGeoFixFilter({ maxUsefulAccuracyM: 60 });
  assert.equal(f.evaluate({ ...fixAt(0, 100) }, 0).reason, 'accuracy');
}
{
  const f = createGeoFixFilter({ maxUsefulAccuracyM: 60, recoveryAccuracyRatio: 0.6 });
  assert.equal(f.evaluate({ ...fixAt(0, 50) }, 0).accepted, true);
  const corrected = f.evaluate({ ...fixAt(1000, 10) }, 1000);
  assert.equal(corrected.accepted, true, 'una corrección con precisión claramente mejor no debe quedar bloqueada');
  assert.equal(corrected.recoveredJump, true);
}

{
  const e = createGeoEngine({ pieces: [piece('a')], thresholds: {
    invokeFixes: 3, invokeMinDwellMs: 3000, autoGoodAccuracyM: 12,
    confidenceRadiusFactor: 0.75, invokeMinSampleIntervalMs: 750
  }});
  assert.equal(e.update(fixAt(10, 20), 0).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(10, 20), 1000).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(10, 20), 2000).some(x => x.type === 'invoke'), false,
    'precisión intermedia nunca debe activar automáticamente');
  assert.equal(e.update(fixAt(10, 8), 3000).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(10, 8), 4000).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(10, 8), 5000).some(x => x.type === 'invoke'), false);
  assert.equal(e.update(fixAt(10, 8), 6000).some(x => x.type === 'invoke'), true);
}
{
  const f = createGeoFixFilter();
  assert.equal(f.evaluate({ ...fixAt(0), sourceTimestamp: 1000 }, 0).accepted, true);
  assert.equal(f.evaluate({ ...fixAt(0), sourceTimestamp: 1000 }, 1000).reason, 'duplicate');
  assert.equal(f.evaluate({ ...fixAt(0), sourceTimestamp: 2000 }, 2000).accepted, true);
  f.reset();
  assert.equal(f.evaluate({ ...fixAt(0), sourceTimestamp: 1000 }, 3000).accepted, true);
}

{
  const rect = [[-0.001, -0.001],[-0.001,0.001],[0.001,0.001],[0.001,-0.001]];
  assert.equal(insideAllowedZone({latitude:0,longitude:0},{activationPolygon:rect}),true);
  assert.equal(insideAllowedZone({latitude:0.01,longitude:0},{activationPolygon:rect}),false);
  assert.equal(insideAllowedZone({latitude:0,longitude:0},{exclusionPolygons:[rect]}),false);
  const e = createGeoEngine({ pieces:[piece('zone',0,{activationPolygon:[[0.001,0.001],[0.001,0.002],[0.002,0.002]]})],
    thresholds:{invokeFixes:2,invokeMinDwellMs:0,autoGoodAccuracyM:12}});
  for (let t=0;t<5000;t+=1000) assert(!e.update(fixAt(0,5),t).some(x=>x.type==='invoke'));
}

console.log('OK: geoEngine/filtro — precisión confiable, estabilidad temporal, saltos, histéresis y cooldown');
