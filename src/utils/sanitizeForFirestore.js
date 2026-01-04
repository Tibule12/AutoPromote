// Lightweight sanitizer for objects written to Firestore
// - Removes undefined values
// - Converts Date objects to ISO strings
// - Removes functions
// - Recursively sanitizes arrays and objects

function sanitize(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map(v => sanitize(v)).filter(v => v !== undefined);
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") continue;
      const sv = sanitize(v);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }
  // primitives (string, number, boolean, bigint, symbol)
  return value;
}

module.exports = function sanitizeForFirestore(obj) {
  try {
    return sanitize(obj);
  } catch (e) {
    // In case of unexpected circular structures, fall back to a shallow copy
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined) continue;
      if (v instanceof Date) out[k] = v.toISOString();
      else if (typeof v !== "function") out[k] = v;
    }
    return out;
  }
};
// sanitizeForFirestore.js
// Ensure objects stored in Firestore are plain JavaScript objects (POJOs)
// and free of functions, prototypes, circular references and non-serializable values.

function toPlainObject(value, seen = new WeakSet()) {
  if (value == null) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.map(v => toPlainObject(v, seen)).filter(v => v !== undefined);
  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) obj[String(k)] = toPlainObject(v, seen);
    return obj;
  }
  if (value instanceof Set)
    return Array.from(value)
      .map(v => toPlainObject(v, seen))
      .filter(v => v !== undefined);
  if (t === "function" || t === "symbol") return undefined;
  if (t !== "object") return value;
  if (seen.has(value)) return undefined; // circular
  seen.add(value);
  const out = {};
  Object.keys(value).forEach(key => {
    try {
      const v = toPlainObject(value[key], seen);
      if (v !== undefined) out[key] = v;
    } catch (e) {
      // Drop fields that cannot be serialized
    }
  });
  return out;
}

module.exports = toPlainObject;
