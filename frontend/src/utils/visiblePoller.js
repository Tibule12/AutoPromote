// Poll UI data only while it can be seen. Keep one request in flight and preserve
// the refresh cadence across brief tab switches instead of querying on every focus.
export function startVisiblePoller(poll, intervalMs = 60000) {
  let stopped = false;
  let running = false;
  let timer = null;
  let controller = null;
  let lastStarted = null;

  const schedule = () => {
    clearTimeout(timer);
    timer = null;
    if (stopped || document.hidden || running) return;
    const delay = lastStarted === null ? 0 : Math.max(0, intervalMs - (Date.now() - lastStarted));
    timer = setTimeout(run, delay);
  };

  const run = async () => {
    if (stopped || document.hidden || running) return;
    running = true;
    lastStarted = Date.now();
    controller = new AbortController();
    try {
      await poll(controller.signal);
    } catch (_) {
      // A failed UI refresh can retry at the ordinary cadence.
    } finally {
      running = false;
      controller = null;
      schedule();
    }
  };

  document.addEventListener("visibilitychange", schedule);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", schedule);
  };
}
