/**
 * Filtro de posiciones GPS para descartar datos obsoletos o saltos improbables. Solo entrega medidas
 * aceptadas que puedan sustentar decisiones de proximidad.
 */


import { haversineMeters } from './geoEngine.js';

/**
 * Configura límites de precisión y velocidad, y mantiene muestras recientes para detectar saltos.
 */
export function createGeoFixFilter({
  maxUsefulAccuracyM = Infinity,
  maxSpeedMps = 12,
  baseAllowanceM = 15,
  jumpConfirmFixes = 2,
  jumpConsistencyM = 20,
  recoveryAccuracyRatio = 0.6,
  spatialWindow = 5
} = {}) {
  let lastAccepted = null;
  let pendingJump = null;
  let lastSourceTimestamp = null;
  let recent = [];

  /**
   * Devuelve el motivo de descarte sin modificar la última posición confirmada.
   */
  function reject(reason, extra = {}) {
    return { accepted: false, reason, ...extra };
  }

  /**
   * Registra una muestra confiable y actualiza las referencias temporales del filtro.
   */
  function accept(fix, { recoveredJump = false, jumpDistanceM = 0, rawFix = fix } = {}) {
    recent.push({ ...rawFix });
    recent = recent.slice(-spatialWindow);
    lastAccepted = { ...fix };
    pendingJump = null;
    return { accepted: true, fix: { ...fix }, recoveredJump, jumpDistanceM };
  }

  /**
   * Contrasta la muestra contra su edad, precisión y coherencia espacial; recupera saltos confirmados.
   */
  function evaluate(rawFix, now) {
    const fix = {
      latitude: Number(rawFix?.latitude),
      longitude: Number(rawFix?.longitude),
      accuracy: Number(rawFix?.accuracy),
      at: Number(now),
      sourceTimestamp: rawFix?.sourceTimestamp ?? null
    };

    if (![
      fix.latitude,
      fix.longitude,
      fix.accuracy,
      fix.at
    ].every(Number.isFinite)) return reject('structural');

    if (fix.latitude < -90 || fix.latitude > 90 || fix.longitude < -180 || fix.longitude > 180 || fix.accuracy < 0) {
      return reject('structural');
    }

    if (fix.accuracy > maxUsefulAccuracyM) return reject('accuracy');
    if (Number.isFinite(fix.sourceTimestamp)) {
      if (lastSourceTimestamp != null && fix.sourceTimestamp <= lastSourceTimestamp) return reject('duplicate');
      lastSourceTimestamp = fix.sourceTimestamp;
    }
    if (!lastAccepted) return accept(fix);

    const elapsedMs = Math.max(0, fix.at - lastAccepted.at);
    const elapsedS = elapsedMs / 1000;
    const jumpDistanceM = haversineMeters(lastAccepted, fix);
    const uncertaintyAllowanceM = (lastAccepted.accuracy + fix.accuracy) * 0.5;
    const allowedDistanceM = baseAllowanceM + maxSpeedMps * elapsedS + uncertaintyAllowanceM;

    if (jumpDistanceM <= allowedDistanceM) {
      const peers = [...recent, fix].filter(x => x.accuracy <= Math.max(12, fix.accuracy * 1.5) &&
        haversineMeters(x, fix) <= Math.max(12, fix.accuracy * 1.5));
      if (peers.length >= 3) {
        const median = (key) => peers.map(x => x[key]).sort((a,b) => a-b)[Math.floor(peers.length / 2)];
        return accept({ ...fix, latitude: median('latitude'), longitude: median('longitude') }, { jumpDistanceM, rawFix: fix });
      }
      return accept(fix, { jumpDistanceM });
    }

    const clearlyBetterAccuracy =
      lastAccepted.accuracy > 0 &&
      fix.accuracy <= lastAccepted.accuracy * recoveryAccuracyRatio &&
      fix.accuracy <= maxUsefulAccuracyM;
    if (clearlyBetterAccuracy) return accept(fix, { recoveredJump: true, jumpDistanceM });

    const consistencyRadiusM = Math.max(jumpConsistencyM, fix.accuracy, pendingJump?.fix?.accuracy ?? 0);
    const consistentWithPending = pendingJump && haversineMeters(pendingJump.fix, fix) <= consistencyRadiusM;

    if (consistentWithPending) {
      pendingJump.count += 1;
      pendingJump.fix = { ...fix };
    } else {
      pendingJump = { fix: { ...fix }, count: 1 };
    }

    if (pendingJump.count >= jumpConfirmFixes) {
      return accept(fix, { recoveredJump: true, jumpDistanceM });
    }

    return reject('jump', {
      jumpDistanceM,
      allowedDistanceM,
      pendingCount: pendingJump.count
    });
  }

  /**
   * Vacía el historial para que una sesión nueva no herede posiciones antiguas.
   */
  function reset() {
    lastAccepted = null;
    pendingJump = null;
    lastSourceTimestamp = null;
    recent = [];
  }

  /**
   * Expone las últimas decisiones del filtro para supervisión.
   */
  function getSnapshot() {
    return {
      lastAccepted: lastAccepted ? { ...lastAccepted } : null,
      lastSourceTimestamp,
      spatialSamples: recent.length,
      pendingJump: pendingJump ? { fix: { ...pendingJump.fix }, count: pendingJump.count } : null
    };
  }

  return { evaluate, reset, getSnapshot };
}
