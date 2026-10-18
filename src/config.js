/**
 * Parámetros centralizados para ajustar visión artificial, transiciones 3D, voz, geolocalización y
 * controles. Cambiar aquí un umbral mantiene coherentes los módulos que lo consumen.
 */


import * as THREE from 'three';

/**
 * El archivo .mind contiene las imágenes objetivo compiladas; sus índices deben coincidir con el
 * catálogo.
 */
export const MARKERS_MIND_PATH = '/marcadores.mind';

/**
 * Estas duraciones gobiernan la transición de una pieza desde el marcador a un objeto independiente
 * delante de la cámara.
 */
export const DECOUPLE_DELAY_MS = 2500;
export const CENTER_DELAY_MS = 1250;
export const CENTER_ANIMATION_MS = 1000;
export const CENTER_POSITION = new THREE.Vector3(0, 437.5, -2500);
export const CENTER_ROTATION = new THREE.Euler(0, 0, 0);

export const EXIT_DURATION_MS = 250;

/**
 * La iluminación principal aumenta durante la materialización; sus valores base están coordinados con
 * sceneSetup.js.
 */
export const KEY_LIGHT_INTENSITY = 3.75;
export const KEY_LIGHT_RAMP_FROM = 0.5;
export const KEY_LIGHT_RAMP_MS = 500;

/**
 * La sombra aparece con retraso para dar sensación de apoyo después de materializar el objeto.
 */
export const SHADOW_FADE_DELAY_MS = 250;
export const SHADOW_FADE_MS = 500;

/**
 * Capacidad máxima de los recursos precargados compartidos entre diferentes sesiones.
 */
export const MODEL_CACHE_MAX_SIZE = 5;
export const IMAGE_CACHE_MAX_SIZE = 5;

/**
 * La proximidad geográfica utiliza radios de entrada, invocación y salida distintos para reducir
 * oscilaciones.
 */
export const GEO_ENTER_RADIUS_M = 50;
export const GEO_INVOKE_RADIUS_M = 25;
export const GEO_EXIT_RADIUS_M = 65;
export const GEO_MAX_PROXIMITY_ACCURACY_M = 60;
export const GEO_MAX_INVOKE_ACCURACY_M = 30;
export const GEO_INVOKE_CONSECUTIVE_FIXES = 3;
export const GEO_INVOKE_MIN_DWELL_MS = 3000;
export const GEO_AUTO_GOOD_ACCURACY_M = 12;
export const GEO_CONFIDENCE_RADIUS_FACTOR = 0.75;
export const GEO_WATCH_STALL_MS = 25000;
export const GEO_WATCH_RESTART_COOLDOWN_MS = 15000;
export const GEO_EXIT_CONSECUTIVE_FIXES = 2;
export const GEO_CANDIDATE_SWITCH_FIXES = 2;
/**
 * La confirmación de llegada requiere muestras independientes y vigentes, no ráfagas del mismo dato.
 */
export const GEO_INVOKE_MIN_SAMPLE_INTERVAL_MS = 750;
export const GEO_FIX_MAX_AGE_MS = 15000;
/**
 * Un corte breve de GPS no debe cerrar la sugerencia, pero una posición caducada nunca activa contenido.
 */
export const GEO_SIGNAL_LOST_MS = 30000;
export const GEO_FAILED_COOLDOWN_MS = 20000;
export const GEO_DISTANCE_STEP_M = 5;
/**
 * Se suaviza únicamente la distancia mostrada; el motor decide siempre con medidas verificadas.
 */
export const GEO_DISPLAY_SMOOTHING_ALPHA = 0.35;
export const GEO_HEALTH_TICK_MS = 5000;
export const GEO_ENABLE_HIGH_ACCURACY = true;
export const GEO_POSITION_TIMEOUT_MS = 15000;
export const GEO_MAXIMUM_AGE_MS = 1000;
/**
 * El filtro espacial comprueba velocidad y coherencia antes de aceptar correcciones grandes del GPS.
 */
export const GEO_JUMP_MAX_SPEED_MPS = 12;
export const GEO_JUMP_BASE_ALLOWANCE_M = 15;
export const GEO_JUMP_CONFIRM_FIXES = 2;
export const GEO_JUMP_CONSISTENCY_M = 20;
export const GEO_JUMP_RECOVERY_ACCURACY_RATIO = 0.6;
/**
 * La simulación utiliza un reloj lógico para ensayar confirmaciones sin depender de esperas reales.
 */
export const GEO_DEBUG_MOCK_STEP_MS = 1000;
export const GEO_VIEW_FILL = 0.35;
export const GEO_SPAWN_OFFSET = new THREE.Vector3(0, -250, 400);

/**
 * Los archivos de inferencia de manos se sirven desde el mismo dominio y deben conservar versiones
 * compatibles.
 */
export const MEDIAPIPE_WASM_URL = '/mediapipe/wasm';
export const HAND_LANDMARKER_MODEL_URL = '/mediapipe/hand_landmarker.task';

/**
 * La inferencia de manos es opcional: una carga detenida no bloquea indefinidamente el arranque.
 */
