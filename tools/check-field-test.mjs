import assert from 'node:assert/strict';
import { MARKER_CATALOG } from '../src/catalog.js';
import { buildRuntimeCatalog } from '../src/runtimeCatalog.js';

const normal = buildRuntimeCatalog(MARKER_CATALOG, {});
assert.equal(normal, MARKER_CATALOG, 'modo normal debe devolver el catálogo original');

const baseEnv = {
  VITE_FIELD_TEST: '1',
  VITE_FIELD_TEST_LAT: '-2.180627',
  VITE_FIELD_TEST_LNG: '-79.816605'
};

const model = buildRuntimeCatalog(MARKER_CATALOG, { ...baseEnv, VITE_FIELD_TEST_CONTENT: 'model3d' });
const modelEntry = model.find((e) => e.id === 'objeto-1');
assert.notEqual(model, MARKER_CATALOG, 'field test debe clonar catálogo');
assert.equal(modelEntry.markerIndex, 0, 'debe conservar la vía Marker');
assert.equal(modelEntry.modelPath, '/models/modelo.glb', 'model3d conserva GLB');
assert.equal(modelEntry.content, undefined, 'model3d no necesita override content');
assert.equal(modelEntry.geo.enterRadiusM, 24);
assert.equal(modelEntry.geo.invokeRadiusM, 8);
assert.equal(modelEntry.geo.exitRadiusM, 65);
assert.equal(MARKER_CATALOG[0].geo, undefined, 'no debe mutar catálogo base');

const image = buildRuntimeCatalog(MARKER_CATALOG, { ...baseEnv, VITE_FIELD_TEST_CONTENT: 'image' });
assert.deepEqual(image[0].content, { type: 'image', src: '/media/field-test-image.svg' });
assert.equal(image[0].id, 'objeto-1');
assert.equal(image[0].markerIndex, 0);

const video = buildRuntimeCatalog(MARKER_CATALOG, { ...baseEnv, VITE_FIELD_TEST_CONTENT: 'video' });
assert.deepEqual(video[0].content, { type: 'video', src: '/media/field-test-video.mp4', loop: true });
assert.equal(video[0].preload, false);

const noCoords = buildRuntimeCatalog(MARKER_CATALOG, { VITE_FIELD_TEST: '1', VITE_FIELD_TEST_CONTENT: 'video' });
assert.equal(noCoords[0].geo, undefined, 'sin lat/lng no debe inventar Geo');
assert.equal(noCoords[0].content.type, 'video', 'se puede probar media por marcador aun sin Geo');

console.log('OK: field-test — apagado por defecto, overrides aislados y model/image/video verificables');
