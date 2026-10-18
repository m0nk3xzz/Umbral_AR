# Componentes de terceros

La licencia PolyForm del proyecto se aplica al material original según LICENSE. Las dependencias y los recursos de terceros conservan sus propias licencias.

## Recursos de MediaPipe redistribuidos

`public/mediapipe/` contiene el modelo de detección de manos y los archivos JavaScript/WebAssembly recibidos con el proyecto. El paquete `@mediapipe/tasks-vision` está identificado como Apache-2.0 en `package-lock.json`. Se incluye una copia del texto Apache License 2.0 en [third_party/mediapipe/LICENSE](third_party/mediapipe/LICENSE).

Proyecto de origen: https://github.com/google-ai-edge/mediapipe

## Tipografías

`public/fonts/` incluye Hanken Grotesk y Newsreader. Sus avisos de autoría y el texto SIL Open Font License 1.1 se conservan en [public/fonts/OFL.txt](public/fonts/OFL.txt).

## Dependencias instaladas mediante npm

`package.json` y `package-lock.json` identifican las dependencias. Cada paquete mantiene su licencia dentro de su distribución; al redistribuir una compilación deben conservarse los avisos exigidos por las partes incluidas. `node_modules/` no se versiona en este repositorio.
