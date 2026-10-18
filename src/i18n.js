/**
 * Diccionario y lógica de traducción de la interfaz. Centraliza los textos visibles y los aplica según
 * el idioma activo sin duplicar componentes.
 */


export const LOCALES = {
  es: {
    'gesture.active': 'activo',
    'brand.tagline': 'Lugares por descubrir',
    'intro.eyebrow': 'Mira más allá',
    'intro.subtitle': 'Acerca la cámara. Descubre una historia. Y deja que te lleve hasta el lugar donde sucede.',
    'intro.step1body': 'Escanea y explora su contenido en realidad aumentada.',
    'intro.step2body': 'Al llegar a un sitio del recorrido, descubre su historia allí mismo.',
    'intro.note': 'Sin cuentas. Solo curiosidad.',
    'intro.permissions': 'Cámara, ubicación y privacidad',
    'intro.artKicker': 'OTRA FORMA DE VIAJAR',
    'intro.artFooter': 'De la imagen al lugar.',
    'scan.eyebrow': 'Explorando',
    'scan.searchLabel': 'Descubre el recorrido',
    'geo.arrivalNote': 'Cuando tu ubicación confirme la llegada, se abrirá el contenido del lugar. Detente en un sitio seguro para verlo.',
    'guide.label': 'Tu guía, aquí contigo',
    'entry.marker': 'Descubierto en una imagen',
    'entry.geo': 'En el lugar',
    'sheet.eyebrow': 'Conoce lo que te rodea',
    'sheet.invitation': 'Esto es solo el comienzo. Conoce este lugar en persona y continúa la experiencia.',
    'sheet.arrived': 'Ya estás aquí. Detente un momento y descubre la historia del lugar.',
    'intro.subtitleScan': 'Acerca la cámara a una imagen del recorrido. Explora su historia en realidad aumentada y conversa con tu guía.',

    'intro.step1': 'Descúbrelo en una imagen',
    'intro.step2': 'Vívelo en el lugar',
    'intro.step3': 'Explora y conversa con tu guía',
    'intro.title': 'El viaje empieza con otra mirada.',
    'intro.start': 'Empezar a explorar',
    'intro.privacy': 'La cámara permite reconocer imágenes. El micrófono se usa mientras mantienes el botón de voz. Tus preguntas se envían al servicio del guía para responderte.',
    'intro.privacyGeo': 'La cámara permite reconocer imágenes. La ubicación detecta lugares cercanos y se procesa en tu dispositivo. El micrófono se usa mientras mantienes el botón de voz; tus preguntas se envían al servicio del guía.',

    'loading.title': 'Abriendo tu próxima historia',
    'loading.camera': 'Cámara',
    'loading.hands': 'Gestos con la mano',
    'loading.catalog': 'Contenido del recorrido',
    'loading.note': 'La primera carga puede tardar un momento.',
    'loading.handsWarn': 'Los gestos no están disponibles. Puedes continuar con voz.',
    'loading.catalogWarn': 'Parte del contenido se descargará al descubrirlo.',

    'error.camera.title': 'No podemos usar la cámara',
    'error.camera.body': 'Permite el acceso a la cámara en tu navegador y vuelve a intentarlo.',
    'error.generic.title': 'Algo salió mal',
    'error.generic.body': 'No pudimos iniciar la experiencia. Inténtalo de nuevo en un momento.',
    'error.retry': 'Reintentar',
    'error.howto': 'Cómo permitir la cámara',
    'error.howtoText': 'En la barra de direcciones, toca el icono de candado o de ajustes y activa la cámara para este sitio. Luego toca Reintentar.',

    'cal.ready.title': 'Explora con tus manos',
    'cal.ready.help': 'Ajusta dos gestos para mover el contenido. También puedes continuar con los ajustes estándar.',
    'cal.ready.start': 'Iniciar calibración',
    'cal.fist.title': 'Cierra el puño',
    'cal.fist.help': 'Mantenlo frente a la cámara, a unos 30 cm.',
    'cal.open.title': 'Abre la mano',
    'cal.open.help': 'Extiende los cinco dedos y mantén la mano estable.',
    'cal.done.title': 'Mano sincronizada',
    'cal.done.help': 'Todo listo para descubrir el recorrido.',
    'cal.skipped.title': 'Ajustes estándar',
    'cal.skipped.help': 'Puedes empezar a descubrir el recorrido.',
    'cal.partial.title': 'Sincronización parcial',
    'cal.partial.help': 'Algunos gestos pueden fallar. Puedes volver a ajustarlos desde Ayuda.',
    'cal.failed.title': 'No pudimos sincronizar',
    'cal.failed.help': 'Continuamos con los ajustes estándar. Puedes ajustar los gestos desde Ayuda.',
    'cal.skip': 'Usar ajustes estándar',
    'cal.seg1': 'Puño',
    'cal.seg2': 'Mano abierta',
    'cal.detected': 'Mano detectada',
    'cal.notDetected': 'Buscando tu mano',
    'cal.hint': 'Aleja un poco la mano o busca más luz.',

    'scan.title': 'Una imagen. Un nuevo lugar.',
    'scan.sub': 'Encuadra una imagen del recorrido y mantén la cámara estable.',
    'scan.help': 'Acerca la imagen a unos 25 cm, evita reflejos y espera un momento. Debe ser una imagen preparada para esta experiencia.',
    'scan.found.tag': 'Imagen reconocida',
    'scan.preparing': 'Abriendo el contenido',
    'scan.appear': 'Tu descubrimiento está listo',
    'scan.removeCedula': 'Ya puedes apartar la imagen',
    'scan.errorLoad': 'No pudimos cargar "{name}". Aparta la imagen un momento y vuelve a escanearla.',
    'scan.errorRetry': 'Escanear de nuevo',
    'scan.errorLoadGeo': 'No pudimos cargar "{name}". Puedes seguir explorando e intentarlo más tarde.',
    'geo.tag': 'Un lugar cerca de ti',
    'geo.distance': 'A unos {m} m de ti',
    'geo.distanceNear': 'Muy cerca',
    'geo.refining': 'Afinando ubicación…',
    'geo.exit': 'Seguir explorando',
    'geo.manual': 'Estoy en el lugar',
    'geo.permissionDenied': 'La ubicación está desactivada. Puedes seguir escaneando imágenes; para detectar lugares cercanos, permite la ubicación en los ajustes del sitio.',

    'debug.geo.title': 'Depuración Geo',
    'debug.geo.collapse': 'Contraer o expandir depuración Geo',
    'debug.geo.tracker': 'Tracker',
    'debug.geo.engine': 'Engine',
    'debug.geo.session': 'Sesión',
    'debug.geo.target': 'Objetivo',
    'debug.geo.simulation': 'Usar posición simulada',
    'debug.geo.busy': 'Pausar promociones/invocación del engine',
    'debug.geo.lat': 'Latitud',
    'debug.geo.lng': 'Longitud',
    'debug.geo.accuracy': 'Precisión (m)',
    'debug.geo.repeats': 'Fixes',
    'debug.geo.inject': 'Enviar fix',
    'debug.geo.near': 'Proximidad',
    'debug.geo.invoke': 'Invocar',
    'debug.geo.exit': 'Salir / rearmar',
    'debug.geo.lastFix': 'Último fix confiable',
    'debug.geo.lastRawFix': 'Último fix recibido',
    'debug.geo.fixStats': 'Aceptación',
    'debug.geo.accuracyStats': 'Precisión',
    'debug.geo.intervalStats': 'Cadencia',
    'debug.geo.rejectStats': 'Descartes',
    'debug.geo.notConfigured': 'Geo no configurado',
    'debug.geo.coordsRequired': 'VITE_FIELD_TEST_LAT / LNG requeridos',

    'ui.rescan': 'Seguir explorando',
    'ui.rescanConfirm': 'Vas a cerrar este contenido y su conversación. ¿Continuar explorando?',
    'ui.cancel': 'Cancelar',
    'ui.close': 'Cerrar',
    'ui.recenter': 'Traer al frente',
    'ui.help': 'Ayuda',
    'ui.helpGestures': 'Ayuda con los gestos',
    'ui.keyboard': 'Escribir una pregunta',
    'ui.sheet': 'Acerca de este lugar',
    'ui.closeSheet': 'Cerrar información',
    'ui.ask': 'Preguntar al guía',
    'ui.recalibrate': 'Recalibrar la mano',
    'caption.aria': 'Subtítulos de la conversación',

    'help.title': 'Guía rápida',
    'help.gestures': 'Puño: mover · Índice: girar · Índice y medio: inclinar · Índice y pulgar: escalar.',
    'help.recalibrate': 'Si los gestos no responden bien:',

    'ptt.idle': 'Mantén pulsado para hablar',
    'ptt.listening': 'Escuchando',
    'ptt.thinking': 'Pensando',
    'ptt.speaking': 'Respondiendo',
    'ptt.aria': 'Mantén pulsado para hablar con tu guía',
    'ptt.holdHint': 'Mantén pulsado hasta ver Escuchando',

    'ptt.errMicDenied': 'Micrófono bloqueado',
    'ptt.errMicMissing': 'Sin micrófono',
    'ptt.errNetwork': 'Sin conexión',
    'ptt.errRateLimited': 'Espera un momento',
    'ptt.errSessionLost': 'Conexión cortada',
    'ptt.errUnknown': 'No se pudo conectar. Reintenta.',

    'voice.err.micDenied': 'El micrófono está bloqueado para este sitio. Actívalo y vuelve a intentarlo.',
    'voice.err.micMissing': 'No detectamos un micrófono. Puedes escribir tu pregunta con el teclado.',
    'voice.err.network': 'No hay conexión con el guía. Revisa tu conexión a internet y vuelve a intentarlo.',
    'voice.err.rateLimited': 'Hay demasiadas consultas en poco tiempo. Espera un momento y vuelve a intentarlo.',
    'voice.err.sessionLost': 'La conversación se cortó. Mantén pulsado el botón de voz para continuar.',
    'voice.err.unknown': 'Algo falló en la conversación. Vuelve a intentarlo.',
    'mic.howto': 'Cómo permitir el micrófono',
    'mic.howtoText': 'En la barra de direcciones, toca el icono de candado o de ajustes y activa el micrófono para este sitio. Luego mantén pulsado el botón de voz.',

    'caption.you': 'Tú:',
    'caption.typing': 'Estás diciendo…',
    'caption.thinking': 'Pensando…',

    'keyboard.placeholder': 'Escribe tu pregunta…',
    'keyboard.send': 'Enviar',

    'sheet.culture': 'Cultura',
    'sheet.period': 'Periodo',
    'sheet.material': 'Material',
    'sheet.origin': 'Origen',
    'sheet.inventory': 'Referencia',
    'sheet.invPrefix': 'Ref.',

    'gesture.move': 'Mover',
    'gesture.rotateY': 'Girar',
    'gesture.rotateX': 'Inclinar',
    'gesture.scale': 'Escalar',
    'gesture.rail': 'Gestos disponibles. El gesto en uso se identifica como activo.',
    'gesture.video.rotateY': 'Adelantar o retroceder',
    'gesture.video.rotateX': 'Volumen',
    'help.gesturesVideo': 'Puño: mover · Índice: adelantar o retroceder · Índice y medio: volumen · Índice y pulgar: escalar.',
    'media.play': 'Reproducir',
    'media.pause': 'Pausar',
    'media.sound.enable': 'Activar sonido',

    'lang.label': 'Idioma',

    'guide.persona': [
      'Usted es el guía conversacional de una experiencia turística de Realidad Aumentada.',
      'En este momento el visitante tiene frente a su cámara el objeto "{name}".',
      'Contexto sobre este objeto (úselo como fuente de verdad): {description}',
      'Tiene acceso a búsqueda en internet: úselo cuando le pregunten algo sobre este objeto (o temas relacionados) que no esté cubierto en el contexto de arriba, o que requiera información actualizada.',
      'Esto es una conversación por VOZ: responda corto, claro y natural, sin listas ni formato de texto.',
      'Trate al visitante de usted, con un tono cordial y neutro, sin regionalismos.',
      'Si le preguntan algo sin relación con este objeto, responda brevemente y lleve la charla de vuelta al objeto.',
      'Responda siempre en español, salvo que el visitante le hable en otro idioma.'
    ].join(' ')
  },

  en: {
    'gesture.active': 'active',
    'brand.tagline': 'Places to discover',
    'intro.eyebrow': 'Look a little closer',
    'intro.subtitle': 'Bring your camera. Discover a story. Let it lead you to the place where it happens.',
    'intro.step1body': 'Scan and explore its content in augmented reality.',
    'intro.step2body': 'At a place on the journey, discover its story right there.',
    'intro.note': 'No account. Just curiosity.',
    'intro.permissions': 'Camera, location and privacy',
    'intro.artKicker': 'A DIFFERENT WAY TO TRAVEL',
    'intro.artFooter': 'From image to place.',
    'scan.eyebrow': 'Exploring',
    'scan.searchLabel': 'Discover the journey',
    'geo.arrivalNote': 'Content will open when your location confirms your arrival. Stop somewhere safe to watch.',
    'guide.label': 'Your guide, right here',
    'entry.marker': 'Discovered in an image',
    'entry.geo': 'At the place',
    'sheet.eyebrow': 'Know your surroundings',
    'sheet.invitation': 'This is just the beginning. Visit this place in person and continue the experience.',
    'sheet.arrived': 'You are here. Take a moment to discover the story of this place.',
    'intro.subtitleScan': 'Point your camera at an image from the journey. Explore its story in augmented reality and talk to your guide.',

    'intro.step1': 'Discover it in an image',
    'intro.step2': 'Experience it in person',
    'intro.step3': 'Explore and talk to your guide',
    'intro.title': 'Every journey starts with a new perspective.',
    'intro.start': 'Start exploring',
    'intro.privacy': 'The camera recognizes images. The microphone is used while you hold the voice button. Your questions are sent to the guide service so it can answer.',
    'intro.privacyGeo': 'The camera recognizes images. Location detects nearby places and is processed on your device. The microphone is used while you hold the voice button; your questions are sent to the guide service.',

    'loading.title': 'Opening your next story',
    'loading.camera': 'Camera',
    'loading.hands': 'Hand gestures',
    'loading.catalog': 'Journey content',
    'loading.note': 'The first load may take a moment.',
    'loading.handsWarn': 'Gestures unavailable. You can continue with voice.',
    'loading.catalogWarn': 'Some content will download as you discover it.',

    'error.camera.title': 'We cannot use the camera',
    'error.camera.body': 'Allow camera access in your browser and try again.',
    'error.generic.title': 'Something went wrong',
    'error.generic.body': 'We could not start the experience. Try again in a moment.',
    'error.retry': 'Try again',
    'error.howto': 'How to allow the camera',
    'error.howtoText': 'In the address bar, tap the lock or settings icon and enable the camera for this site. Then tap Try again.',

    'cal.ready.title': 'Explore with your hands',
    'cal.ready.help': 'Set up two gestures to move the content. You can also continue with standard settings.',
    'cal.ready.start': 'Start calibration',
    'cal.fist.title': 'Close your fist',
    'cal.fist.help': 'Hold it in front of the camera, about 30 cm away.',
    'cal.open.title': 'Open your hand',
    'cal.open.help': 'Spread all five fingers and keep still.',
    'cal.done.title': 'Hand synced',
    'cal.done.help': 'You are ready to discover the journey.',
    'cal.skipped.title': 'Standard settings',
    'cal.skipped.help': 'You can start discovering the journey.',
    'cal.partial.title': 'Partial sync',
    'cal.partial.help': 'Gestures may misread. You can recalibrate from Help.',
    'cal.failed.title': 'We could not sync',
    'cal.failed.help': 'Standard settings are in use. You can recalibrate from Help.',
    'cal.skip': 'Use standard settings',
    'cal.seg1': 'Fist',
    'cal.seg2': 'Open hand',
    'cal.detected': 'We can see your hand',
    'cal.notDetected': 'We can’t see your hand',
    'cal.hint': 'Move your hand a bit farther or find more light.',

    'scan.title': 'One image. A new place.',
    'scan.sub': 'Frame an image from the journey and hold your camera steady.',
    'scan.help': 'Bring the image to about 25 cm, avoid glare and wait a moment. Use an image prepared for this experience.',
    'scan.found.tag': 'Image recognized',
    'scan.preparing': 'Opening the content',
    'scan.appear': 'Your discovery is ready',
    'scan.removeCedula': 'You can set the image aside',
    'scan.errorLoad': 'We could not load "{name}". Move the image away briefly and scan it again.',
    'scan.errorRetry': 'Scan again',
    'scan.errorLoadGeo': 'We could not load "{name}". You can keep using the scanner and try again later.',
    'geo.tag': 'A place near you',
    'geo.distance': 'About {m} m from you',
    'geo.distanceNear': 'Very close',
    'geo.refining': 'Refining location…',
    'geo.exit': 'Keep exploring',
    'geo.manual': 'I am at the place',
    'geo.permissionDenied': 'Location is off. You can still scan images; to detect nearby places, allow location in the site settings.',

    'debug.geo.title': 'Geo Debug',
    'debug.geo.collapse': 'Collapse or expand Geo debug',
    'debug.geo.tracker': 'Tracker',
    'debug.geo.engine': 'Engine',
    'debug.geo.session': 'Session',
    'debug.geo.target': 'Target',
    'debug.geo.simulation': 'Use simulated position',
    'debug.geo.busy': 'Pause engine promotion/invocation',
    'debug.geo.lat': 'Latitude',
    'debug.geo.lng': 'Longitude',
    'debug.geo.accuracy': 'Accuracy (m)',
    'debug.geo.repeats': 'Fixes',
    'debug.geo.inject': 'Send fix',
    'debug.geo.near': 'Proximity',
    'debug.geo.invoke': 'Invoke',
    'debug.geo.exit': 'Exit / rearm',
    'debug.geo.lastFix': 'Last trusted fix',
    'debug.geo.lastRawFix': 'Last received fix',
    'debug.geo.fixStats': 'Acceptance',
    'debug.geo.accuracyStats': 'Accuracy',
    'debug.geo.intervalStats': 'Cadence',
    'debug.geo.rejectStats': 'Rejected',
    'debug.geo.notConfigured': 'Geo not configured',
    'debug.geo.coordsRequired': 'VITE_FIELD_TEST_LAT / LNG required',

    'ui.rescan': 'Keep exploring',
    'ui.rescanConfirm': 'This content and its conversation will close. Keep exploring?',
    'ui.cancel': 'Cancel',
    'ui.close': 'Close',
    'ui.recenter': 'Bring it back',
    'ui.help': 'Help',
    'ui.helpGestures': 'Help with gestures',
    'ui.keyboard': 'Type a question',
    'ui.sheet': 'About this place',
    'ui.closeSheet': 'Close information',
    'ui.ask': 'Ask your guide',
    'ui.recalibrate': 'Recalibrate hand',
    'caption.aria': 'Conversation captions',

    'help.title': 'Quick guide',
    'help.gestures': 'Fist: move · Index: rotate · Index + middle: tilt · Index + thumb: scale.',
    'help.recalibrate': 'If gestures feel off:',

    'ptt.idle': 'Hold to talk',
    'ptt.listening': 'Listening',
    'ptt.thinking': 'Thinking',
    'ptt.speaking': 'Answering',
    'ptt.aria': 'Press and hold to talk',
    'ptt.holdHint': 'Hold until you see Listening',

    'ptt.errMicDenied': 'Mic blocked',
    'ptt.errMicMissing': 'No microphone',
    'ptt.errNetwork': 'No connection',
    'ptt.errRateLimited': 'Wait a moment',
    'ptt.errSessionLost': 'Connection lost',
    'ptt.errUnknown': 'Error. Try again.',

    'voice.err.micDenied': 'The microphone is blocked for this site. Enable it and try again.',
    'voice.err.micMissing': 'We cannot find a microphone. You can type your question with the keyboard.',
    'voice.err.network': 'No connection to the guide. Check your internet connection and try again.',
    'voice.err.rateLimited': 'Too many requests in a short time. Wait a moment and try again.',
    'voice.err.sessionLost': 'The conversation dropped. Hold the voice button to continue.',
    'voice.err.unknown': 'Something went wrong in the conversation. Try again.',
    'mic.howto': 'How to allow the microphone',
    'mic.howtoText': 'In the address bar, tap the lock or settings icon and enable the microphone for this site. Then hold the voice button again.',

    'caption.you': 'You:',
    'caption.typing': 'You are saying…',
    'caption.thinking': 'Thinking…',

    'keyboard.placeholder': 'Type your question…',
    'keyboard.send': 'Send',

    'sheet.culture': 'Culture',
    'sheet.period': 'Period',
    'sheet.material': 'Material',
    'sheet.origin': 'Origin',
    'sheet.inventory': 'Reference',
    'sheet.invPrefix': 'Ref.',

    'gesture.move': 'Move',
    'gesture.rotateY': 'Rotate',
    'gesture.rotateX': 'Tilt',
    'gesture.scale': 'Scale',
    'gesture.rail': 'Available gestures. The gesture in use is identified as active.',
    'gesture.video.rotateY': 'Seek',
    'gesture.video.rotateX': 'Volume',
    'help.gesturesVideo': 'Fist: move · Index: seek · Index + middle: volume · Index + thumb: scale.',
    'media.play': 'Play',
    'media.pause': 'Pause',
    'media.sound.enable': 'Enable sound',

    'lang.label': 'Language',

    'guide.persona': [
      'You are the conversational guide of an Augmented Reality travel experience.',
      'The visitor currently has the object "{name}" in front of their camera.',
      'Context about this object (use it as your source of truth): {description}',
      'You have access to internet search: use it when asked something about this object (or related topics) not covered in the context above, or that requires up-to-date information.',
      'This is a VOICE conversation: answer short, clear and natural, without lists or text formatting.',
      'Address the visitor courteously and professionally.',
      'If asked about something unrelated to this object, answer briefly and steer the conversation back to the object.',
      'Always respond in English, unless the visitor speaks to you in another language.'
    ].join(' ')
  }
};

