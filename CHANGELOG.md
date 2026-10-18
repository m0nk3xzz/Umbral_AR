# Historial de cambios

## [1.0.0] - 2026-10-17

Primera publicación versionada de Umbral_AR. Esta versión identifica la copia de código disponible y no implica que todos los recursos de contenido estén incluidos o que la experiencia haya sido validada en producción.

### Incluido

- Código de la experiencia turística con MindAR, Three.js, geolocalización y guía por voz con Gemini Live.
- Seguimiento de manos con MediaPipe y sus siete recursos locales de inferencia y WebAssembly.
- Interfaz, estilos, tipografías y licencia OFL de las fuentes.
- Endpoint de tokens, plantilla de variables de entorno y configuración de Vite y Vercel.
- Herramientas de comprobación disponibles en la copia de origen.
- README, licencia, autoría y metadatos de la versión 1.0.0 en ambos archivos de paquete.

### Pendiente en la copia de origen

- `public/marcadores.mind` y `public/models/modelo.glb`, referenciados por la configuración activa.
- Contenido propio para las carpetas `public/models/` y `public/media/`, y coordenadas reales para activar la vía geográfica.
- Siete scripts declarados en `package.json` que no se encuentran en la carpeta `tools/`; sus nombres se detallan en el README.
- La dependencia LocAR.js no está declarada en esta copia; el GPS utiliza el motor propio del proyecto.

### Verificación de publicación

- Sintaxis JavaScript comprobada sin errores.
- Imports locales: 28 módulos sin imports rotos ni sin usar según la herramienta incluida.
- SHA-256 de los siete recursos de MediaPipe: coincide con el manifiesto recibido.
- No se ejecutó la compilación, la suite completa ni una prueba funcional en móvil.

[1.0.0]: https://github.com/m0nk3xzz/Umbral_AR/releases/tag/v1.0.0
