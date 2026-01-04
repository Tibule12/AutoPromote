// version-endpoint.test.js - quick verification of /api/version shape (requires server running separately)
const http = require("http");

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: process.env.PORT || 5000, path, method: "GET" },
      res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  try {
    const r = await get("/api/version");
    console.log("[version-test] status", r.status);
    try {
      const json = JSON.parse(r.body);
      console.log("[version-test] body", json);
    } catch (e) {
      console.log("[version-test] raw", r.body);
    }
  } catch (e) {
    console.error("[version-test] error", e.message);
  }
})();
