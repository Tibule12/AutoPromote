// logger.js - lightweight structured logger
// Usage: const logger = require('./logger'); logger.info('task_processed', { taskId });
// Reason: this module intentionally writes to console for structured logging in container environments.

function base(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  try {
    // Avoid crashing on circular structures
    console.log(JSON.stringify(entry));
  } catch (e) {
    console.log(JSON.stringify({ ts: entry.ts, level, message, meta_error: e.message }));
  }
}

module.exports = {
  info: (m, meta) => base("info", m, meta),
  warn: (m, meta) => base("warn", m, meta),
  error: (m, meta) => base("error", m, meta),
};
