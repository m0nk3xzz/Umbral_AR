// Verifica integridad de los binarios self-hosted usando hashes fijados
// tras revisión del fileset. Detecta cambios accidentales o no revisados
// dentro del checkout/CI; NO equivale a SRI verificado por el navegador
// ni impide que un servidor comprometido cambie los bytes al servirlos.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hashes = JSON.parse(await readFile(resolve(root, 'tools/mediapipe-sha256.json'), 'utf8'));

async function listFiles(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, item.name);
    if (item.isDirectory()) out.push(...await listFiles(full));
    else if (item.isFile()) out.push(relative(resolve(root, 'public'), full).replaceAll('\\', '/'));
  }
  return out;
}
const actual = (await listFiles(resolve(root, 'public/mediapipe'))).sort();
assert.deepEqual(actual, Object.keys(hashes).sort(), 'El inventario MediaPipe no coincide con el manifiesto');
for (const file of actual) {
  const digest = createHash('sha256').update(await readFile(resolve(root, 'public', file))).digest('hex');
  assert.equal(digest, hashes[file], `Integridad MediaPipe no coincide: ${file}`);
}
console.log(`OK: MediaPipe SHA-256 — ${actual.length} archivos sin alteración respecto al manifiesto`);
