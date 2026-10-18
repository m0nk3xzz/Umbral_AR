// Prueba del límite distribuido sin una instancia Redis ni credenciales reales.
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { register } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const googleStub = `export class GoogleGenAI {
  get authTokens() { return { create: async () => ({ name: 'fake-token' }) }; }
}`;
const loader = `export async function resolve(id, context, next) {
  if (id === '@google/genai') return {
    url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(googleStub)}),
    shortCircuit: true
  };
  return next(id, context);
}`;
register('data:text/javascript,' + encodeURIComponent(loader));
process.env.VERCEL = '1'; // simular cabeceras del proxy de Vercel
process.env.GEMINI_API_KEY = 'testing-only';
process.env.ALLOWED_ORIGINS = 'https://museo.test';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'testing-only';
const { default: handler } = await import(pathToFileURL(resolve(root, 'api/token.js')).href);
let simulated = 1;
let requests = [];
globalThis.fetch = async (url, opts) => {
  assert.equal(url, 'https://redis.test');
  assert.equal(opts.headers.Authorization, 'Bearer testing-only');
  const command = JSON.parse(opts.body);
  requests.push(command);
  assert.equal(command[0], 'EVAL');
  assert.equal(command[2], '3');
  assert(command[3].startsWith('webar:token:ip:'));
  assert(!command[3].includes('198.51.100.26'), 'no guardar IP en claro');
  assert.equal(command[4], 'webar:token:global');
  assert.equal(command[5], 'webar:token:global:24h');
  if (simulated === 'fail') throw new Error('Redis fuera de servicio');
  return { ok: true, json: async () => ({ result: simulated }) };
};
async function call() {
  const response = {
    code: 0,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {}
  };
  await handler({
    method: 'POST',
    headers: { origin: 'https://museo.test', 'x-real-ip': '198.51.100.26' },
    body: { objectId: 'objeto-1' }
  }, response);
  return response;
}
assert.equal((await call()).code, 200);
simulated = 0;
assert.equal((await call()).code, 429);
simulated = 'fail';
assert.equal((await call()).code, 503);
assert.equal(requests.length, 3);
console.log('PASS: cuota distribuida acepta, limita y falla cerrada si Redis no responde');
