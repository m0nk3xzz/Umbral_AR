# Umbral_AR

**Versión 1.0.0** · [Historial de cambios](CHANGELOG.md)

**Descubre un destino al escanear una imagen y continúa la experiencia cuando llegues al lugar.**

Umbral_AR es una experiencia turística de realidad aumentada para el navegador, orientada a dispositivos móviles. Combina reconocimiento de imágenes y geolocalización para presentar objetos 3D, imágenes y video, con una guía conversacional por voz mediante Gemini Live.

## La experiencia

1. **Explorar:** escanea una imagen configurada como marcador para descubrir el contenido del destino.
2. **Visitar:** al acercarte a una ubicación configurada, la aplicación evalúa distancia y calidad del GPS para ofrecer o activar su contenido asociado.
3. **Conversar e interactuar:** consulta a la guía por voz y utiliza los controles disponibles, incluido el seguimiento de manos cuando está habilitado.

Una misma entrada del catálogo puede tener un marcador y coordenadas. También admite contenido diferente para las etapas de descubrimiento (`discovery`) y visita presencial (`onsite`). Los dos métodos de acceso forman parte de una sola aplicación.

> **Estado de la versión 1.0.0:** se publica el código y los recursos disponibles en la copia de origen. No se incluyen `public/marcadores.mind` ni `public/models/modelo.glb`, aunque la configuración los referencia. La carpeta de medios de origen está vacía. Debes aportar esos recursos para utilizar la experiencia configurada. El catálogo conserva coordenadas `null` y textos pendientes de validación.

## Tecnologías

