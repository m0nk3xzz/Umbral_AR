/**
 * Adaptador entre la API de geolocalización del navegador y el motor de proximidad. Reinicia
 * seguimientos detenidos, procesa muestras y expone métricas de diagnóstico.
 */


import { createGeoEngine } from './geoEngine.js';
import { createGeoFixFilter } from './geoFixFilter.js';
import { hasGeo } from './catalogUtils.js';
import {
  GEO_ENTER_RADIUS_M,
  GEO_INVOKE_RADIUS_M,
  GEO_EXIT_RADIUS_M,
  GEO_MAX_PROXIMITY_ACCURACY_M,
  GEO_MAX_INVOKE_ACCURACY_M,
  GEO_INVOKE_CONSECUTIVE_FIXES,
  GEO_INVOKE_MIN_DWELL_MS,
  GEO_AUTO_GOOD_ACCURACY_M,
  GEO_CONFIDENCE_RADIUS_FACTOR,
  GEO_WATCH_STALL_MS,
  GEO_WATCH_RESTART_COOLDOWN_MS,
  GEO_EXIT_CONSECUTIVE_FIXES,
  GEO_CANDIDATE_SWITCH_FIXES,
  GEO_INVOKE_MIN_SAMPLE_INTERVAL_MS,
  GEO_FIX_MAX_AGE_MS,
  GEO_SIGNAL_LOST_MS,
  GEO_FAILED_COOLDOWN_MS,
  GEO_DISTANCE_STEP_M,
  GEO_DISPLAY_SMOOTHING_ALPHA,
  GEO_HEALTH_TICK_MS,
  GEO_ENABLE_HIGH_ACCURACY,
  GEO_POSITION_TIMEOUT_MS,
  GEO_MAXIMUM_AGE_MS,
  GEO_JUMP_MAX_SPEED_MPS,
  GEO_JUMP_BASE_ALLOWANCE_M,
  GEO_JUMP_CONFIRM_FIXES,
  GEO_JUMP_CONSISTENCY_M,
  GEO_JUMP_RECOVERY_ACCURACY_RATIO,
  GEO_DEBUG_MOCK_STEP_MS
} from './config.js';

/**
 * Transforma las opciones geográficas del catálogo a la estructura esperada por el motor.
 */
function normalizePiece(entry) {
  const g = entry.geo;
  return {
    id: entry.id,
    latitude: g.latitude,
    longitude: g.longitude,
    enterRadiusM: g.enterRadiusM ?? GEO_ENTER_RADIUS_M,
    invokeRadiusM: g.invokeRadiusM ?? GEO_INVOKE_RADIUS_M,
    exitRadiusM: g.exitRadiusM ?? GEO_EXIT_RADIUS_M,
    maxProximityAccuracyM: g.maxProximityAccuracyM ?? GEO_MAX_PROXIMITY_ACCURACY_M,
    maxInvokeAccuracyM: g.maxInvokeAccuracyM ?? GEO_MAX_INVOKE_ACCURACY_M,
    activationPolygon: g.activationPolygon ?? null,
    exclusionPolygons: g.exclusionPolygons ?? []
  };
}

/**
 * Inicializa contadores de calidad, rechazos y recuperación del GPS.
 */
function emptyMetrics() {
  return {
    received: 0,
    accepted: 0,
    rejectedStructural: 0,
    rejectedStale: 0,
    rejectedAccuracy: 0,
    rejectedJump: 0,
    rejectedDuplicate: 0,
    watchRestarts: 0,
    jumpRecoveries: 0,
    lastRejectReason: null,
    accuracyMinM: Infinity,
    accuracyMaxM: 0,
    accuracySumM: 0,
    accuracySamples: 0,
    intervalMinMs: Infinity,
    intervalMaxMs: 0,
    intervalSumMs: 0,
    intervalSamples: 0,
    lastAcceptedAt: null
  };
}

/**
 * Devuelve métricas independientes que la interfaz puede leer sin mutar el rastreador.
 */
