/**
 * Identidad visual seleccionable mediante la URL. Aplica paletas y metadatos de la experiencia
 * conservando las claves utilizadas por enlaces anteriores.
 */

export const MUSEUMS = {
  laton: {
    id: 'laton',
    name: 'Umbral',
    mark: 'U', // Letra identificadora que se utiliza cuando no existe un símbolo personalizado.
    colors: {
      ink: '#F7F4EC',
      ink2: '#EDE9DF',
      bone: '#233E35',
      accent: '#335C48',
      onAccent: '#FFFFFF',
      listen: '#AB4336',
      speak: '#C6DCC8'
    },
    haptics: true,
    sound: true
  },
  jade: {
    id: 'jade',
    name: 'Umbral · Bosque',
    mark: 'J',
    colors: {
      ink: '#EFF4ED',
      ink2: '#DFE8DC',
      bone: '#213F32',
      accent: '#315F48',
      onAccent: '#FFFFFF',
      listen: '#AA4135',
      speak: '#C4DCC4'
    },
    haptics: true,
    sound: true
  },
  indigo: {
    id: 'indigo',
    name: 'Umbral · Horizonte',
    mark: 'Í',
    colors: {
      ink: '#F2F3F7',
      ink2: '#E3E7EF',
      bone: '#2C354B',
      accent: '#455C85',
      onAccent: '#FFFFFF',
      listen: '#AC413C',
      speak: '#CBD9EE'
    },
    haptics: true,
    sound: true
  }
};

const ALIASES = { galeria: 'laton' };

/**
 * Lee la variante visual solicitada en el enlace y establece una alternativa válida.
 */
export function getMuseumKeyFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('museo');
  if (!raw) return 'laton';
  const key = raw.trim().toLowerCase();
  return Object.hasOwn(MUSEUMS, key)
    ? key
    : (Object.hasOwn(ALIASES, key) ? ALIASES[key] : 'laton');
}

/**
 * Aplica variables de color, tipografía y metadatos de la variante elegida.
 */
export function applyTheme(museumId = getMuseumKeyFromUrl()) {
  const museum = Object.hasOwn(MUSEUMS, museumId) ? MUSEUMS[museumId] : MUSEUMS.laton;
  const root = document.documentElement;

  root.style.setProperty('--m-ink', museum.colors.ink);
  root.style.setProperty('--m-ink-2', museum.colors.ink2);
  root.style.setProperty('--m-bone', museum.colors.bone);
  root.style.setProperty('--m-accent', museum.colors.accent);
  root.style.setProperty('--m-on-accent', museum.colors.onAccent);
  root.style.setProperty('--m-listen', museum.colors.listen);
  root.style.setProperty('--m-speak', museum.colors.speak);

  document.title = museum.name;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', museum.colors.ink);

  return museum;
}
