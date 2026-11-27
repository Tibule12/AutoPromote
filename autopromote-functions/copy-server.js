const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");

async function copyRecursive(src, dest, repoRoot) {
  // Resolve and ensure we don't accidentally follow a symlink that points
  // outside the repository root or walk protected system directories.
  const resolvedSrc = path.resolve(src);
  if (repoRoot && !resolvedSrc.startsWith(repoRoot)) {
    // Skip paths that are outside the repository root, which can happen
    // if a symlink accidentally points to system directories like /lib
    console.warn("[copy-server] Skipping path outside repo root:", resolvedSrc);
    return;
  }
  const stat = await fsp.lstat(src);
  if (stat.isSymbolicLink()) {
    // Skip symlinks to avoid following system paths that we cannot access
    console.warn("[copy-server] Skipping symbolic link:", src);
    return;
  }
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src);
    for (const e of entries) {
      try {
        await copyRecursive(path.join(src, e), path.join(dest, e), repoRoot);
      } catch (e) {
        console.warn("[copy-server] skip entry due to error:", e && e.message);
      }
    }
  } else {
    // Ensure dest dir exists
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(src, dest);
  }
}

async function main() {
  const functionsDir = __dirname; // autopromote-functions
  const repoRoot = path.resolve(functionsDir, "..");

  // Check if we are in the correct repository structure by looking for the root package.json
  // In Cloud Functions environment, the parent directory (root) won't have the project's package.json
  if (!fs.existsSync(path.join(repoRoot, "package.json"))) {
    console.log("[copy-server] No package.json found in parent directory. Assuming deployed environment. Skipping copy.");
    return;
  }

  const sourceDir = path.join(repoRoot, "src");
  const destPkgDir = path.join(functionsDir, "_server");

  try {
    // Create destination package dir
    await fsp.mkdir(destPkgDir, { recursive: true });
    // Copy package.json minimal
    const rootPkgPath = path.join(repoRoot, "package.json");
    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(await fsp.readFile(rootPkgPath, "utf8"));
      const destPkgJson = {
        name: rootPkg.name || "autopromote-server",
        main: rootPkg.main || "src/server.js",
        version: rootPkg.version || "1.0.0",
      };
      await fsp.writeFile(
        path.join(destPkgDir, "package.json"),
        JSON.stringify(destPkgJson, null, 2),
        "utf8"
      );
    }
    // Copy src directory recursively
    if (fs.existsSync(sourceDir)) {
      // This is generated package source, never user data. A fresh tree ensures
      // deleted routes/services cannot survive a previous packaging run.
      await fsp.rm(path.join(destPkgDir, "src"), { recursive: true, force: true });
      await copyRecursive(sourceDir, path.join(destPkgDir, "src"), repoRoot);
      console.log("[copy-server] Copied server src into functions/_server");
    } else {
      console.warn("[copy-server] No server src found at", sourceDir);
    }

    // Server dispatchers import canonical CommonJS creative contracts from the
    // frontend source tree. Include exactly those files and their relative
    // dependencies: importing the lazy Functions export alone misses this gap.
    const frontendRoot = path.join(repoRoot, "frontend");
    const pending = [];
    const copied = new Set();
    const staticRequires = text => [...text.matchAll(/require\(["']([^"']+)["']\)/g)].map(match => match[1]);
    async function discover(directory) {
      for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || entry.name === "__tests__") continue;
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) await discover(filename);
        else if (/\.(?:c?js)$/.test(entry.name)) {
          for (const dependency of staticRequires(await fsp.readFile(filename, "utf8"))) {
            if (dependency.startsWith(".") && dependency.includes("frontend/"))
              pending.push(path.resolve(path.dirname(filename), dependency));
          }
        }
      }
    }
    await discover(sourceDir);
    await fsp.rm(path.join(destPkgDir, "frontend"), { recursive: true, force: true });
    while (pending.length) {
      let filename = pending.pop();
      if (!path.extname(filename)) filename += ".js";
      if (!filename.startsWith(frontendRoot + path.sep))
        throw new Error("Creative contract dependency leaves frontend tree");
      if (copied.has(filename)) continue;
      const stat = await fsp.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Creative contract must be a regular file");
      copied.add(filename);
      const body = await fsp.readFile(filename, "utf8");
      for (const dependency of staticRequires(body))
        if (dependency.startsWith(".")) pending.push(path.resolve(path.dirname(filename), dependency));
      await copyRecursive(filename, path.join(destPkgDir, path.relative(repoRoot, filename)), repoRoot);
    }
    console.log(`[copy-server] Copied ${copied.size} shared creative contract dependencies`);
    const serverContracts = [
      "contracts/model-capabilities-v1.json",
      "contracts/creative-templates-v1.json",
      "config/model-runtime/registry.v1.json",
      "config/model-runtime/local-cuda-evaluation.v1.json",
      "config/creative-templates/registry.v1.json",
    ];
    for (const filename of serverContracts)
      await copyRecursive(path.join(repoRoot, filename), path.join(destPkgDir, filename), repoRoot);
    console.log(`[copy-server] Copied ${serverContracts.length} model/template schemas and registries`);

    // Copy a few root-level files that src modules expect to import from project root
    // e.g., src/firebaseAdmin.js expects to require('../firebaseAdmin') which would
    // look for a file at functions/_server/firebaseAdmin.js
    const rootFilesToCopy = ["firebaseAdmin.js", "firebaseClient.js", "firebaseConfig.server.js"];
    for (const fname of rootFilesToCopy) {
      const srcPath = path.join(repoRoot, fname);
      const destPath = path.join(destPkgDir, fname);
      if (fs.existsSync(srcPath)) {
        await copyRecursive(srcPath, destPath, repoRoot);
        console.log(`[copy-server] Copied ${fname} into functions/_server`);
      }
    }
  } catch (err) {
    console.error("[copy-server] Error copying server package into functions:", err.message || err);
    process.exit(1);
  }

  // Copy the `lib` directory if present (some modules import from ../../lib/*)
  const libDir = path.join(repoRoot, "lib");
  if (fs.existsSync(libDir)) {
    await copyRecursive(libDir, path.join(destPkgDir, "lib"), repoRoot);
    console.log("[copy-server] Copied lib/ into functions/_server/lib");
  }
}

main();