function snapshotMetrics(metrics) {
  return {
    ...metrics,
    accuracyMinM: Number.isFinite(metrics.accuracyMinM) ? metrics.accuracyMinM : null,
    accuracyAvgM: metrics.accuracySamples ? metrics.accuracySumM / metrics.accuracySamples : null,
    accuracyMaxM: metrics.accuracySamples ? metrics.accuracyMaxM : null,
    intervalMinMs: Number.isFinite(metrics.intervalMinMs) ? metrics.intervalMinMs : null,
    intervalAvgMs: metrics.intervalSamples ? metrics.intervalSumMs / metrics.intervalSamples : null,
    intervalMaxMs: metrics.intervalSamples ? metrics.intervalMaxMs : null
  };
}

/**
 * Pone en marcha el filtro, motor y observación GPS, y devuelve controles de su ciclo de vida.
 */
export function startGeoTracker({ catalog, onEvents = () => {}, onStatus = () => {}, debugEnabled = false, onDebug = () => {} }) {
  const pieces = catalog.filter(hasGeo).map(normalizePiece);
  const maxUsefulAccuracyM = pieces.length
    ? Math.max(...pieces.map((piece) => piece.maxProximityAccuracyM))
    : GEO_MAX_PROXIMITY_ACCURACY_M;

  const engine = createGeoEngine({
    pieces,
    thresholds: {
      invokeFixes: GEO_INVOKE_CONSECUTIVE_FIXES,
      invokeMinDwellMs: GEO_INVOKE_MIN_DWELL_MS,
      autoGoodAccuracyM: GEO_AUTO_GOOD_ACCURACY_M,
      confidenceRadiusFactor: GEO_CONFIDENCE_RADIUS_FACTOR,
      exitFixes: GEO_EXIT_CONSECUTIVE_FIXES,
      candidateSwitchFixes: GEO_CANDIDATE_SWITCH_FIXES,
      invokeMinSampleIntervalMs: GEO_INVOKE_MIN_SAMPLE_INTERVAL_MS,
      signalLostMs: GEO_SIGNAL_LOST_MS,
      failedCooldownMs: GEO_FAILED_COOLDOWN_MS,
      distanceStepM: GEO_DISTANCE_STEP_M,
      displaySmoothingAlpha: GEO_DISPLAY_SMOOTHING_ALPHA,
    }
  });

  const fixFilter = createGeoFixFilter({
    maxUsefulAccuracyM,
    maxSpeedMps: GEO_JUMP_MAX_SPEED_MPS,
    baseAllowanceM: GEO_JUMP_BASE_ALLOWANCE_M,
    jumpConfirmFixes: GEO_JUMP_CONFIRM_FIXES,
    jumpConsistencyM: GEO_JUMP_CONSISTENCY_M,
    recoveryAccuracyRatio: GEO_JUMP_RECOVERY_ACCURACY_RATIO,
  });

  let watchId = null;
  let stopped = false;
  let simulationMode = false;
  let trackerStatus = 'starting';
  let lastFix = null;
  let lastRawFix = null;
  let mockClockMs = null;
  let lastCallbackAt = null;
  let lastRestartAt = -Infinity;
  const metrics = emptyMetrics();
  const now = () => performance.now();

  /**
   * Publica mediciones actuales cuando el diagnóstico de campo está habilitado.
   */
  function publishDebug() {
    if (!debugEnabled) return;
    onDebug({
      trackerStatus,
      simulationMode,
      watchActive: watchId !== null,
      lastFix: lastFix ? { ...lastFix } : null,
      lastRawFix: lastRawFix ? { ...lastRawFix } : null,
      metrics: snapshotMetrics(metrics),
      filter: fixFilter.getSnapshot(),
      engine: engine.getSnapshot()
    });
  }

  function reportStatus(status) {
    trackerStatus = status;
    onStatus(status);
    publishDebug();
  }

  const dispatch = (events) => {
    if (events?.length) onEvents(events);
    publishDebug();
  };

  function recordReject(reason) {
    metrics.lastRejectReason = reason;
    if (reason === 'structural') metrics.rejectedStructural += 1;
    else if (reason === 'stale') metrics.rejectedStale += 1;
    else if (reason === 'accuracy') metrics.rejectedAccuracy += 1;
    else if (reason === 'jump') metrics.rejectedJump += 1;
    else if (reason === 'duplicate') metrics.rejectedDuplicate += 1;
  }

  function recordAccepted(fix, acceptedAt, recoveredJump) {
    metrics.accepted += 1;
    if (recoveredJump) metrics.jumpRecoveries += 1;
    metrics.lastRejectReason = null;
    metrics.accuracyMinM = Math.min(metrics.accuracyMinM, fix.accuracy);
    metrics.accuracyMaxM = Math.max(metrics.accuracyMaxM, fix.accuracy);
    metrics.accuracySumM += fix.accuracy;
    metrics.accuracySamples += 1;

    if (metrics.lastAcceptedAt != null) {
      const intervalMs = Math.max(0, acceptedAt - metrics.lastAcceptedAt);
      metrics.intervalMinMs = Math.min(metrics.intervalMinMs, intervalMs);
      metrics.intervalMaxMs = Math.max(metrics.intervalMaxMs, intervalMs);
      metrics.intervalSumMs += intervalMs;
      metrics.intervalSamples += 1;
    }
    metrics.lastAcceptedAt = acceptedAt;
  }

  /**
   * Unifica muestras reales o simuladas, filtra errores y envía posiciones aceptadas al motor.
   */
  function processFix({ latitude, longitude, accuracy, source, positionTimestamp = null }, eventNow) {
    metrics.received += 1;
    lastRawFix = { latitude, longitude, accuracy, source };

    if (![latitude, longitude, accuracy].every(Number.isFinite)) {
      recordReject('structural');
      publishDebug();
      return false;
    }

    if (Number.isFinite(positionTimestamp)) {
      const ageMs = Date.now() - positionTimestamp;
      if (ageMs > GEO_FIX_MAX_AGE_MS) {
        recordReject('stale');
        publishDebug();
        return false;
      }
    }

    const filtered = fixFilter.evaluate({ latitude, longitude, accuracy, sourceTimestamp: positionTimestamp }, eventNow);
    if (!filtered.accepted) {
      recordReject(filtered.reason);
      publishDebug();
      return false;
    }

    const acceptedFix = filtered.fix;
    lastFix = {
      latitude: acceptedFix.latitude,
      longitude: acceptedFix.longitude,
      accuracy: acceptedFix.accuracy,
      source
    };
    recordAccepted(lastFix, eventNow, filtered.recoveredJump);
    dispatch(engine.update(lastFix, eventNow));
    return true;
  }

  /**
   * Adapta una respuesta de geolocation.watchPosition al formato interno.
   */
  function handlePosition(position) {
    if (stopped || simulationMode || document.hidden) return;
    const { latitude, longitude, accuracy } = position?.coords ?? {};
    lastCallbackAt = now();
    const accepted = processFix({
      latitude,
      longitude,
      accuracy,
      source: 'gps',
      positionTimestamp: position?.timestamp
    }, now());
    reportStatus(accepted ? 'active' : 'watching');
  }

  /**
   * Convierte fallos del proveedor de posición en estados legibles por la UI.
   */
  function handleError(error) {
    if (stopped || simulationMode) return;
    lastCallbackAt = now();
    if (error?.code === 1) {
      clearWatch();
      reportStatus('denied');
      return;
    }
    reportStatus(error?.code === 2 ? 'unavailable' : 'timeout');
  }

  /**
   * Suscribe al GPS con los parámetros de precisión y tiempo configurados.
   */
  function startWatch() {
    if (stopped || simulationMode || watchId !== null) return;
    if (!navigator.geolocation) {
      reportStatus('unsupported');
      return;
    }
    trackerStatus = 'watching';
    lastCallbackAt = now();
    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: GEO_ENABLE_HIGH_ACCURACY,
      maximumAge: GEO_MAXIMUM_AGE_MS,
      timeout: GEO_POSITION_TIMEOUT_MS
    });
    publishDebug();
  }

  /**
   * Cancela la suscripción existente para evitar observadores duplicados.
   */
  function clearWatch() {
    if (watchId === null) return;
    navigator.geolocation?.clearWatch?.(watchId);
    watchId = null;
    publishDebug();
  }

  /**
   * Descarta las referencias GPS anteriores al reiniciar o reanudar seguimiento.
   */
  function resetTemporalFilter() {
    fixFilter.reset();
    mockClockMs = null;
  }

  /**
   * Ajusta el seguimiento cuando el navegador entra o sale del segundo plano.
   */
  function onVisibilityChange() {
    if (document.hidden) clearWatch();
    else {
      resetTemporalFilter();
      engine.setBusy('visibility', true);
      engine.setBusy('visibility', false);
      dispatch([{ type: 'far' }]);
      startWatch();
    }
  }

  /**
   * Detecta una fuente de ubicación detenida y la reinicia tras el tiempo mínimo.
   */
  function healthCheck() {
    const current = now();
    dispatch(engine.tick(current));
    if (stopped || simulationMode || document.hidden || watchId === null ||
        lastCallbackAt == null || current - lastCallbackAt < GEO_WATCH_STALL_MS ||
        current - lastRestartAt < GEO_WATCH_RESTART_COOLDOWN_MS) return;
    lastRestartAt = current;
    metrics.watchRestarts += 1;
    clearWatch();
    resetTemporalFilter();
    reportStatus('starting');
    startWatch();
  }
  const healthTimer = setInterval(healthCheck, GEO_HEALTH_TICK_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);

  function nextMockTime() {
    const realNow = now();
    if (mockClockMs == null) mockClockMs = realNow;
    else mockClockMs = Math.max(realNow, mockClockMs + GEO_DEBUG_MOCK_STEP_MS);
    return mockClockMs;
  }

  /**
   * Entrega coordenadas de prueba por la misma ruta de filtrado que las posiciones reales.
   */
  function injectMock(latitude, longitude, accuracy = 10) {
    if (!debugEnabled && !import.meta.env.DEV) return false;
    const values = [latitude, longitude, accuracy].map(Number);
    if (!values.every(Number.isFinite)) return false;
    return processFix({
      latitude: values[0],
      longitude: values[1],
      accuracy: values[2],
      source: 'mock'
    }, nextMockTime());
  }

  /**
   * Alterna la fuente de posiciones sin modificar el catálogo de producción.
   */
  function setSimulationMode(enabled) {
    const next = Boolean(enabled);
    if (next === simulationMode) return;
    simulationMode = next;
    resetTemporalFilter();
    if (simulationMode) {
      clearWatch();
      reportStatus('simulated');
    } else {
      reportStatus('starting');
      startWatch();
    }
  }

  if (import.meta.env.DEV) {
    window.__geoMock = injectMock;
    const raw = new URLSearchParams(window.location.search).get('geomock');
    if (raw) {
      const [lat, lng, accuracy = 10] = raw.split(',');
      queueMicrotask(() => {
        setSimulationMode(true);
        injectMock(lat, lng, accuracy);
      });
    }
  }

  startWatch();
  publishDebug();

  return {
    engine,
    injectMock,
    setSimulationMode,
    getDebugSnapshot() {
      return {
        trackerStatus,
        simulationMode,
        watchActive: watchId !== null,
        lastFix: lastFix ? { ...lastFix } : null,
        lastRawFix: lastRawFix ? { ...lastRawFix } : null,
        metrics: snapshotMetrics(metrics),
        filter: fixFilter.getSnapshot(),
        engine: engine.getSnapshot()
      };
    },
    setBusy(reason, busy) { dispatch(engine.setBusy(reason, busy)); },
    setDebugBusy(busy) { dispatch(engine.setBusy('debug-ui', Boolean(busy))); },
    stop() {
      stopped = true;
      clearWatch();
      clearInterval(healthTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (import.meta.env.DEV && window.__geoMock) delete window.__geoMock;
    }
  };
}
