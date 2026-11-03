"use strict";

// Exercise installed packages after their real postinstall. Do not patch here:
// a missing lifecycle guard must fail this check, including in Functions.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

function boundedChild(source, modulePath) {
  const result = spawnSync(process.execPath, ["--max-old-space-size=128", "-e", source, modulePath], {
    encoding: "utf8", timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

async function checkMinimatch(folder) {
  const match = require(folder);
  assert.equal(typeof match, "function", "Legacy tools require a callable CJS export");
  assert.equal(match.minimatch, match, "Modern named export must use the same upstream matcher");
  const samples = [
    ["src/editor.js", "**/*.js", {}, true],
    ["src/editor.css", "**/*.js", {}, false],
    ["src/editor.js", "src/{editor,queue}.js", {}, true],
    ["src/editor.js", "!**/*.css", {}, true],
    [".hidden.js", "*.js", {}, false],
    [".hidden.js", "*.js", { dot: true }, true],
    ["EDITOR.JS", "*.js", { nocase: true }, true],
  ];
  const esm = await import(pathToFileURL(path.join(folder, "dist/esm/index.js")).href);
  for (const [file, pattern, options, expected] of samples) {
    assert.equal(match(file, pattern, options), expected);
    assert.equal(new match.Minimatch(pattern, options).match(file), expected);
    assert.equal(esm.minimatch(file, pattern, options), expected);
  }
  assert.deepEqual(match.match(["a.js", "b.css"], "*.js"), ["a.js"]);
  assert.equal(match.defaults({ nocase: true })("A.JS", "*.js"), true);
  assert.deepEqual(match.braceExpand("{one,two}.mp4"), ["one.mp4", "two.mp4"]);
  boundedChild(`
    const assert = require('node:assert/strict');
    const {Minimatch} = require(process.argv[1]);
    const pattern = '**/../a/'.repeat(30) + 'end';
    const parsed = new Minimatch(pattern, {optimizationLevel: 2, braceExpandMax: 64});
    assert.ok(parsed.globParts.length <= 64, 'Preprocessing must respect the upstream expansion bound');
  `, folder);
}

function checkJoi(folder) {
  const Joi = require(folder);
  assert.ifError(Joi.string().email().validate("creator@example.com").error);
  assert.ifError(Joi.string().email({ multiple: true }).validate("a@example.com, b@example.com").error);
  assert.ok(Joi.string().email().validate("invalid-address").error);
  boundedChild(`
    const assert = require('node:assert/strict');
    const Joi = require(process.argv[1]);
    for (const separator of [undefined, ';']) {
      const schema = Joi.string().email({multiple: true, ...(separator ? {separator} : {})});
      assert.ok(schema.validate(' '.repeat(200000)).error);
    }
  `, folder);
}

async function checkRedirects(folder) {
  const redirected = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.headers));
  });
  const original = http.createServer((_req, res) => {
    res.writeHead(302, { Location: `http://localhost:${redirected.address().port}/` });
    res.end();
  });
  try {
    redirected.listen(0, "127.0.0.1");
    await once(redirected, "listening");
    original.listen(0, "127.0.0.1");
    await once(original, "listening");
    const headers = await new Promise((resolve, reject) => {
      const request = require(folder).http.get({
        hostname: "127.0.0.1", port: original.address().port, path: "/", family: 4,
        sensitiveHeaders: vm.runInNewContext('["x-creator-secret"]'),
        headers: { "x-creator-secret": "fixture-only", "x-ordinary": "preserved" },
      }, res => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", chunk => { body += chunk; });
        res.on("end", () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
      });
      request.on("error", reject);
      request.setTimeout(3000, () => request.destroy(new Error("Local redirect fixture timed out")));
    });
    assert.equal(headers["x-creator-secret"], undefined, "Cross-realm custom credentials must be removed");
    assert.equal(headers["x-ordinary"], "preserved", "Ordinary redirect headers must still arrive");
  } finally {
    await Promise.all([original, redirected].map(server => new Promise(resolve => server.close(resolve))));
  }
}

function checkDeepmerge(folder) {
  for (const entry of ["index.js", "dist/cjs.js", "dist/umd.js"]) {
    assert.ok(fs.readFileSync(path.join(folder, entry), "utf8").includes("AUTOPROMOTE_DEEPMERGE_GUARD_20261028"),
      `Missing postinstall guard in ${entry}`);
  }
  const source = JSON.parse('{"__proto__":{"isAdmin":true},"safe":{"value":1}}');
  const target = JSON.parse('{"__proto__":{"isAdmin":true},"title":"project"}');
  for (const entry of ["dist/cjs.js", "dist/umd.js"]) {
    const merge = require(path.join(folder, entry));
    for (const value of [{}, Object.create(null), null, target]) {
      const result = merge(value, source);
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.equal(result.isAdmin, undefined);
      assert.equal(Object.hasOwn(result, "__proto__"), false);
      assert.deepEqual(result.safe, { value: 1 });
    }
    assert.equal(merge({ nested: null }, { nested: source }).nested.isAdmin, undefined);
    assert.equal(merge.all([Object.create(null), source]).isAdmin, undefined);
    const key = Symbol("retained");
    const result = merge({ list: [1], nested: { a: 1 } }, { list: [2], nested: { b: 2 }, [key]: true });
    assert.deepEqual(result.list, [1, 2]);
    assert.deepEqual(result.nested, { a: 1, b: 2 });
    assert.equal(result[key], true);
    assert.equal(Object.prototype.isAdmin, undefined);
  }
}

async function verifyProject(projectDir) {
  const project = path.resolve(projectDir);
  const lock = JSON.parse(fs.readFileSync(path.join(project, "package-lock.json"), "utf8"));
  const checks = { minimatch: 0, joi: 0, "follow-redirects": 0, deepmerge: 0 };
  for (const [relative, metadata] of Object.entries(lock.packages || {})) {
    if (!relative.startsWith("node_modules/")) continue;
    const name = Object.keys(checks).find(key => relative.endsWith(`node_modules/${key}`));
    if (!name) continue;
    const folder = path.join(project, relative);
    assert.ok(fs.existsSync(folder), `Locked dependency not installed: ${relative}`);
    if (name === "minimatch") {
      assert.equal(metadata.version, "11.0.4");
      await checkMinimatch(folder);
    } else if (name === "joi") {
      assert.equal(metadata.version, "18.3.1");
      checkJoi(folder);
    } else if (name === "follow-redirects") {
      assert.equal(metadata.version, "1.16.2");
      await checkRedirects(folder);
    } else {
      assert.equal(metadata.version, "4.3.1");
      checkDeepmerge(folder);
    }
    checks[name]++;
  }
  assert.ok(checks.minimatch && checks.deepmerge, "Every supported project must exercise matcher and merge guards");
  return checks;
}

if (require.main === module) {
  verifyProject(process.argv[2] || process.cwd()).then(checks => console.log(JSON.stringify(checks)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { verifyProject };
