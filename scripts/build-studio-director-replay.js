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
  context: repoRoot,
  target: "node",
  entry: path.join(__dirname, "studio-director-replay-entry.js"),
  devtool: false,
  // Keep module IDs identical in a normal CI install and a worktree sharing
  // frontend dependencies through a symlink. The frontend lock owns this code.
  resolve: {
    symlinks: false,
    modules: [path.join(repoRoot, "frontend/node_modules"), "node_modules"],
  },
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
    const licenseFile = `${bundleFile}.LICENSE.txt`;
    const generatedLicense = fs.existsSync(licenseFile) ? fs.readFileSync(licenseFile) : null;
    if (check) {
      const committed = fs.readFileSync(outputFile);
      if (!generated.equals(committed)) {
        throw new Error("Studio Director replay bundle is stale. Run node scripts/build-studio-director-replay.js.");
      }
      if (generatedLicense && (!fs.existsSync(`${outputFile}.LICENSE.txt`) ||
          !generatedLicense.equals(fs.readFileSync(`${outputFile}.LICENSE.txt`)))) {
        throw new Error("Studio Director replay license file is stale. Rebuild the replay bundle.");
      }
      process.stdout.write("Studio Director replay bundle matches the frontend command kernel.\n");
    } else {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, generated);
      if (generatedLicense) fs.writeFileSync(`${outputFile}.LICENSE.txt`, generatedLicense);
      process.stdout.write(`Wrote ${path.relative(repoRoot, outputFile)}.\n`);
    }
  } catch (buildError) {
    process.stderr.write(`${buildError.stack || buildError}\n`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
