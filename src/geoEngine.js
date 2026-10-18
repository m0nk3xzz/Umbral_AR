/**
 * Máquina de estados de proximidad geográfica. Evalúa posiciones válidas, zonas permitidas, permanencia
 * y precisión antes de recomendar o activar una pieza.
 */


/**
 * Calcula una distancia aproximada sobre la superficie terrestre a partir de dos coordenadas.
 */
export function haversineMeters(a, b) {
  const R = 6371000;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const bounded = Math.max(0, Math.min(1, h));
  return 2 * R * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

/**
 * Determina si una posición queda dentro de un polígono geográfico.
 */
export function insideGeoPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const y1 = Array.isArray(a) ? a[0] : a?.latitude;
    const x1 = Array.isArray(a) ? a[1] : a?.longitude;
    const y2 = Array.isArray(b) ? b[0] : b?.latitude;
    const x2 = Array.isArray(b) ? b[1] : b?.longitude;
    if (![x1, x2, y1, y2].every(Number.isFinite)) return false;
    if ((y1 > point.latitude) !== (y2 > point.latitude) &&
        point.longitude < (x2 - x1) * (point.latitude - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

/**
 * Acepta ubicaciones situadas en la zona permitida y fuera de los polígonos excluidos.
 */
export function insideAllowedZone(point, piece) {
  if (piece.activationPolygon && !insideGeoPolygon(point, piece.activationPolygon)) return false;
  return !(piece.exclusionPolygons ?? []).some(poly => insideGeoPolygon(point, poly));
}

/**
 * Redondea distancias para que el indicador visual no cambie en cada pequeño movimiento.
 */
export function roundDistance(distanceM, step = 5) {
  if (!Number.isFinite(distanceM)) return Infinity;
  return Math.max(step, Math.round(distanceM / step) * step);
}

/**
 * Inicializa el estado de cada pieza y expone operaciones deterministas para evaluar la proximidad.
 */
export function createGeoEngine({ pieces, thresholds }) {
  const th = {
    invokeFixes: 3,
    invokeMinDwellMs: 3000,
    autoGoodAccuracyM: 12,
    confidenceRadiusFactor: 0.75,
    exitFixes: 2,
    candidateSwitchFixes: 2,
    invokeMinSampleIntervalMs: 750,
    signalLostMs: 30000,
    failedCooldownMs: 20000,
    distanceStepM: 5,
    displaySmoothingAlpha: 0.35,
    ...thresholds
  };

  const states = new Map((pieces ?? []).map((piece) => [piece.id, {
    ...piece,
    state: 'idle',
    distanceM: Infinity,
    displayDistanceM: Infinity,
    lastObservedDistanceM: Infinity,
    lastObservedAccuracyM: Infinity,
    lastTrustedAccuracyM: Infinity,
    invokeStreak: 0,
    exitStreak: 0,
    failedUntil: 0,
    lastValidAt: null,
    lastInvokeSampleAt: null,
    invokeStartedAt: null
  }]));

  const busyReasons = new Set();
  let currentCandidateId = null;
  let switchCandidateId = null;
  let switchStreak = 0;
  let dismissLatchId = null;
  let lastEmitted = null;

  const isBusy = () => busyReasons.size > 0;

  /**
   * Genera eventos de alejamiento cuando el estado de una pieza deja de considerarse cercano.
   */
  function emitFar(events) {
    if (lastEmitted !== null) events.push({ type: 'far' });
    lastEmitted = null;
  }

  /**
   * Verifica si la precisión y antigüedad de una muestra permiten utilizarla para proximidad.
   */
  function validProximityFix(p, fix) {
    return Boolean(fix) &&
      Number.isFinite(fix.latitude) &&
      Number.isFinite(fix.longitude) &&
      Number.isFinite(fix.accuracy) &&
      fix.accuracy >= 0 &&
      fix.accuracy <= p.maxProximityAccuracyM;
  }

  /**
   * Evita que una distancia dudosa se utilice como confirmación de entrada o invocación.
   */
  function trustDistance(p, fix, observedDistanceM) {
    p.distanceM = observedDistanceM;
    p.lastTrustedAccuracyM = fix.accuracy;
    p.lastValidAt = fix.at;
    p.lastTrustedFix = { latitude: fix.latitude, longitude: fix.longitude };
    const alpha = Math.min(1, Math.max(0, th.displaySmoothingAlpha));
    p.displayDistanceM = Number.isFinite(p.displayDistanceM)
      ? alpha * observedDistanceM + (1 - alpha) * p.displayDistanceM
      : observedDistanceM;
  }

  function resetInvokeConfirmation(p) {
    p.invokeStreak = 0;
    p.lastInvokeSampleAt = null;
    p.invokeStartedAt = null;
  }

  function toIdle(p) {
    p.state = 'idle';
    resetInvokeConfirmation(p);
    p.exitStreak = 0;
    p.failedUntil = 0;
    p.distanceM = Infinity;
    p.displayDistanceM = Infinity;
    p.lastTrustedAccuracyM = Infinity;
    p.lastValidAt = null;
    if (dismissLatchId === p.id) dismissLatchId = null;
  }

  function processExit(p, fix, observedDistanceM) {
    if (!validProximityFix(p, fix)) return false;
    trustDistance(p, fix, observedDistanceM);
    p.exitStreak = p.distanceM > p.exitRadiusM ? p.exitStreak + 1 : 0;
    if (p.exitStreak >= th.exitFixes) {
      toIdle(p);
      return true;
    }
    return false;
  }

  /**
   * Selecciona la pieza cercana más apropiada cuando existen varias alternativas.
   */
  function chooseCandidate() {
    if (dismissLatchId) return null;
    const near = [...states.values()]
      .filter((p) => p.state === 'near' && p.distanceM <= p.enterRadiusM)
      .sort((a, b) => a.distanceM - b.distanceM);
    if (!near.length) {
      currentCandidateId = null;
      switchCandidateId = null;
      switchStreak = 0;
      return null;
    }

    const nearest = near[0];
    const current = currentCandidateId ? states.get(currentCandidateId) : null;
    if (!current || current.state !== 'near' || current.distanceM > current.enterRadiusM) {
      currentCandidateId = nearest.id;
      switchCandidateId = null;
      switchStreak = 0;
      return nearest;
    }
    if (nearest.id === current.id) {
      switchCandidateId = null;
      switchStreak = 0;
      return current;
    }

    if (switchCandidateId === nearest.id) switchStreak += 1;
    else {
      switchCandidateId = nearest.id;
      switchStreak = 1;
    }
    if (switchStreak >= th.candidateSwitchFixes) {
      currentCandidateId = nearest.id;
      switchCandidateId = null;
      switchStreak = 0;
      return nearest;
    }
    return current;
  }

  /**
   * Ejecuta transiciones de estado y comprueba precisión, permanencia y zonas antes de invocar.
   */
  function evaluate(events, fix, { allowInvoke = true } = {}) {
    if (isBusy()) {
      currentCandidateId = null;
      switchCandidateId = null;
      switchStreak = 0;
      lastEmitted = null;
      return events;
    }

    const candidate = chooseCandidate();
    if (!candidate) {
      emitFar(events);
      return events;
    }

    if (fix && !validProximityFix(candidate, fix)) return events;

    const rounded = roundDistance(candidate.displayDistanceM, th.distanceStepM);
    const hasDecisionFix = Boolean(fix);
    const canInvokeAccuracy = hasDecisionFix && fix.accuracy <= Math.min(candidate.maxInvokeAccuracyM, th.autoGoodAccuracyM);
    const uncertaintyPenaltyM = hasDecisionFix
      ? fix.accuracy * th.confidenceRadiusFactor
      : 0;
    const confidenceDistanceM = candidate.distanceM + uncertaintyPenaltyM;
    const canInvokeConfidence = canInvokeAccuracy && confidenceDistanceM <= candidate.invokeRadiusM &&
      insideAllowedZone(fix, candidate);

    const previousSameCandidate = lastEmitted?.id === candidate.id ? lastEmitted : null;
    const displayCanInvokeAccuracy = hasDecisionFix
      ? canInvokeAccuracy
      : (previousSameCandidate?.canInvokeAccuracy ?? false);
    const displayCanInvokeConfidence = hasDecisionFix
      ? canInvokeConfidence
      : (previousSameCandidate?.canInvokeConfidence ?? false);

    if (
      !lastEmitted ||
      lastEmitted.id !== candidate.id ||
      lastEmitted.distanceM !== rounded ||
      lastEmitted.accuracyM !== (hasDecisionFix ? fix.accuracy : candidate.lastTrustedAccuracyM) ||
      lastEmitted.canInvokeAccuracy !== displayCanInvokeAccuracy ||
      lastEmitted.canInvokeConfidence !== displayCanInvokeConfidence
    ) {
      events.push({
        type: 'near',
        id: candidate.id,
        distanceM: rounded,
        rawDistanceM: candidate.distanceM,
        accuracyM: hasDecisionFix ? fix.accuracy : candidate.lastTrustedAccuracyM,
        confidenceDistanceM,
        canInvokeAccuracy: displayCanInvokeAccuracy,
        canInvokeConfidence: displayCanInvokeConfidence
      });
      lastEmitted = {
        id: candidate.id,
        distanceM: rounded,
        accuracyM: hasDecisionFix ? fix.accuracy : candidate.lastTrustedAccuracyM,
        canInvokeAccuracy: displayCanInvokeAccuracy,
        canInvokeConfidence: displayCanInvokeConfidence
      };
    }

    if (!allowInvoke || !fix) return events;

    const qualifies = candidate.distanceM <= candidate.invokeRadiusM && canInvokeConfidence;
    if (qualifies) {
      const sampleSeparated = candidate.lastInvokeSampleAt == null ||
        fix.at - candidate.lastInvokeSampleAt >= th.invokeMinSampleIntervalMs;
      if (sampleSeparated) {
        if (candidate.invokeStartedAt == null) candidate.invokeStartedAt = fix.at;
        candidate.invokeStreak += 1;
        candidate.lastInvokeSampleAt = fix.at;
      }
    } else {
      resetInvokeConfirmation(candidate);
    }

    if (candidate.invokeStreak >= th.invokeFixes &&
        candidate.invokeStartedAt != null && fix.at - candidate.invokeStartedAt >= th.invokeMinDwellMs) {
      candidate.state = 'pending';
      resetInvokeConfirmation(candidate);
      currentCandidateId = null;
      lastEmitted = null;
      events.push({ type: 'invoke', id: candidate.id });
    }
    return events;
  }

  /**
   * Incorpora una muestra nueva, actualiza estados y devuelve los eventos resultantes.
   */
  function update(rawFix, now) {
    const fix = { ...rawFix, at: now };
    const events = [];

    for (const p of states.values()) {
      const observedDistanceM = haversineMeters(fix, p);
      p.lastObservedDistanceM = observedDistanceM;
      p.lastObservedAccuracyM = Number.isFinite(fix.accuracy) ? fix.accuracy : Infinity;

      if (p.state === 'failed' && now >= p.failedUntil) toIdle(p);
      if (p.state === 'consumed' || p.state === 'muted' || p.state === 'failed') {
        processExit(p, fix, observedDistanceM);
        continue;
      }
      if (p.state === 'pending') {
        if (validProximityFix(p, fix)) trustDistance(p, fix, observedDistanceM);
        continue;
      }
      if (!validProximityFix(p, fix)) continue;

      trustDistance(p, fix, observedDistanceM);
      if (!insideAllowedZone(fix, p)) {
        if (p.state === 'near') toIdle(p);
        continue;
      }
      if (isBusy() || dismissLatchId) continue;
      if (p.state === 'idle' && p.distanceM <= p.enterRadiusM) {
        p.state = 'near';
        p.exitStreak = 0;
        resetInvokeConfirmation(p);
      } else if (p.state === 'near') {
        p.exitStreak = p.distanceM > p.exitRadiusM ? p.exitStreak + 1 : 0;
        if (p.exitStreak >= th.exitFixes) toIdle(p);
      }
    }

    return evaluate(events, fix);
  }

  /**
   * Reevalúa pérdidas de señal y tiempos pendientes aunque no llegue otra posición.
   */
  function tick(now) {
    const events = [];
    let stateChanged = false;
    for (const p of states.values()) {
      if (p.state === 'failed' && now >= p.failedUntil) {
        toIdle(p);
        stateChanged = true;
      }
      if (p.state === 'near' && p.lastValidAt != null && now - p.lastValidAt >= th.signalLostMs) {
        toIdle(p);
        if (currentCandidateId === p.id) currentCandidateId = null;
        stateChanged = true;
      }
    }
    return stateChanged ? evaluate(events, null, { allowInvoke: false }) : events;
  }

  /**
   * Marca ocupaciones del recorrido para impedir invocaciones simultáneas.
   */
  function setBusy(reason, busy) {
    const events = [];
    if (busy) busyReasons.add(reason);
    else busyReasons.delete(reason);

    currentCandidateId = null;
    switchCandidateId = null;
    switchStreak = 0;
    lastEmitted = null;
    for (const p of states.values()) {
      if (p.state === 'near') {
        toIdle(p);
      }
    }
    return events;
  }

  /**
   * Sincroniza el motor cuando una pieza ya fue reservada por otra fuente.
   */
  function onSessionClaimed({ entryId, source }) {
    const events = [];
    const visibleId = currentCandidateId ?? lastEmitted?.id ?? null;
    for (const p of states.values()) {
      if (p.id === entryId) {
        if (source === 'marker') {
          if (p.state !== 'consumed') toIdle(p);
          continue;
        }
        p.state = 'consumed';
        resetInvokeConfirmation(p);
        p.exitStreak = 0;
      } else if (source === 'marker' && p.id === visibleId && (p.state === 'near' || p.state === 'pending')) {
        p.state = 'muted';
        resetInvokeConfirmation(p);
        p.exitStreak = 0;
      } else if (p.state === 'pending') {
        p.state = 'muted';
      }
    }
    currentCandidateId = null;
    switchCandidateId = null;
    switchStreak = 0;
    lastEmitted = null;
    return events;
  }

  /**
   * Descarta la sugerencia actual de una pieza conforme a las reglas del recorrido.
   */
  function dismiss(id) {
    const p = states.get(id);
    if (!p) return [];
    p.state = 'muted';
    resetInvokeConfirmation(p);
    p.exitStreak = 0;
    dismissLatchId = id;
    currentCandidateId = null;
    switchCandidateId = null;
    switchStreak = 0;
    const events = [];
    emitFar(events);
    return events;
  }

  /**
   * Introduce enfriamiento tras un fallo para evitar reintentos continuos.
   */
  function markFailed(id, now) {
    const p = states.get(id);
    if (!p) return [];
    p.state = 'failed';
    p.failedUntil = now + th.failedCooldownMs;
    resetInvokeConfirmation(p);
    p.exitStreak = 0;
    if (currentCandidateId === id) currentCandidateId = null;
    lastEmitted = null;
    return [];
  }

  /**
   * Deshace una invocación que no llegó a consolidarse.
   */
  function rollbackInvoke(id) {
    const p = states.get(id);
    if (!p || p.state !== 'pending') return [];
    p.state = 'near';
    resetInvokeConfirmation(p);
    currentCandidateId = id;
    return [];
  }

  /**
   * Ofrece una copia de estados y métricas para interfaz y diagnóstico.
   */
  function getSnapshot() {
    return {
      busy: isBusy(),
      busyReasons: [...busyReasons],
      candidateId: currentCandidateId ?? lastEmitted?.id ?? null,
      dismissLatchId,
      pieces: [...states.values()].map((p) => ({
        id: p.id,
        state: p.state,
        distanceM: p.distanceM,
        displayDistanceM: p.displayDistanceM,
        lastObservedDistanceM: p.lastObservedDistanceM,
        lastObservedAccuracyM: p.lastObservedAccuracyM,
        lastTrustedAccuracyM: p.lastTrustedAccuracyM,
        lastValidAt: p.lastValidAt,
        invokeStreak: p.invokeStreak,
        invokeStartedAt: p.invokeStartedAt,
        exitStreak: p.exitStreak,
        enterRadiusM: p.enterRadiusM,
        invokeRadiusM: p.invokeRadiusM,
        exitRadiusM: p.exitRadiusM,
        maxProximityAccuracyM: p.maxProximityAccuracyM,
        maxInvokeAccuracyM: p.maxInvokeAccuracyM,
        insideAllowedZone: p.lastTrustedFix ? insideAllowedZone(p.lastTrustedFix, p) : false
      }))
    };
  }

  return {
    update,
    tick,
    setBusy,
    onSessionClaimed,
    dismiss,
    markFailed,
    rollbackInvoke,
    getState: (id) => states.get(id)?.state ?? null,
    getCandidateId: () => currentCandidateId ?? lastEmitted?.id ?? null,
    getDistance: (id) => states.get(id)?.distanceM ?? Infinity,
    getSnapshot,
    isBusy
  };
}
