// Simple schema validation utility (lightweight, no external deps)
// Schema shape: { fieldName: { type: 'string'|'number'|'boolean'|'array'|'object', required?: true, maxLength?, min?, max?, enum?: [] } }

function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};
    for (const [key, rules] of Object.entries(schema)) {
      const val = body[key];
      if (rules.required && (val === undefined || val === null || val === "")) {
        errors.push(`${key} required`);
        continue;
      }
      if (val === undefined || val === null) continue; // optional absent
      const t = Array.isArray(val) ? "array" : typeof val;
      if (rules.type && rules.type !== t) {
        errors.push(`${key} expected ${rules.type} got ${t}`);
        continue;
      }
      if (rules.type === "string") {
        if (rules.maxLength && String(val).length > rules.maxLength) errors.push(`${key} too long`);
      }
      if (typeof val === "number") {
        if (rules.min !== undefined && val < rules.min) errors.push(`${key} < min`);
        if (rules.max !== undefined && val > rules.max) errors.push(`${key} > max`);
      }
      if (rules.enum && !rules.enum.includes(val)) {
        errors.push(`${key} invalid enum`);
      }
    }
    if (errors.length)
      return res
        .status(400)
        .json({ ok: false, error: { code: "VALIDATION_FAILED", details: errors } });
    next();
  };
}

module.exports = { validateBody };
