const obj = properties => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const str = { type: "string", maxLength: 500 };
const strings = { type: "array", minItems: 1, maxItems: 8, items: str };
const number = { type: "number" };
const sequence = { type: "array", minItems: 2, maxItems: 20,
  items: obj({ assetId: str, start: number, duration: number, reason: str }) };
// lm-format-enforcer's numeric const parser is not supported by the pinned
// runtime. Bound numerically here; validateDirection also requires exactly 1.
const directionSchema = obj({ schemaVersion: { type: "integer", minimum: 1, maximum: 1 }, title: str,
  story: obj({ about: str, whyCare: str, hook: str, beginning: str, development: str, tension: str,
    payoff: str, ending: str, withheld: str, amplify: strings, remove: strings }),
  script: { type: "array", minItems: 3, maxItems: 12, items: obj({ beatId: str, action: str, sound: str }) },
  assets: { type: "array", minItems: 3, maxItems: 12, items: obj({ assetId: str,
    type: { enum: ["video", "image", "three_d", "ui", "audio", "motion"] }, beatId: str, prompt: str, reason: str,
    duration: number, provider: { enum: ["wan", "wan_video_refine", "blender", "ui_capture", "motion", "original_audio", "ace_step"] },
    acceptanceCriteria: strings, seed: { type: "integer", minimum: 0 } }) },
  outputs: { type: "array", minItems: 1, maxItems: 7, items: obj({ outputId: str,
    aspect: { enum: ["16:9", "9:16", "1:1"] }, purpose: str,
    musicAssetId: { anyOf: [str, { type: "null" }] },
    audioCues: { type: "array", minItems: 0, maxItems: 12, items: obj({assetId:str,kind:{enum:["voiceover","sfx"]},startTime:number,duration:number,trimStart:number,volume:number}) }, sequence }) },
});
directionSchema.properties.assets.items.properties.referenceAssetId={anyOf:[str,{type:'null'}]};
directionSchema.properties.assets.items.properties.referenceTime={type:'number',minimum:0};
directionSchema.properties.assets.items.properties.videoModel={enum:['wan_ti2v_5b','wan_i2v_a14b']};
directionSchema.properties.assets.items.properties.negativePrompt={type:'string',minLength:1,maxLength:2000};
directionSchema.properties.assets.items.properties.blenderScene={enum:['paper_to_yacht']};
directionSchema.properties.assets.items.properties.lastReferenceAssetId={anyOf:[str,{type:'null'}]};
directionSchema.properties.assets.items.properties.lastReferenceTime={type:'number',minimum:0};
directionSchema.properties.assets.items.properties.referenceVideoAssetId={type:'string',minLength:1,maxLength:96};
directionSchema.properties.assets.items.properties.refinementStrength={type:'number',minimum:.2,maximum:.85};
directionSchema.properties.assets.items.properties.creativeScene = obj({
  representation: str, before: str, during: str, after: str,
  actions: { type: 'array', minItems: 1, maxItems: 16, items: obj({
    id: str, kind: { enum: ['human', 'object', 'environment'] }, action: str }) },
  camera: str, supportingShots: { type: 'array', maxItems: 16, items: str },
  vfx: { type: 'array', maxItems: 16, items: str }, sound: str, transition: str,
});
const reviewSchema = obj({ accepted: { type: "boolean" }, reason: str, revisionInstructions: str,
  criteria: { type: "array", items: obj({ criterion: str, passed: { type: "boolean" }, observation: str }) } });
const revisionSchema = obj({ sequence, reason: str });
module.exports = { directionSchema, reviewSchema, revisionSchema };
