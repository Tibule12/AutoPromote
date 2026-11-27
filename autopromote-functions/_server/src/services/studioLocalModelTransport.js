const http = require("node:http");

// Local inference can take longer than fetch's independent headers deadline.
// The caller's total deadline owns cancellation; the response stays bounded.
function requestLocalModel(payload, { signal, port = 11434, socketTimeoutMs = 450000 } = {}) {
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(socketTimeoutMs) ||
    socketTimeoutMs < 1 ||
    socketTimeoutMs > 450000
  )
    return Promise.reject(new Error("Invalid local model transport limits."));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(value);
    };
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/chat",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      response => {
        const chunks = [];
        let bytes = 0;
        response.on("data", chunk => {
          bytes += chunk.length;
          if (bytes > 128 * 1024)
            request.destroy(new Error("Local model response exceeded 128 KiB."));
          else chunks.push(chunk);
        });
        response.on("error", error => finish(error));
        response.on("end", () => {
          try {
            finish(null, {
              ok: response.statusCode >= 200 && response.statusCode < 300,
              status: response.statusCode,
              data: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch (error) {
            finish(error);
          }
        });
      }
    );
    const abort = () =>
      request.destroy(
        signal.reason ||
          Object.assign(new Error("Local planning cancelled."), { name: "AbortError" })
      );
    request.setTimeout(socketTimeoutMs, () =>
      request.destroy(
        Object.assign(new Error("Local planning timed out."), { name: "TimeoutError" })
      )
    );
    request.on("error", error => finish(error));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else request.end(JSON.stringify(payload));
  });
}

module.exports = { requestLocalModel };
