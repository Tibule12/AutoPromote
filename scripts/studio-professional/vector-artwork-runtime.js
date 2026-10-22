#!/usr/bin/env node
// Isolated normal App on a distinct loopback address; other QA listeners and
// their active build remain untouched. The browser retains its real origin.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."),
  build = process.env.STUDIO_QA_APP_BUILD
    ? path.resolve(process.env.STUDIO_QA_APP_BUILD)
    : "/dev/shm/autopromote-vector-artwork-20261018-build";
const apiPort = Number(process.env.STUDIO_QA_API_PORT || 5140);
const appHost = process.env.STUDIO_QA_APP_HOST || "127.0.0.2";
const appPort = Number(process.env.STUDIO_QA_APP_PORT || 5000);
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535)
  throw new Error("Invalid local API port");
if (!Number.isInteger(appPort) || appPort < 1024 || appPort > 65535)
  throw new Error("Invalid local App port");
if (!/^127\.0\.0\.\d{1,3}$/.test(appHost))
  throw new Error("The local Studio host must be a loopback address");
if (process.argv[2] === "build") {
  const settings = require("dotenv").parse(
    fs.readFileSync(path.join(root, "frontend/.env.development"))
  );
  const account = Object.fromEntries(
    Object.entries(settings).filter(([key]) => key.startsWith("REACT_APP_FIREBASE_"))
  );
  const runner = `process.env.NODE_ENV='production';process.env.BABEL_ENV='production';
    const p=require.resolve('react-scripts/config/webpack.config'),make=require(p);
    require.cache[p].exports=(...args)=>{const c=make(...args);c.cache=false;
      const visit=r=>{if(r.options?.cacheDirectory)r.options.cacheDirectory=false;(r.oneOf||r.rules||[]).forEach(visit);};
      c.module.rules.forEach(visit);return c;};require('react-scripts/scripts/build');`;
  const r = spawnSync(process.execPath, ["-e", runner], {
    cwd: path.join(root, "frontend"),
    stdio: "inherit",
    env: {
      ...process.env,
      ...account,
      REACT_APP_API_URL: `http://127.0.0.1:${apiPort}`,
      REACT_APP_ENABLE_E2E_BYPASS: "false",
      CI: "true",
      GENERATE_SOURCEMAP: "false",
      BUILD_PATH: build,
    },
  });
  process.exit(r.status ?? 1);
}
if (process.argv[2] !== "serve") throw Error("Use build or serve");
const express = require("express"),
  app = express();
const rateLimit = require("express-rate-limit");
app.use(rateLimit({ windowMs: 60000, max: 600, standardHeaders: true, legacyHeaders: false }));
app.use("/api", (req, res) => {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: apiPort,
      path: req.originalUrl,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
    },
    response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    }
  );
  upstream.setTimeout(30000, () => upstream.destroy());
  upstream.on("error", () => {
    if (!res.headersSent) res.status(502).json({ message: "Local API unavailable" });
    else res.destroy();
  });
  res.on("close", () => {
    if (!res.writableFinished) upstream.destroy();
  });
  req.pipe(upstream);
});
// Private loopback-only design media; never part of the public asset catalogue.
if (process.env.STUDIO_QA_WELCOME_MEDIA_DIR) {
  const candidateMedia = path.resolve(process.env.STUDIO_QA_WELCOME_MEDIA_DIR);
  if (!fs.statSync(candidateMedia).isDirectory()) throw new Error("Missing local candidate media");
  app.use("/_studio-preview", express.static(candidateMedia, { dotfiles: "deny", index: false }));
}
app.use(express.static(build));
app.get(/.*/, (_, res) => res.sendFile(path.join(build, "index.html")));
const server = app.listen(appPort, appHost, error => {
  if (error) {
    console.error(error.code);
    process.exit(1);
  }
  console.log(`Isolated normal Studio on ${appHost}:${appPort}`);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
