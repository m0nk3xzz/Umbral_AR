import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [session, tracker, main, ui, html, css, i18n] = await Promise.all([
  readFile(new URL('../src/sessionManager.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/geoTracker.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/i18n.js', import.meta.url), 'utf8')
]);

const sharedCalls = session.match(/beginPreparationToCenter\(session, \(\) =>/g) ?? [];
assert.equal(sharedCalls.length, 2, 'Marker y Geo deben entrar por la misma preparación visual');
assert.match(session, /beginPreparationToCenter\(session, \(\) => decoupleModelFromMarker\(session\)\)/);
assert.match(session, /beginPreparationToCenter\(session, \(\) => beginGeoCentering\(session\)\)/);
assert.match(session, /function beginPreparationToCenter[\s\S]*ui\.scan\.modelReady\(\)[\s\S]*DECOUPLE_DELAY_MS/);
assert.match(session, /function beginGeoCentering[\s\S]*ui\.scan\.decouple\(CENTER_DELAY_MS \+ CENTER_ANIMATION_MS\)[\s\S]*centerModelOnCamera/);

for (const id of [
  'geo-debug', 'geo-debug-sim', 'geo-debug-busy', 'geo-debug-lat', 'geo-debug-lng',
  'geo-debug-accuracy', 'geo-debug-inject', 'geo-debug-pieces',
  'geo-debug-last-raw-fix', 'geo-debug-fix-stats', 'geo-debug-accuracy-stats',
  'geo-debug-interval-stats', 'geo-debug-reject-stats'
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `falta #${id}`);
}
assert.match(html, /id="geo-debug" hidden/, 'la consola debe estar oculta por defecto');
assert.match(html, /data-geo-preset="near"/);
assert.match(html, /data-geo-preset="invoke"/);
assert.match(html, /data-geo-preset="exit"/);
assert.match(css, /\.geo-debug\s*\{/);
assert.match(css, /#s-scan\[data-source="geo"\][\s\S]*scan\.removeCedula/);

assert.match(tracker, /injectMock/);
assert.match(tracker, /setSimulationMode/);
assert.match(tracker, /setDebugBusy/);
assert.match(tracker, /getDebugSnapshot/);
assert.match(tracker, /createGeoFixFilter/);
assert.match(tracker, /lastRawFix/);
assert.match(tracker, /rejectedJump/);
assert.match(main, /debugEnabled:\s*fieldTestEnabled/);
assert.match(main, /ui\.fieldDebug\.init/);
assert.match(ui, /export const fieldDebug/);

for (const key of ['debug.geo.title', 'debug.geo.simulation', 'debug.geo.invoke', 'debug.geo.exit', 'debug.geo.lastRawFix', 'debug.geo.rejectStats']) {
  const count = (i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}'`, 'g')) ?? []).length;
  assert.equal(count, 2, `${key} debe existir en ES y EN`);
}

console.log('OK: visual-flow — consola Field Test y convergencia visual Marker/Geo verificadas');
