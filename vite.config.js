/**
 * Configuración de empaquetado. Separa las dependencias pesadas para facilitar la caché y evita
 * incorporar herramientas de pruebas de campo a compilaciones públicas.
 */


import { defineConfig, loadEnv } from 'vite';

const VENDOR_CHUNKS = [
  { test: /node_modules[\\/]three[\\/]/, name: 'three' },
  { test: /node_modules[\\/]mind-ar[\\/]/, name: 'mind-ar' },
  { test: /node_modules[\\/]@tensorflow[\\/]/, name: 'mind-ar' },
  { test: /node_modules[\\/]@mediapipe[\\/]/, name: 'mediapipe' },
  { test: /node_modules[\\/]@google[\\/]genai[\\/]/, name: 'genai' }
];

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && env.VITE_FIELD_TEST === '1') {
    throw new Error('Build bloqueado: VITE_FIELD_TEST=1 solo se admite con vite dev.');
  }
  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            const match = VENDOR_CHUNKS.find(({ test }) => test.test(id));
            return match?.name;
          }
        }
      }
    }
  };
});
