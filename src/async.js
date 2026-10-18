/**
 * Utilidades para limitar cuánto espera una operación asíncrona. Distinguen entre dejar de esperar una
 * tarea y cancelar realmente su trabajo mediante AbortSignal.
 */

/**
 * Resuelve al completar la promesa o al agotar el tiempo disponible, sin prometer la cancelación del
 * trabajo.
 */
export function withinBudget(promise, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).then(() => true),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); })
  ]).finally(() => clearTimeout(timer));
}

/**
 * Aplica plazo y señal de aborto a una operación; permite liberar resultados que lleguen después del
 * cierre.
 */
export async function withDeadline(task, { timeoutMs = 20000, signal, onLateResult } = {}) {
  const controller = new AbortController();
  let timer;
  let rejectAbort;
  const canceled = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(controller.signal.reason);
  const cancel = () => controller.abort(signal.reason ?? new DOMException('Carga cancelada', 'AbortError'));
  controller.signal.addEventListener('abort', onAbort, { once: true });
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  timer = setTimeout(() => controller.abort(new DOMException('Tiempo de carga agotado', 'TimeoutError')), timeoutMs);
  const pending = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw controller.signal.reason;
    return task(controller.signal);
  });
  pending.then(value => {
    if (controller.signal.aborted) onLateResult?.(value);
  }, () => {}).catch(error => console.warn('No se pudo liberar un resultado tardío:', error));
  try { return await Promise.race([canceled, pending]); }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
