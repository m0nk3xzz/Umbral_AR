/*
 * Catálogo base de experiencias. Cada pieza aporta identificador, marcador opcional, metadatos y
 * contenido; las coordenadas geográficas solo deben cargarse cuando sean reales y verificadas.
 */



/*
 * Cada entrada de este arreglo representa una pieza reconocible por marcador, por GPS o por ambos.
 * Mantén identificadores únicos y rutas que existan en public/.
 */
/*
 * Para incorporar una imagen al reconocimiento, reúne todos los marcadores y vuelve a compilarlos
 * en un único archivo .mind. El índice markerIndex debe corresponder exactamente al orden de
 * compilación; una pieza exclusivamente geográfica no necesita ese índice. Los campos stages
 * permiten mostrar contenido de descubrimiento para marcadores y contenido in situ para GPS.
 * No introduzcas ubicaciones ni datos curatoriales que todavía no hayan sido comprobados.
 */

export const MARKER_CATALOG = [
  ,{
    // Identificador estable que la aplicación usa para reconocer este destino
    // en el progreso del recorrido, los registros y el contexto de la guía IA.
    id: 'destino-1',

    // Posición de la imagen objetivo dentro de marcadores.mind; el índice debe
    // coincidir con el orden en que la imagen se incluyó al compilar el archivo.
    markerIndex: 0,

    // Coordenadas y radios para activar el mismo destino por ubicación.
    // Completa latitude y longitude con coordenadas reales antes de usar Geo.
    geo: {
      latitude: null,
      longitude: null,
      enterRadiusM: 30,
      invokeRadiusM: 60,
      exitRadiusM: 70,
      maxProximityAccuracyM: 60,
      maxInvokeAccuracyM: 15,
      viewFill: 0.35
    },

    // Texto breve que la interfaz puede mostrar en la tarjeta de proximidad.
    summary: 'Acércate para descubrir este destino.',

    // Nombre presentado al usuario y utilizado por la guía conversacional.
    name: 'Destino 1 · información por completar',

    // Indica que los datos descriptivos aún requieren revisión curatorial.
    curatorialVerified: false,

    // Descripción de contexto para la guía; reemplázala por información
    // confirmada antes de presentar datos históricos como hechos.
    description:
      'Información del destino pendiente de validación. Completa esta descripción con datos verificados antes de publicarla.',

    // Medio que se mostrará al activar el destino por MindAR o por Geo.
    // Elige `model3d`, `video` o `image` y asigna una ruta existente en `src`.
    // Para video, la reproducción debe comenzar silenciada y habilitar sonido
    // solo después de una acción explícita del usuario.
    content: {
      type: 'model3d',
      src: '/models/modelo.glb'
    },

    // Escala inicial usada solo cuando `content.type` es `model3d`.
    initialScale: 0.1,

    // Posición y rotación opcionales para centrar el contenido frente a cámara;
    // con `null`, la aplicación utiliza los valores generales de config.js.
    centerPosition: null,
    centerRotation: null,

    // Si es true, descarga el contenido durante el arranque; si es false,
    // espera a que el usuario active este destino para cargarlo.
    preload: true,

    // Datos informativos de la ficha; completa únicamente los campos verificados.
    inventoryNumber: '—',
    culture: '—',
    period: '—',
    material: '—',
    origin: '—',

    // Preguntas sugeridas que la interfaz puede ofrecer al visitante.
    suggestedQuestions: [
      '¿Qué información está verificada?',
      '¿Qué datos faltan por investigar?'
    ],

    // Traducciones opcionales. Los campos ausentes en otro idioma pueden usar
    // los valores principales en español como alternativa.
    translations: {
      en: {
        name: 'Destination 1 · information to be completed',
        description:
          'Destination information is pending verification. Add confirmed details before publication.',
        suggestedQuestions: [
          'What information has been verified?',
          'What still needs research?'
        ]
      }
    }
  }
/*
  ,{
    
    id: 'destino-geo-1',

    geo: {
      latitude: null,
      longitude: null,
      enterRadiusM: 60,
      invokeRadiusM: 30,
      exitRadiusM: 70,
      maxProximityAccuracyM: 60,
      maxInvokeAccuracyM: 15,
      viewFill: 0.35
    },

    name: 'Destino Geo · información por completar',
    curatorialVerified: false,
    description:
      'Información del destino pendiente de validación. Completa esta descripción con datos verificados antes de publicarla.',
    summary: 'Acércate para descubrir este destino.',

    content: {
      type: 'video',
      src: '/media/video-destino.mp4'
    },

    centerPosition: null,
    centerRotation: null,

    preload: false,

    // Completa estos datos solo cuando hayan sido verificados.
    inventoryNumber: '—',
    culture: '—',
    period: '—',
    material: '—',
    origin: '—',

    suggestedQuestions: [
      '¿Qué información está verificada?',
      '¿Qué datos faltan por investigar?'
    ],

    translations: {
      en: {
        name: 'Geo destination · information to be completed',
        description:
          'Destination information is pending verification. Add confirmed details before publication.',
        suggestedQuestions: [
          'What information has been verified?',
          'What still needs research?'
        ]
      }
    }
  },

  ,{

    id: 'destino-mindar-1',

    markerIndex: 0,

    name: 'Destino MindAR · información por completar',
    curatorialVerified: false,
    description:
      'Información del destino pendiente de validación. Completa esta descripción con datos verificados antes de publicarla.',

    content: {
      type: 'model3d',
      src: '/models/modelo.glb'
    },

    initialScale: 0.1,

    centerPosition: null,
    centerRotation: null,

    preload: true,

    inventoryNumber: '—',
    culture: '—',
    period: '—',
    material: '—',
    origin: '—',

    suggestedQuestions: [
      '¿Qué información está verificada?',
      '¿Qué datos faltan por investigar?'
    ],

    translations: {
      en: {
        name: 'MindAR destination · information to be completed',
        description:
          'Destination information is pending verification. Add confirmed details before publication.',
        suggestedQuestions: [
          'What information has been verified?',
          'What still needs research?'
        ]
      }
    }
  },
*/
];