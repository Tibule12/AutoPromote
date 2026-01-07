const axios = require("axios");
const { logOpenAIUsage } = require("./openaiUsageLogger");

const DEFAULT_OPENAI_BASE =
  process.env.OPENAI_API_BASE || "https://" + ["api", "openai", "com"].join(".");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || null;

async function request(path, payload = {}, opts = {}) {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
  const url = `${DEFAULT_OPENAI_BASE}${path}`;
  const headers = Object.assign({ Authorization: `Bearer ${OPENAI_API_KEY}` }, opts.headers || {});
  const res = await axios.post(url, payload, { headers, maxBodyLength: Infinity });
  return res.data;
}

async function chatCompletions(params = {}, meta = {}) {
  const data = await request("/v1/chat/completions", params, meta);
  // Attempt to log usage; do not fail on logging errors
  try {
    if (data && data.usage) {
      await logOpenAIUsage(Object.assign({ feature: "chatCompletions", usage: data.usage }, meta));
    }
  } catch (e) {}
  return data;
}

async function audioTranscriptions(formData, meta = {}) {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
  const url = `${DEFAULT_OPENAI_BASE}/v1/audio/transcriptions`;
  const headers = Object.assign(
    { Authorization: `Bearer ${OPENAI_API_KEY}` },
    formData.getHeaders ? formData.getHeaders() : {}
  );
  const resp = await axios.post(url, formData, { headers, maxBodyLength: Infinity });
  try {
    if (resp && resp.data) {
      await logOpenAIUsage(Object.assign({ feature: "audioTranscriptions" }, meta));
    }
  } catch (e) {}
  return resp.data;
}

module.exports = { request, chatCompletions, audioTranscriptions };
