// Provider selection only. Both transports feed the same validated native plans.
function directorProvider(env = process.env) {
  const choice = env.STUDIO_DIRECTOR_PROVIDER?.trim().toLowerCase();
  if (choice === "disabled" || choice === "off") return null;
  if (choice === "local" || (!choice && env.STUDIO_DIRECTOR_LOCAL_PLANNER === "true"))
    return { provider: "ollama", model: env.STUDIO_DIRECTOR_MODEL || "phi3:latest" };
  if (choice && choice !== "openai") return null;
  if (env.OPENAI_API_KEY || env.OPENAI_KEY)
    return { provider: "openai", model: env.STUDIO_DIRECTOR_MODEL || "gpt-4o-mini" };
  return null;
}

function createDirectorTransport({ userId, signal, complete } = {}) {
  return async (payload, options = {}) => {
    const completion = complete || require("./openaiClient").chatCompletions;
    let result;
    try {
      result = await completion(
        {
          model: payload.model,
          messages: payload.messages,
          temperature: payload.options?.temperature ?? 0.2,
          max_tokens: Math.min(
            4096,
            Math.max(512, payload.format === "json" ? 4096 : payload.options?.num_predict || 2000)
          ),
          response_format:
            typeof payload.format === "object"
              ? {
                  type: "json_schema",
                  json_schema: {
                    name: "studio_director_plan",
                    strict: true,
                    schema: payload.format,
                  },
                }
              : { type: "json_object" },
        },
        {
          userId,
          feature: "studioDirector",
          model: payload.model,
          timeout: 90000,
          maxContentLength: 128 * 1024,
          signal: AbortSignal.any([signal, options.signal].filter(Boolean)),
        }
      );
    } catch {
      throw Object.assign(
        new Error("Director planning is temporarily unavailable. No edit was applied."),
        { status: 503 }
      );
    }
    const choice = result.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      choice.message?.refusal ||
      typeof choice.message?.content !== "string" ||
      choice.message.content.length > 50000
    )
      throw Object.assign(
        new Error("Director planning did not return a complete proposal. No edit was applied."),
        { status: 422 }
      );
    return {
      ok: true,
      status: 200,
      data: {
        message: { content: choice.message.content },
        prompt_eval_count: result.usage?.prompt_tokens,
        eval_count: result.usage?.completion_tokens,
      },
    };
  };
}

async function requireDirectorAccess(req, res, next) {
  try {
    const { getEffectiveTierSnapshot } = require("./billingService");
    const { getPlanCapabilities } = require("../config/subscriptionPlans");
    const { applyTesterCapabilityAllowlist } = require("../config/testerProgram");
    const tier = await getEffectiveTierSnapshot(req.user.uid);
    const capabilities = applyTesterCapabilityAllowlist(
      getPlanCapabilities(tier.tierId),
      tier.testerAccess
    );
    if (!capabilities?.editing?.features?.autoDirector?.enabled)
      return res
        .status(403)
        .json({
          code: "DIRECTOR_NOT_INCLUDED",
          error: "Director planning is not included in your current access.",
        });
    return next();
  } catch {
    return res
      .status(503)
      .json({ error: "We could not verify Director access. No planning request was sent." });
  }
}

module.exports = { directorProvider, createDirectorTransport, requireDirectorAccess };
