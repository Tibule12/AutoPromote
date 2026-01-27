// storageGuard.js - safe wrappers for writing files to Cloud Storage
const util = require("util");

function _toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (input instanceof ArrayBuffer) return Buffer.from(new Uint8Array(input));
  if (typeof input === "string") return Buffer.from(input, "utf8");
  return null;
}

async function saveFileSafely(file, input, options = {}) {
  // Basic validation to prevent accidental writes of `undefined` or empty strings
  if (typeof input === "undefined" || input === null) {
    throw new Error("Invalid file content: value is null or undefined");
  }

  if (typeof input === "string") {
    const t = input.trim();
    if (t === "" || t === "undefined") {
      throw new Error('Invalid file content: empty or "undefined" string');
    }
  }

  const buf = _toBuffer(input);
  if (!buf) {
    throw new Error("Invalid file content: unsupported type " + typeof input);
  }

  // Extra defensive log for large writes
  try {
    console.log(
      `[storageGuard] saving file=${file && file.name ? file.name : "<unknown>"} size=${buf.length}`
    );
  } catch (e) {}

  return file.save(buf, options);
}

module.exports = { saveFileSafely };
