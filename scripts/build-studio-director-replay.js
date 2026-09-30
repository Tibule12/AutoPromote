#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const webpack = require(path.join(repoRoot, "frontend/node_modules/webpack"));
const outputFile = path.join(repoRoot, "src/generated/studioDirectorReplayKernel.cjs");
const check = process.argv.includes("--check");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-director-replay-"));
const bundleFile = path.join(temporaryDirectory, path.basename(outputFile));

const config = {
  mode: "production",
  target: "node",
  entry: path.join(__dirname, "studio-director-replay-entry.js"),
  devtool: false,
  output: {
    path: temporaryDirectory,
    filename: path.basename(outputFile),
    library: { type: "commonjs2" },
  },
  optimization: {
    moduleIds: "deterministic",
    chunkIds: "deterministic",
    minimize: true,
  },
};

webpack(config, (error, stats) => {
  try {
    if (error || stats?.hasErrors()) {
      throw error || new Error(stats.toString({ all: false, errors: true }));
    }
    const generated = fs.readFileSync(bundleFile);
    if (check) {
      const committed = fs.readFileSync(outputFile);
      if (!generated.equals(committed)) {
        throw new Error("Studio Director replay bundle is stale. Run node scripts/build-studio-director-replay.js.");
      }
      process.stdout.write("Studio Director replay bundle matches the frontend command kernel.\n");
    } else {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, generated);
      process.stdout.write(`Wrote ${path.relative(repoRoot, outputFile)}.\n`);
    }
  } catch (buildError) {
    process.stderr.write(`${buildError.stack || buildError}\n`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