export const SUPPORTED_LOCALES = Object.keys(LOCALES);

const SUPPORTED = SUPPORTED_LOCALES;
let current = 'es';

/**
 * Devuelve la preferencia de idioma que rige los textos de la interfaz.
 */
export function getLang() {
  return current;
}

/**
 * Busca una traducción por clave y sustituye sus variables de formato.
 */
export function t(key, params) {
  const str = LOCALES[current]?.[key] ?? LOCALES.es[key] ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (marker, name) =>
    params[name] !== undefined ? String(params[name]) : marker
  );
}

/**
 * Selecciona un idioma inicial compatible a partir de preferencia o navegador.
 */
function detectInitialLang() {
  const urlLang = new URLSearchParams(window.location.search).get('lang');
  if (urlLang && SUPPORTED.includes(urlLang)) return urlLang;
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : 'es';
}

/**
 * Actualiza nodos con claves de traducción cuando cambia la preferencia.
 */
function applyToDom() {
  document.documentElement.lang = current;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(',').forEach((pair) => {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
}

/**
 * Cambia el idioma y sincroniza los textos visibles.
 */
export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === current) {
    if (lang === current) applyToDom();
    return;
  }
  current = lang;
  applyToDom();
}

/**
 * Alterna entre los idiomas admitidos.
 */
export function toggleLang() {
  setLang(current === 'es' ? 'en' : 'es');
}

/**
 * Establece la selección inicial e instala la traducción en la interfaz.
 */
export function initI18n() {
  current = detectInitialLang();
  applyToDom();
}
