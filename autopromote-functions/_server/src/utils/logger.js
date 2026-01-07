/* eslint-disable no-console */
// Simple logger utility to suppress logs in tests unless DEBUG_TEST_LOGS=1
function shouldLog() {
  return process.env.DEBUG_TEST_LOGS === "1" || process.env.NODE_ENV !== "test";
}
function debug(...args) {
  if (shouldLog()) console.log(...args);
}
function info(...args) {
  if (shouldLog()) console.log(...args);
}
function warn(...args) {
  if (shouldLog()) console.warn(...args);
}
function error(...args) {
  if (shouldLog()) console.error(...args);
}
module.exports = { debug, info, warn, error };
