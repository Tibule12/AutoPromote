#!/usr/bin/env node
// Serve the normal current-branch optimized React app over localhost's
// separate IPv6 listener. Existing Storage CORS permits localhost:5000; the
// historical IPv4 app is preserved. No fixture or auth bypass is introduced.
const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");
const frontendRequire = require("module").createRequire(
  path.resolve(__dirname, "../../frontend/package.json")
);
const { createProxyMiddleware } = frontendRequire("http-proxy-middleware");
const app = express();
app.use(rateLimit({ windowMs: 60000, max: 600, standardHeaders: true, legacyHeaders: false }));
const build = process.env.STUDIO_QA_BUILD
  ? path.resolve(process.env.STUDIO_QA_BUILD)
  : path.resolve(
      __dirname,
      "../../reports/model-capability-runtime-v1-20261009/proof/launch-template/local-app"
    );
app.use(express.static(build));
app.get(/.*/, (_req, res) => res.sendFile(path.join(build, "index.html")));
const appPort = Number(process.env.STUDIO_QA_APP_PORT || 5000);
const apiPort = Number(process.env.STUDIO_QA_API_PORT || 5119);
for (const port of [appPort, apiPort])
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port");
const server = app.listen(appPort, "::1", () =>
  console.log(`Normal branch app available on IPv6 localhost:${appPort}`)
);
const api = express();
api.use(rateLimit({ windowMs: 60000, max: 600, standardHeaders: true, legacyHeaders: false }));
api.use(createProxyMiddleware({ target: `http://127.0.0.1:${apiPort}`, changeOrigin: true }));
const apiServer = api.listen(apiPort, "::1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => apiServer.close(() => process.exit(0))));
