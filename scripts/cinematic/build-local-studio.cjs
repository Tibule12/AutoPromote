#!/usr/bin/env node
/* Bundle the actual production editor in an isolated shell, never replace App build. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const ROOT = path.resolve(__dirname, "../..");
const frontendRequire = createRequire(path.join(ROOT, "frontend/package.json"));
const webpack = frontendRequire("webpack");
const output = path.join(ROOT, "reports/cinematic-evidence-20261031/local-app");
const isolation = path.join(__dirname, "localFirebase.js");
const flags = {
  NODE_ENV: "production", REACT_APP_API_URL: "http://127.0.0.1:6341",
  REACT_APP_CINEMATIC_LOCAL: "true", REACT_APP_E2E_AUTH_BYPASS: "false",
  REACT_APP_WELCOME_STUDIO_PREVIEW: "false", REACT_APP_CREDITS_PILOT: "false",
};
fs.mkdirSync(output, { recursive: true });
const compiler = webpack({
  mode: "production", entry: path.join(__dirname, "localStudio.jsx"), devtool: false,
  output: { path: output, filename: "studio.js", publicPath: "/", clean: true },
  optimization: { minimize: false },
  resolve: { extensions: [".js", ".jsx", ".json"], modules: [path.join(ROOT, "frontend/node_modules"), "node_modules"],
    alias: { [path.join(ROOT, "frontend/src/firebaseClient.js")]: isolation,
      "firebase/auth$": isolation, "firebase/storage$": isolation,
      "react-router$": path.join(ROOT, "frontend/src/react-router-dom.js") } },
  module: { rules: [
    { test: /\.jsx?$/, exclude: /node_modules/, use: { loader: frontendRequire.resolve("babel-loader"), options: {
      configFile: false, babelrc: false,
      presets: [[frontendRequire.resolve("@babel/preset-env"), { targets: { chrome: "125" } }],
        [frontendRequire.resolve("@babel/preset-react"), { runtime: "automatic" }]] } } },
    { test: /\.css$/, use: [frontendRequire.resolve("style-loader"), frontendRequire.resolve("css-loader")] },
    { test: /\.(ttf|woff2?|png|jpe?g|svg|webp|mp4|wav|mp3)$/, type: "asset/resource" },
  ] },
  plugins: [new webpack.DefinePlugin({ "process.env": "(" + JSON.stringify(flags) + ")" })],
  performance: false,
});
compiler.run((error, stats) => {
  if (error || stats.hasErrors()) {
    console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1;
  } else {
    fs.mkdirSync(path.join(output, "brand"), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "frontend/public/brand/autopromote-gradient.svg"), path.join(output, "brand/autopromote-gradient.svg"));
    fs.writeFileSync(path.join(output, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoPromote Cinematic Studio · Local</title><style>html,body{margin:0;background:#0b111b;color:#eaf0f5;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/studio.js"></script></body></html>');
    const hashFile = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
    const sourceFiles = ["frontend/src/components/ViralClipStudio.js", "frontend/src/components/studioProjectDocument.js",
      "frontend/src/components/threeD/StudioCinematicPanel.js", "frontend/src/components/threeD/studio3DModel.js",
      "frontend/src/components/threeD/cinematicProgrammeClient.js",
      "frontend/src/components/threeD/cinematicContract.js", "scripts/cinematic/localStudio.jsx", "scripts/cinematic/localFirebase.js"];
    fs.writeFileSync(path.join(output, "build.json"), JSON.stringify({ editor: "frontend/src/components/ViralClipStudio.js", flags,
      worktree: ROOT, branch: execFileSync("git", ["branch", "--show-current"], { cwd: ROOT, encoding: "utf8" }).trim(),
      baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
      sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, hashFile(file)])), bundleSha256: hashFile(path.relative(ROOT, path.join(output, "studio.js"))),
      reactVersion: frontendRequire("react/package.json").version, webpackVersion: frontendRequire("webpack/package.json").version,
      firebase: "build-time-disabled", builtAt: new Date().toISOString() }, null, 2));
    console.log("Built actual Studio editor in " + output);
    if (stats.hasWarnings()) console.log(stats.toString({ all: false, warnings: true }));
  }
  compiler.close(() => {});
});
