const axios = require("axios");
const http = require("http");
const https = require("https");

// Status and completed-media reads are safe to repeat. Inference submissions
// must keep their existing persisted request identity and are not retried here.
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });
const transient = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNABORTED"]);

async function readStudioWorker(url, options) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await axios.get(url, {
        ...options,
        httpAgent,
        httpsAgent,
        headers: { ...options.headers, Connection: "close" },
      });
    } catch (error) {
      if (attempt || !transient.has(error.code) || options.signal?.aborted) throw error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
}

module.exports = { readStudioWorker };
