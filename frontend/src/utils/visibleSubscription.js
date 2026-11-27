// Keep a listener through brief tab switches; close it after sustained hiding.
// Queue/publishing execution never depends on a browser subscription.
export function startVisibleSubscription(subscribe, { hiddenGraceMs = 30000 } = {}) {
  let closed = false, stop = null, timer = null;
  const visibility = () => {
    clearTimeout(timer);
    if (closed) return;
    if (!document.hidden) {
      if (!stop) stop = subscribe();
    } else if (stop) {
      timer = setTimeout(() => { stop?.(); stop = null; }, hiddenGraceMs);
    }
  };
  document.addEventListener("visibilitychange", visibility);
  visibility();
  return () => {
    closed = true;
    clearTimeout(timer);
    stop?.(); stop = null;
    document.removeEventListener("visibilitychange", visibility);
  };
}
