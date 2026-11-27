const runtime = require('./runtime');
const { digest } = require('../unifiedCredits/workerVerification');
const { fail } = require('../unifiedCredits/policy');
// USD microdollars/token; verified against the provider model pages 2026-11-27.
// https://developers.openai.com/api/docs/models/gpt-4o-mini
// https://developers.openai.com/api/docs/models/gpt-4o
const rates = {
  'gpt-4o-mini': [0.15, 0.6], 'gpt-4o-mini-2024-07-18': [0.15, 0.6],
  'gpt-4o': [2.5, 10], 'gpt-4o-2024-08-06': [2.5, 10], 'gpt-4o-2024-11-20': [2.5, 10],
};
function requestBound(payload) {
  const rate = rates[payload.model];
  if (!rate || payload.stream || payload.tools?.length || payload.functions?.length ||
      (payload.n !== undefined && payload.n !== 1) || !Array.isArray(payload.messages))
    fail('API_COST_VALIDATION_REQUIRED', 409);
  // Each text token consumes at least one UTF-8 byte; include role/framing
  // overhead conservatively. Images/audio need separate measured pricing.
  if (payload.messages.some(m => typeof m.content !== 'string')) fail('API_COST_VALIDATION_REQUIRED', 409);
  const input = Buffer.byteLength(JSON.stringify(payload.messages)) + payload.messages.length * 64 + 256;
  const output = Number(payload.max_tokens || payload.max_completion_tokens || 4096);
  if (!Number.isSafeInteger(output) || output < 1 || output > 16384) fail('API_COST_VALIDATION_REQUIRED', 409);
  return { output, rate, micros: Math.ceil(input * rate[0] + output * rate[1]) + 100 };
}
function createApiAdapter({ profileId = 'ai-text' } = {}) {
  return { profileId, enforcesCostBound: true,
    handle(req, res, next, q) {
      const ctx = runtime.current();
      ctx.apiSpent = 0; ctx.apiCalls = 0;
      ctx.aiRequest = async (payload, send) => {
        if (ctx.apiUncertain || ctx.apiCalls >= 4) fail('WORKER_RETRY_NOT_ALLOWED', 409);
        const bound = requestBound(payload);
        if (ctx.apiSpent + bound.micros > q.maxMicros) fail('EXTERNAL_API_BUDGET', 429);
        if (!ctx.dispatched) {
          await ctx.service.authorizeDispatch(ctx.uid, ctx.reservation.requestId);
          ctx.dispatched = true;
        }
        ctx.apiCalls++;
        let measuredRecorded = false;
        try {
          const result = await send({ ...payload, max_tokens: bound.output });
          const usage = result.usage;
          if (!Number.isSafeInteger(usage?.prompt_tokens) || !Number.isSafeInteger(usage?.completion_tokens))
            fail('API_USAGE_PROOF_REQUIRED', 503);
          const measured = Math.ceil(usage.prompt_tokens * bound.rate[0] + usage.completion_tokens * bound.rate[1]) + 100;
          if (measured > bound.micros) {
            await ctx.service.configure({ enabled: false });
            fail('API_COST_BOUND_EXCEEDED', 503);
          }
          ctx.apiSpent += measured;
          measuredRecorded = true;
          await require('../../firebaseAdmin').db.collection('processing_api_receipts')
            .doc(digest([ctx.uid,ctx.reservation.requestId,ctx.apiCalls])).create({
              userId:ctx.uid,requestId:ctx.reservation.requestId,call:ctx.apiCalls,model:payload.model,
              providerResponseId:result.id||null,inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,
              estimatedMicros:measured,costBasis:'provider-reported tokens at reference rates',
              cloudInvoiceMicros:null,at:new Date().toISOString(),
            });
          return result;
        } catch (error) {
          if (!measuredRecorded) ctx.apiSpent += bound.micros;
          ctx.apiUncertain = true;
          throw error;
        }
      };
      const send = res.json.bind(res);
      res.json = body => {
        if (ctx.finalized) return res;
        ctx.finalized = true;
        void ctx.service.settle(ctx.uid, ctx.reservation.requestId, {
          eventId: digest([ctx.reservation.requestId, 'api-terminal']), success: res.statusCode < 400 && !ctx.apiUncertain,
          actualMicros: ctx.apiSpent, consumedTokens: ctx.apiCalls ? undefined : 0, stopped: true,
        }).then(() => send(body)).catch(() => send({ ...body, processing: { state: 'uncertain' } }));
        return res;
      };
      return next();
    },
  };
}
module.exports = { createApiAdapter, requestBound };