| Componente | Función |
| --- | --- |
| [MindAR](https://github.com/hiukim/mind-ar-js) | Reconocimiento y seguimiento de imágenes. |
| [Three.js](https://threejs.org/) | Escena y renderizado de contenido 3D. |
| Geolocation API y motor de proximidad propio | Seguimiento GPS, distancias, precisión y condiciones de activación. |
| [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) | Detección de manos para interacción gestual. |
| [Gemini Live](https://ai.google.dev/gemini-api/docs/live) y `@google/genai` | Conversación por voz con contexto del destino. |
| [Vite](https://vite.dev/) | Desarrollo y compilación del frontend. |
| [Vercel](https://vercel.com/) | Despliegue del frontend y del endpoint de tokens. |
| [Upstash Redis](https://upstash.com/) | Cuotas compartidas para la emisión de tokens. |

## Requisitos

- Node.js y npm. La versión fijada en `.nvmrc` es **24.19.0**; `package.json` declara `^20.19.0 || >=22.12.0`.
- Navegador con cámara, WebGL, acceso a ubicación y micrófono para las funciones correspondientes.
- HTTPS para utilizar los permisos del dispositivo en un despliegue. `localhost` permite desarrollo local; una dirección HTTP de la red local puede no permitir esos accesos desde el teléfono.
- Conexión a internet para Gemini Live y para descargar recursos que no estén disponibles en caché.
- Credenciales de Gemini en el servidor y Upstash Redis para la emisión de tokens fuera de `vercel dev`.

La compatibilidad y el rendimiento dependen del dispositivo, del navegador, del peso del contenido y de la precisión del GPS.

## Instalación

Clona el repositorio y entra en su carpeta:

```bash
git clone https://github.com/m0nk3xzz/Umbral_AR.git
cd Umbral_AR
```

Instala las dependencias desde la raíz del proyecto:

```bash
npm ci --ignore-scripts
```

Este comando utiliza las versiones de `package-lock.json` y omite los scripts de instalación de las dependencias. Si actualizas dependencias deliberadamente, usa `npm install --ignore-scripts` y conserva actualizado el archivo de bloqueo.

Copia `.env.example` a `.env` y completa las variables necesarias. Puedes hacerlo desde el explorador de archivos o con el comando correspondiente a tu terminal:

| Terminal | Comando |
| --- | --- |
| CMD de Windows | `copy .env.example .env` |
| PowerShell | `Copy-Item .env.example .env` |
| Git Bash, Linux o macOS | `cp .env.example .env` |

Inicia el frontend:

```bash
npm run dev
```

Abre la dirección que indique Vite. Este comando sirve el frontend; **no ejecuta por sí solo la función `api/token.js`**. Para probar también la voz con el backend local, utiliza Vercel CLI con el proyecto y sus variables configurados:

```bash
npx vercel dev
```

Vercel CLI puede solicitar vincular el proyecto e iniciar sesión. Utiliza la URL que muestre ese proceso.

## Configuración del servidor

| Variable | Uso |
| --- | --- |
| `GEMINI_API_KEY` | Clave privada de Gemini, utilizada únicamente por el backend. |
| `ALLOWED_ORIGINS` | Orígenes completos autorizados, separados por comas; por ejemplo, `https://tu-dominio.example`. |
| `GEMINI_LIVE_MODEL` | Modelo Live que utilizará el backend. Debe estar disponible para la cuenta y ser compatible con la configuración del proyecto. |
| `UPSTASH_REDIS_REST_URL` | URL HTTPS de la instancia Redis que aplica las cuotas compartidas. |
| `UPSTASH_REDIS_REST_TOKEN` | Credencial privada de Redis. |
| `TOKEN_QUOTA_NAMESPACE` | Prefijo para separar contadores entre despliegues; el ejemplo utiliza `webar`. |

La función `api/token.js` genera credenciales temporales para la conexión con Gemini Live. La clave principal permanece en el servidor. El endpoint comprueba el origen y aplica límites de solicitudes y cuotas; la lista de orígenes no equivale a un sistema de autenticación de usuarios.

Las variables `VITE_FIELD_TEST*` de `.env.example` corresponden a ensayos de campo. Mantén `VITE_FIELD_TEST=0` para compilar: la configuración actual bloquea un build con ese modo activado.

**Nunca publiques claves reales ni las pongas en variables con prefijo `VITE_`: sus valores pueden incorporarse al frontend.** Configura los secretos del despliegue en el panel del servidor.

## Configurar destinos y contenido

Edita `src/catalog.js`. Cada entrada utiliza un `id` estable y único.

| Campo | Qué configura |
| --- | --- |
| `markerIndex` | Índice de la imagen dentro del archivo `.mind`; debe coincidir con el orden de compilación. |
| `geo.latitude`, `geo.longitude` | Coordenadas numéricas del destino. Con `null`, la entrada no participa en el seguimiento geográfico. |
| `geo.enterRadiusM` | Radio para detectar proximidad. |
| `geo.invokeRadiusM` | Radio utilizado para evaluar la activación del contenido. |
| `geo.exitRadiusM` | Radio de salida, usado para reducir cambios continuos de estado. |
| `geo.maxProximityAccuracyM`, `geo.maxInvokeAccuracyM` | Precisión GPS máxima admitida para cada fase. |
| `content.type` | Tipo de medio: `model3d`, `video` o `image`. |
| `content.src` | Ruta del recurso que debe existir en `public/`. |
| `initialScale` | Escala inicial del objeto 3D. |
| `stages.discovery.content` | Contenido opcional al acceder por marcador. |
| `stages.onsite.content` | Contenido opcional al acceder por ubicación. |
| `name`, `description`, `translations` | Información del destino y sus traducciones. |
| `curatorialVerified` | Indicador de validación de la información descriptiva. |

Los siguientes ejemplos muestran alternativas para el campo `content` de una entrada; las rutas son ilustrativas y debes proporcionar los archivos:

```js
// Objeto 3D
content: { type: 'model3d', src: '/models/monumento.glb' }

// Video
content: { type: 'video', src: '/media/explicacion.mp4' }

// Imagen
content: { type: 'image', src: '/media/panoramica.jpg' }
```

Los valores generales están en `src/config.js`. El archivo de seguimiento de imágenes se configura con `MARKERS_MIND_PATH`, actualmente `/marcadores.mind`. Para usar MindAR, proporciona el `.mind` compilado y las imágenes objetivo correspondientes.

La activación por GPS también considera precisión, antigüedad y coherencia de las posiciones, muestras consecutivas y permanencia. Estar dentro de un radio no garantiza una activación inmediata. Ajusta los radios con ubicaciones reales y mantén coherentes los umbrales de entrada, invocación y salida.

Para video con sonido, el navegador puede exigir una interacción explícita del visitante. Mantén los recursos locales o adapta conscientemente la política de seguridad si necesitas otros orígenes.

## Organización del proyecto

| Ruta | Contenido |
| --- | --- |
| `src/main.js` | Inicio y coordinación de la aplicación. |
| `src/catalog.js`, `src/catalogUtils.js` | Catálogo, capacidades de cada destino y contenido por etapa. |
| `src/config.js` | Parámetros generales. |
| `src/geoTracker.js`, `src/geoEngine.js`, `src/geoFixFilter.js` | Seguimiento y validación geográfica. |
| `src/sessionManager.js`, `src/mediaContent.js`, `src/modelCache.js` | Sesiones y recursos interactivos. |
| `src/handTracking.js`, `src/gestureControl.js` | Seguimiento de manos y gestos. |
| `src/voiceAgent.js`, `src/audio/` | Conversación y procesamiento de audio. |
| `src/ui.js`, `src/style.css`, `src/styles/` | Interfaz, estilos y movimiento. |
| `api/token.js` | Credenciales temporales para Gemini Live. |
| `public/` | Modelos, medios, tipografías y recursos locales de MediaPipe. |
| `vite.config.js`, `vercel.json` | Compilación, despliegue y cabeceras de seguridad. |

## Compilación

```bash
npm run build
npm run preview
```

La compilación genera `dist/`. La vista previa sirve el resultado del frontend y no sustituye el backend de tokens.

No se ha validado la experiencia desde un dispositivo móvil ni se ha ejecutado la compilación durante la preparación de esta publicación.

## Despliegue

La configuración disponible está orientada a Vercel:

1. Importa el repositorio con el código completo.
2. Conserva la instalación `npm ci --ignore-scripts`, la compilación `npm run build` y el directorio de salida `dist` definidos en `vercel.json`.
3. Configura las variables del backend y los orígenes permitidos para el entorno correspondiente.
4. Incluye los recursos estáticos configurados y sus avisos de licencia.
5. Comprueba cámara, ubicación, voz y reproducción de medios desde el dominio HTTPS y un dispositivo móvil real.

GitHub almacena el código. GitHub Pages sirve archivos estáticos y no ejecuta `api/token.js`; para disponer de Gemini Live necesitarías alojar ese backend por separado y adaptar la configuración correspondiente.

## Privacidad y permisos

La cámara permite reconocer marcadores y manos; la ubicación permite evaluar destinos cercanos; el micrófono permite conversar con la guía. Cada función depende de los permisos del navegador. La conversación por voz implica enviar audio a Gemini, sujeto a las condiciones del proveedor. Evita utilizar información sensible en las conversaciones.


## Licencia y autor

El material original del proyecto se distribuye bajo [PolyForm Noncommercial License 1.0.0](LICENSE). Consulta el texto completo para conocer los usos permitidos y las condiciones de redistribución. Para solicitar una licencia comercial o aclarar el alcance de un uso, contacta con el autor.

Las dependencias, tipografías y recursos de terceros conservan sus propias licencias y avisos. Su inclusión en el proyecto no los convierte en material original ni extiende a ellos la licencia del proyecto.

**Gabriel Andres Rosales Quijije**  
[g.rosalesquijije@gmail.com](mailto:g.rosalesquijije@gmail.com)
