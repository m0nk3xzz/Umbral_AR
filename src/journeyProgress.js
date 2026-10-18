/**
 * Registro local del recorrido por piezas. Conserva eventos asociados a una experiencia y valida los
 * datos leídos del almacenamiento del navegador.
 */

const PREFIX = 'webar:journey:v1:';
const EMPTY = Object.freeze({ discoveredAt: null, arrivedAt: null, completedAt: null });

/**
 * Comprueba que el almacenamiento elegido puede utilizarse sin provocar una excepción.
 */
function storageAvailable(storage) {
  try { return storage ?? (typeof localStorage !== 'undefined' ? localStorage : null); }
  catch { return null; }
}
/**
 * Normaliza valores utilizados como componentes de las claves persistentes.
 */
function safePart(value) {
  const part = String(value ?? '').trim();
  return part.length > 0 && part.length <= 150 ? part : null;
}
/**
 * Descarta fechas no numéricas o imposibles leídas del almacenamiento.
 */
function validTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
/**
 * Agrupa la lectura y escritura de eventos por experiencia y pieza.
 */
export function createJourneyProgress({ experienceId = 'default', storage, now = () => Date.now() } = {}) {
  const namespace = safePart(experienceId) ?? 'default';
  const store = storageAvailable(storage);
  const fallback = new Map();
  const dirty = new Set();
  const keyFor = (id) => {
    const part = safePart(id);
    return part ? `${PREFIX}${encodeURIComponent(namespace)}:${encodeURIComponent(part)}` : null;
  };
  /**
   * Devuelve el historial validado, incluso si existen datos antiguos o corruptos.
   */
  function read(id) {
    const key = keyFor(id);
    if (!key) return { ...EMPTY };
    let raw = fallback.get(key) ?? null;
    if (!dirty.has(key)) {
      try { raw = store?.getItem(key) ?? raw; } catch { /* Si el navegador impide usar almacenamiento, se mantiene el registro en memoria. */ }
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...EMPTY };
      return { discoveredAt: validTimestamp(parsed.discoveredAt), arrivedAt: validTimestamp(parsed.arrivedAt), completedAt: validTimestamp(parsed.completedAt) };
    } catch { return { ...EMPTY }; }
  }
  /**
   * Registra un evento de recorrido con marca temporal y persistencia segura.
   */
  function record(id, event) {
    const key = keyFor(id);
    const fields = { discovered: 'discoveredAt', arrived: 'arrivedAt', completed: 'completedAt' };
    const field = Object.hasOwn(fields, event) ? fields[event] : null;
    if (!key || !field) return null;
    const value = read(id);
    if (value[field] !== null) return value;
    value[field] = validTimestamp(now()) ?? Date.now();
    if (event === 'completed' && !value.arrivedAt) value.arrivedAt = value.completedAt;
    const serialized = JSON.stringify(value);
    fallback.set(key, serialized);
    if (!store) dirty.add(key);
    else {
      try { store.setItem(key, serialized); dirty.delete(key); }
      catch { dirty.add(key); }
    }
    return value;
  }
  /**
   * Elimina el progreso de una pieza sin borrar los datos ajenos.
   */
  function clear(id) {
    const key = keyFor(id);
    if (!key) return;
    fallback.delete(key);
    try { store?.removeItem(key); dirty.delete(key); }
    catch {
      fallback.set(key, 'null');
      dirty.add(key);
    }
  }
  return { read, record, clear };
}

export const journeyProgress = createJourneyProgress({ experienceId: 'tourism' });
