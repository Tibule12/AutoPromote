const crypto = require("crypto");
const { requestLocalModel } = require("./studioLocalModelTransport");
const { validateKineticPoster } = require("../../frontend/src/components/studioKineticPoster");
async function createDirectorPosterPlan(
  context,
  {
    model = "phi3:latest",
    transport = requestLocalModel,
    now = () => new Date().toISOString(),
  } = {}
) {
  if (context.duration < 8 || context.duration > 20)
    throw Object.assign(Error("Motion posters need8–20seconds within the project."), {
      status: 400,
    });
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["name", "words", "palette", "energy"],
    properties: {
      name: { type: "string", maxLength: 80 },
      words: {
        type: "array",
        items: { type: "string", pattern: "^[A-Z]{2,6}$" },
        minItems: 3,
        maxItems: 3,
      },
      palette: { type: "string", enum: ["orange_ink", "cobalt_lime", "pink_ink"] },
      energy: { type: "number", minimum: 0.5, maximum: 1 },
    },
  };
  const start = Date.now();
  let response;
  try {
    response = await transport(
      {
        model,
        stream: false,
        format: schema,
        keep_alive: 0,
        options: { num_ctx: 2048, num_predict: 180, num_gpu: 0, num_thread: 6, temperature: 0.2 },
        messages: [
          {
            role: "system",
            content:
              "Direct a kinetic graphic poster. Return minified JSON {name,words,palette,energy}. words is exactly three uppercase words, each2–6letters A–Z only. Follow requested wording exactly. palette orange_ink means cream/ink/orange/lime; cobalt_lime means cream/navy/cobalt/lime; pink_ink means cream/plum/pink/lime. energy0.5..1 controls construction-piece motion. The authored native motion-design operator supplies vector-letter piece construction, a stroke orbit, impact typography, outlined echoes and a camera lockup. You choose copy,palette,energy; you are not inventing arbitrary new animation code. No source recognition is required.",
          },
          {
            role: "user",
            content: JSON.stringify({ brief: context.brief, duration: context.duration }),
          },
        ],
      },
      { signal: AbortSignal.timeout(180000) }
    );
  } catch {
    throw Object.assign(
      Error("Local Director motion planning is unavailable. No edit was applied."),
      { status: 503 }
    );
  }
  if (!response.ok)
    throw Object.assign(Error("Local Director motion planning is unavailable."), { status: 503 });
  let poster;
  try {
    poster = validateKineticPoster(JSON.parse(response.data.message.content));
  } catch (error) {
    throw Object.assign(Error("Director motion-design validation failed: " + error.message), {
      status: 422,
    });
  }
  const core = {
    version: 4,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
    brief: context.brief,
    duration: context.duration,
    sourceEvidence: context.media.map(({ id, contentHash }) => ({ id, contentHash })),
    poster,
  };
  return {
    ...core,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex"),
    provenance: {
      provider: "ollama",
      model,
      generatedAt: now(),
      elapsedMs: Date.now() - start,
      automaticModelPlanning: true,
      planningRepresentation: "model_copy_palette_energy_native_kinetic_design",
      authoredMotionOperator: true,
      sourceUnderstanding: "source_independent_graphic_design",
      modelCalls: 1,
      paidProviderCalls: 0,
    },
  };
}
module.exports = { createDirectorPosterPlan };
