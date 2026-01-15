// Lightweight frontend logger that forwards logs to backend when enabled
export async function send(level, message, meta) {
  const enabled = process.env.REACT_APP_ENABLE_FRONTEND_LOGGING === "1";
  if (!enabled) {
    // Fallback to console for local/dev without backend configured
    if (level === "error") console.error(message, meta);
    else if (level === "warn") console.warn(message, meta);
    else console.log(message, meta);
    return;
  }
  try {
    await fetch("/api/internal/frontend-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, message, meta }),
    });
  } catch (e) {
    // Ignore network errors in logging
  }
}

const frontendLogger = { send };
export default frontendLogger;
