const { getApplicationContext, assertApplicationTransport } = require("./application");
async function applicationWorkerConfig(target, body, config = {}) {
  const renewable = require("../processingTokens/runtime").current();
  if (renewable?.workerTransport) {
    return { ...config, adapter: async () => ({ data: await renewable.workerTransport(target, body),
      status: 200, statusText: "OK", headers: {}, config }) };
  }
  if (renewable?.prepare) {
    const headers = await renewable.prepare(target, body);
    return { ...config, headers: { ...(config.headers || {}), ...headers } };
  }
  if (require('../processingTokens/runtime').enabled())
    throw Object.assign(new Error('BOUNDED_PROCESSING_ADAPTER_REQUIRED'), {code:'BOUNDED_PROCESSING_ADAPTER_REQUIRED',status:503});
  require("../processingTokens/runtime").assertDispatch();
  const context = getApplicationContext();
  if (!context?.workerVerifier) return config;
  assertApplicationTransport(new URL(target).origin);
  const headers = await context.workerVerifier.prepare(context, target, body);
  return { ...config, headers: { ...(config.headers || {}), ...headers } };
}
module.exports = { applicationWorkerConfig };
