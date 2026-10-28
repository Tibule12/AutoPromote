"use strict";

// Narrow, version-bound guards for advisories without a compatible published
// release in the installed graph. Keep lock versions and scanner findings
// visible; these mitigations are not a claim that upstream released a fix.
const fs = require("node:fs");
const path = require("node:path");
const marker = "AUTOPROMOTE_SECURITY_GUARD_20261022";

function replaceOnce(file, before, after, patchMarker = marker) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(patchMarker)) return;
  if (!source.includes(before)) throw new Error(`Security patch no longer matches ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}

function patchSecurityDependencies(projectDir = process.cwd()) {
  const lockFile = path.join(projectDir, "package-lock.json");
  if (!fs.existsSync(lockFile)) return;
  const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  for (const [relative, metadata] of Object.entries(lock.packages || {})) {
    if (!relative.startsWith("node_modules/")) continue;
    const folder = path.join(projectDir, relative);
    if (!fs.existsSync(folder)) continue;
    if (relative.endsWith("node_modules/deepmerge") && metadata.version === "4.3.1") {
      // GHSA-gcqx-w48m-w2h4 has no upstream release. Filter both source and
      // target keys, including nested merges and null-prototype targets.
      const deepmergeMarker = "AUTOPROMOTE_DEEPMERGE_GUARD_20261028";
      for (const entry of ["index.js", "dist/cjs.js", "dist/umd.js"]) {
        const file = path.join(folder, entry);
        if (!fs.existsSync(file)) continue;
        replaceOnce(
          file,
          "return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target))",
          `// ${deepmergeMarker}: never invoke the destination's __proto__ setter.
return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target)).filter(function(key) {
  return key !== '__proto__'
})`,
          deepmergeMarker
        );
      }
    }
    if (relative.endsWith("node_modules/node-forge") && metadata.version === "1.4.0") {
      replaceOnce(
        path.join(folder, "lib/rsa.js"),
        "obj.value.length !== 2) {",
        `obj.value.length !== 2 ||
            // ${marker}: reject extra nested DigestAlgorithm elements.
            !Array.isArray(obj.value[0].value) ||
            obj.value[0].value.length < 1 || obj.value[0].value.length > 2) {`
      );
    }
    if (relative.endsWith("node_modules/braces") && metadata.version === "3.0.3") {
      const guard = path.join(folder, "lib/autopromote-depth-guard.js");
      fs.writeFileSync(
        guard,
        `"use strict";
// ${marker}: bound recursive AST walkers, including direct AST inputs.
module.exports = ast => {
  const pending = [{ node: ast, depth: 0 }], seen = new Set();
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop();
    if (++count > 100000 || depth > 128) throw new SyntaxError("Brace AST exceeds safe complexity");
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) throw new SyntaxError("Cyclic brace AST");
    seen.add(node);
    if (Array.isArray(node.nodes)) {
      if (node.nodes.length + pending.length + count > 100000) throw new SyntaxError("Brace AST exceeds safe complexity");
      for (const child of node.nodes) pending.push({ node: child, depth: depth + 1 });
    }
  }
};
`
      );
      for (const operation of ["compile", "expand"]) {
        replaceOnce(
          path.join(folder, `lib/${operation}.js`),
          `module.exports = ${operation};`,
          `// ${marker}
module.exports = (ast, options) => {
  require('./autopromote-depth-guard')(ast);
  return ${operation}(ast, options);
};`
        );
      }
      replaceOnce(
        path.join(folder, "lib/stringify.js"),
        "module.exports = (ast, options = {}) => {",
        `module.exports = (ast, options = {}) => {
  // ${marker}
  require('./autopromote-depth-guard')(ast);`
      );
      const parser = path.join(folder, "lib/parse.js");
      const source = fs.readFileSync(parser, "utf8");
      if (!source.includes(marker)) {
        if ((source.match(/stack\.push\(block\);/g) || []).length !== 2)
          throw new Error("Braces parser patch no longer matches");
        fs.writeFileSync(
          parser,
          source.replace(
            /stack\.push\(block\);/g,
            `// ${marker}
      if (stack.length >= 128) throw new SyntaxError("Brace pattern exceeds safe depth");
      stack.push(block);`
          )
        );
      }
    }
    if (relative.endsWith("node_modules/@opentelemetry/core") && metadata.version === "1.30.1") {
      for (const format of ["src", "esm", "esnext"]) {
        const file = path.join(
          folder,
          `build/${format}/baggage/propagation/W3CBaggagePropagator.js`
        );
        const declaration = format === "esm" ? "var" : "const";
        replaceOnce(
          file,
          `        ${declaration} baggageString = Array.isArray(headerValue)`,
          `        // ${marker}: bound carrier data before join/split/decode.
        const values = Array.isArray(headerValue) ? headerValue : [headerValue];
        if (values.length > 180) return context;
        let bytes = 0;
        for (const value of values) {
            if (typeof value !== 'string' || (bytes += value.length) > 8192) return context;
        }
        ${declaration} baggageString = Array.isArray(headerValue)`
        );
      }
    }
  }
}
if (require.main === module) patchSecurityDependencies();
module.exports = { patchSecurityDependencies };
