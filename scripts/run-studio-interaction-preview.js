#!/usr/bin/env node
// Compile the production editor for deterministic local interaction checks.
// This host has no API router, user credentials, cloud operations or auth bypass.
const fs = require("fs");
const path = require("path");
const express = require("express");
const root = path.resolve(__dirname, "..");
const folder = path.resolve(
  root,
  process.env.STUDIO_INTERACTION_FOLDER || "artifacts/studio-interactions-20261004"
);
const port = Number(process.env.STUDIO_INTERACTION_PORT || 5007);
// Firebase modules require client configuration at import time. The editor
// fixture has no signed-in user and never calls Firebase or the cloud API.
const firebase = {
  apiKey: "local-interaction-fixture",
  authDomain: "localhost",
  projectId: "studio-interaction-fixture",
  storageBucket: "studio-interaction-fixture.invalid",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:local-interaction-fixture",
};
fs.mkdirSync(folder, { recursive: true });
const fixture = path.join(folder, "fixture.mp4");
if (!fs.existsSync(fixture)) {
  const result = require("child_process").spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "12",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-movflags",
      "+faststart",
      fixture,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0)
    throw new Error(
      result.error?.message || result.stderr || "FFmpeg could not generate the video fixture"
    );
}
const secondFixture = path.join(folder, "fixture-second.mp4");
if (!fs.existsSync(secondFixture)) {
  const result = require("child_process").spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:size=640x360:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=44100",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-movflags",
      "+faststart",
      secondFixture,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0)
    throw new Error(
      result.error?.message || result.stderr || "Could not generate the second fixture"
    );
}
process.env.NODE_ENV = "development";
process.env.BABEL_ENV = "development";
process.env.FAST_REFRESH = "false";
process.env.REACT_APP_API_URL = `http://127.0.0.1:${port}`;
process.env.REACT_APP_ENABLE_STUDIO_ANALYSIS_JOBS = "false";
process.env.REACT_APP_E2E_AUTH_BYPASS = "false";
for (const [name, suffix] of Object.entries({
  apiKey: "API_KEY",
  authDomain: "AUTH_DOMAIN",
  projectId: "PROJECT_ID",
  storageBucket: "STORAGE_BUCKET",
  messagingSenderId: "MESSAGING_SENDER_ID",
  appId: "APP_ID",
}))
  process.env[`REACT_APP_FIREBASE_${suffix}`] = firebase[name];
process.chdir(path.join(root, "frontend"));
const frontendRequire = require("module").createRequire(path.join(root, "frontend/package.json"));
const webpack = frontendRequire("webpack");
const config = frontendRequire("react-scripts/config/webpack.config")("development");
config.entry = path.join(root, "test/e2e/playwright/studio-interaction-entry.jsx");
config.output.path = path.join(folder, "build");
config.output.publicPath = "/";
config.resolve.plugins = config.resolve.plugins.filter(
  plugin => plugin.constructor.name !== "ModuleScopePlugin"
);
config.resolve.modules.unshift(path.join(root, "frontend/node_modules"));
const babelRule = config.module.rules
  .find(rule => rule.oneOf)
  .oneOf.find(rule => rule.loader?.includes("babel-loader") && rule.include);
babelRule.include = [path.join(root, "frontend/src"), path.dirname(config.entry)];
config.plugins = config.plugins.filter(
  plugin =>
    ![
      "HtmlWebpackPlugin",
      "InterpolateHtmlPlugin",
      "ForkTsCheckerWebpackPlugin",
      "ESLintWebpackPlugin",
      "ReactRefreshPlugin",
    ].includes(plugin.constructor.name)
);
config.cache = false;
config.devtool = false;
webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) {
    console.error(error?.message || stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
    return;
  }
  const app = express();
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "LOCAL_INTERACTION_FIXTURE_HAS_NO_API" })
  );
  app.get("/", (_req, res) =>
    res
      .type("html")
      .send(
        '<!doctype html><html><head><meta charset="utf-8"><title>Studio interaction fixture</title></head>' +
          '<body><div id="root"></div><script defer src="/static/js/bundle.js"></script></body></html>'
      )
  );
  app.get("/fixture.mp4", (_req, res) => res.sendFile(path.join(folder, "fixture.mp4")));
  app.get("/fixture-second.mp4", (_req, res) => res.sendFile(secondFixture));
  app.use(express.static(config.output.path));
  app.listen(port, "127.0.0.1", () =>
    console.log(JSON.stringify({ ready: true, port, cloudApi: false, signedIn: false }))
  );
});
