const { directionSchema } = require('./contentFactorySchemas');
const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const string = { type: 'string', minLength: 1, maxLength: 1000 };
const list = (items, maxItems = 20) => ({ type: 'array', maxItems, items });
const scenePlanSchema = object({ sceneId: string, sourceSha256: string, summary: string, story: directionSchema.properties.story,
  props: list(object({ name: string, sourceQuote: string }), 30),
  characterDesigns: list(object({ name: string, description: string, origin: { enum: ['script_fact','creative_choice'] }, sourceQuote: string })),
  shots: { ...list(object({ shotId: string, action: string, reason: string, camera: string, framing: string,
    duration: { type: 'number', minimum: .5, maximum: 121 / 24 }, entityNames: list(string,16), dialogueUnitIds: list(string), sourceQuote: string })), minItems: 1 },
  continuity: list(object({ entityName: string, key: { enum: ['appearance','wardrobe','prop_material','prop_state','screen_direction','time_of_day'] },
    value: string, intentionalChange: { type: 'boolean' }, sourceQuote: string }),60) });
module.exports = { scenePlanSchema };