export const HANDS_INIT_TIMEOUT_MS = 45000;

export const HAND_LANDMARK_OPACITY = 0;

/**
 * Relaciones entre los 21 puntos anatómicos utilizados para dibujar el esqueleto de una mano.
 */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // Articulaciones del pulgar, desde la muñeca hasta la punta.
  [0, 5], [5, 6], [6, 7], [7, 8],           // Recorrido completo de los puntos del dedo índice.
  [5, 9], [9, 10], [10, 11], [11, 12],      // Recorrido completo de los puntos del dedo medio.
  [9, 13], [13, 14], [14, 15], [15, 16],    // Recorrido completo de los puntos del dedo anular.
  [13, 17], [17, 18], [18, 19], [19, 20],   // Recorrido completo de los puntos del dedo meñique.
  [0, 17]
];

/**
 * La inferencia se espacia entre fotogramas para mantener fluido el renderizado.
 */
export const HAND_DETECTION_FRAME_INTERVAL = 4;

export const POSE_DEBOUNCE_FRAMES = 2;

/**
 * Sensibilidad y límites para que los gestos no desplacen ni deformen la pieza sin control.
 */
export const SCALE_MULTIPLIER_MIN = 0.5;
export const SCALE_MULTIPLIER_MAX = 2.5;
export const SCALE_SENSITIVITY = 10;

export const ROTATION_MAX_RAD = Math.PI * 2;
export const ROTATION_SENSITIVITY = 15;

export const MOVE_SENSITIVITY = 2500;

export const MOVE_LIMIT_X = 2000;
export const MOVE_LIMIT_Y = 1500;

export const GESTURE_TIME_CONSTANT_S = 0.125;

export const GESTURE_VELOCITY_MAX_AGE_S = 0.375;

/**
 * Solo rotación y traslación conservan velocidad después de soltar; los cambios de escala se detienen
 * inmediatamente.
 */
export const INERTIA_ACTIONS = ['rotateX', 'rotateY', 'move'];
export const INERTIA_TIME_CONSTANT_S = 0.25;
export const INERTIA_VELOCITY_GAIN = 0.5;
export const INERTIA_MIN_SPEED = 0.05;
export const INERTIA_STOP_SPEED = 0.0125;
export const INERTIA_MAX_FRAME_GAP_S = 0.25;

/**
 * Umbrales predeterminados que la calibración puede adaptar a la mano de cada visitante.
 */
export const DEFAULT_FINGER_EXTENSION_MARGIN = 0.15;
export const DEFAULT_THUMB_ENTER_THRESHOLD = 0.675;
export const DEFAULT_THUMB_EXIT_THRESHOLD = 0.575;

/**
 * Tiempos que separan la preparación de la mano, captura de muestras y confirmación de calibración.
 */
export const CALIBRATION_COUNTDOWN_MS = 3750;
export const CALIBRATION_SAMPLE_MS = 5000;
export const CALIBRATION_DONE_MESSAGE_MS = 2500;

export const CALIBRATION_LANDMARK_OPACITY = 0.75;

export const SCAN_HELP_DELAY_MS = 10000;

export const UI_IDLE_DIM_MS = 5000;


/**
 * Constantes de interacción visual para indicaciones, confirmación de reescaneo y distribución de
 * controles.
 */
export const PTT_COACH_MS = 700;

export const RESCAN_CONFIRM_MS = 4000;

export const RECENTER_SLIDE_X = 48;
export const RECENTER_SLIDE_Y = 16;

export const COMPACT_CONTAINER_WIDTH_PX = 420;

export const NO_HAND_HINT_MS = 3000;

export const PLAYBACK_END_DEBOUNCE_MS = 250;

/**
 * Plazos y reintentos destinados a recuperar vídeo si el navegador suspendió la cámara.
 */
export const CAMERA_RECHECK_DELAY_MS = 250;
export const CAMERA_FRAME_PROBE_MS = 750;
export const CAMERA_MAX_ATTEMPTS = 3;
export const CAMERA_RETRY_DELAY_MS = 1250;


/**
 * Pose alternativa del modelo cuando la ficha ocupa parte de la pantalla.
 */
export const SHEET_OPEN_POSITION = new THREE.Vector3(0, 525, -2500);
export const SHEET_OPEN_ROTATION = new THREE.Euler(0, 0, 0);
export const SHEET_OPEN_SCALE_FACTOR = 0.625;

/**
 * Límites de espera para credenciales y conexiones, con tratamiento independiente de cancelación.
 */
export const TOKEN_FETCH_TIMEOUT_MS = 10000;
export const LIVE_CONNECT_TIMEOUT_MS = 15000;

/**
 * Preferencias iniciales para volumen, búsqueda temporal y reanudación de medios.
 */
export const VIDEO_DEFAULT_VOLUME = 0.5;
export const VIDEO_SEEK_SECONDS_PER_UNIT = 40;
export const VIDEO_VOLUME_SENSITIVITY = 2;
export const VIDEO_SEEK_MIN_INTERVAL_MS = 120;
export const VIDEO_RESUME_AFTER_AI = false;
