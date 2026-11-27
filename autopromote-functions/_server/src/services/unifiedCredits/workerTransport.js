const { getApplicationContext, assertApplicationTransport } = require("./application");
async function applicationWorkerConfig(target, body, config = {}) {
  const renewable = require("../processingTokens/runtime").current();
  if (renewable?.prepare) {
    const headers = await renewable.prepare(target, body);
    return { ...config, headers: { ...(config.headers || {}), ...headers } };
  }
  require("../processingTokens/runtime").assertDispatch();
  const context = getApplicationContext();
  if (!context?.workerVerifier) return config;
  assertApplicationTransport(new URL(target).origin);
  const headers = await context.workerVerifier.prepare(context, target, body);
  return { ...config, headers: { ...(config.headers || {}), ...headers } };
}
module.exports = { applicationWorkerConfig };
