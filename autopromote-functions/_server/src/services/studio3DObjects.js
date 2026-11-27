const SHAPES = new Set(["box", "sphere", "torus", "cylinder", "icosphere", "ribbon", "plane"]);
const RIBBON_BOUNDS = { width: [.1, 1.2], thickness: [.015, .2], wave: [0, 1.2], lobes: [1, 6], twists: [-3, 3], speed: [-1, 1], phase: [0, 360] };
function validateRibbon(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 8 || Object.keys(value).some(key => key !== "path" && !Object.hasOwn(RIBBON_BOUNDS, key)) || !["loop", "knot", "wave"].includes(value.path)) throw Error("Invalid ribbon parameters");
  for (const [field, [min, max]] of Object.entries(RIBBON_BOUNDS)) {
    const number = value[field];
    if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max || (["lobes", "twists"].includes(field) && !Number.isInteger(number))) throw Error(`Invalid ribbon ${field}`);
  }
}
const FIELDS = ["x", "y", "z", "scaleX", "scaleY", "scaleZ", "rotationX", "rotationY", "rotationZ"];
const EASINGS = new Set(["linear", "ease_out", "ease_in_out", "spring"]);
const identity = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
function validatePose(values) {
  if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length !== FIELDS.length || Object.keys(values).some(field => !FIELDS.includes(field))) throw Error("Invalid object pose fields");
  for (const field of FIELDS) {
    const [min, max] = field.startsWith("scale") ? [.05, 4] : field.startsWith("rotation") ? [-180, 180] : [-6, 6];
    if (typeof values[field] !== "number" || !Number.isFinite(values[field]) || values[field] < min || values[field] > max) throw Error(`Invalid object ${field}`);
  }
}
function validateStudio3DObjects(objects, duration) {
  if (!Array.isArray(objects) || !objects.length || objects.length > 24) throw Error("Use one to24 scene objects");
  const ids = new Set(); let totalKeys = 0;
  for (const item of objects) {
    const fields = ["id", "name", "shape", "color", "material", "bevel", "roughness", "ribbon", "keyframes", ...FIELDS];
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !fields.includes(key))) throw Error("Invalid scene object fields");
    if (!identity(item.id) || ids.has(item.id) || typeof item.name !== "string" || item.name.length > 80 || /[\x00-\x1f<>]/.test(item.name) || !SHAPES.has(item.shape) || !/^#[a-f\d]{6}$/i.test(item.color || "")) throw Error("Invalid scene object identity or appearance"); // eslint-disable-line no-control-regex
    ids.add(item.id); validatePose(Object.fromEntries(FIELDS.map(field => [field, item[field]])));
    if (item.material !== undefined && !["chrome", "glass", "neon", "gold", "matte", "holographic", "architecture", "brushed", "silk"].includes(item.material)) throw Error("Invalid object material");
    if (item.bevel !== undefined && (typeof item.bevel !== "number" || !Number.isFinite(item.bevel) || item.bevel < 0 || item.bevel > .15)) throw Error("Invalid object bevel");
    if (item.roughness !== undefined && (typeof item.roughness !== "number" || !Number.isFinite(item.roughness) || item.roughness < .04 || item.roughness > 1)) throw Error("Invalid object roughness");
    if (item.shape === "ribbon") validateRibbon(item.ribbon);
    else if (item.ribbon !== undefined) throw Error("Ribbon parameters require a ribbon");
    if (!Array.isArray(item.keyframes) || item.keyframes.length > 32) throw Error("Too many object keys");
    totalKeys += item.keyframes.length; const keyIds = new Set(), times = new Set();
    for (const key of item.keyframes) {
      if (!key || Object.keys(key).length !== 4 || Object.keys(key).some(field => !["id", "time", "easing", "values"].includes(field)) || !identity(key.id) || keyIds.has(key.id) || typeof key.time !== "number" || !Number.isFinite(key.time) || key.time < 0 || key.time > duration || times.has(key.time) || !EASINGS.has(key.easing)) throw Error("Invalid object key identity or timing");
      keyIds.add(key.id); times.add(key.time); validatePose(key.values);
    }
  }
  if (totalKeys > 256) throw Error("Object scene exceeds256 keys");
  return objects;
}
module.exports = { validateStudio3DObjects };
