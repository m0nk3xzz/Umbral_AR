/**
 * Caché reutilizable de recursos con capacidad limitada. Evita expulsar entradas todavía utilizadas y
 * libera únicamente las que no tienen consumidores.
 */

import { withDeadline } from './async.js';
/**
 * Crea un caché con referencia de uso por clave y eliminación bajo presión de capacidad.
 */
export function createResourceCache({ load, dispose, maxSize = 5 }) {
  const entries = new Map();
  /**
   * Reduce el tamaño descartando solamente recursos cargados y sin clientes activos.
   */
  function trim() {
    while (entries.size > maxSize) {
      const candidate = [...entries].find(([, entry]) => entry.resource && entry.refs === 0);
      if (!candidate) return;
      entries.delete(candidate[0]);
      dispose(candidate[1].resource);
    }
  }
  /**
   * Comparte una misma carga entre llamadas concurrentes de la misma clave.
   */
  function ensure(key) {
    let entry = entries.get(key);
    if (entry) {
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    }
    entry = { refs: 0, resource: null, promise: null };
    entries.set(key, entry);
    entry.promise = withDeadline(signal => load(key, signal), { onLateResult: dispose }).then(resource => {
      entry.resource = resource;
      trim();
      return resource;
    }).catch(error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
    return entry;
  }
  return {
    /**
     * Solicita un recurso por adelantado sin considerarlo todavía adquirido.
     */
    preload(key) { return ensure(key).promise; },
    /**
     * Incrementa el uso de un recurso para protegerlo de la expulsión.
     */
    acquire(key) {
      const entry = ensure(key);
      entry.refs++;
      let released = false;
      return {
        promise: entry.promise,
        /**
         * Marca el recurso como disponible cuando su consumidor termina.
         */
        release() {
          if (released) return;
          released = true;
          entry.refs--;
          trim();
        }
      };
    }
  };
}
