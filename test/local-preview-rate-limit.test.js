const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');

test('actual local Studio host limits file reads and ignores spoofed forwarding headers', async t => {
  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'autopromote-rate-limit-'));
  t.after(() => fs.rmSync(build, { recursive: true, force: true }));
  fs.writeFileSync(path.join(build, 'index.html'), '<!doctype html><title>Local fixture</title>');
  const source = path.resolve(__dirname, '../scripts/studio-professional/serve-local.js');
  let app, policy;
  const context = {
    __dirname: path.dirname(source), console: { log() {}, error() {} }, process: { on() {} },
    require(name) {
      if (name === 'express') return Object.assign(() => {
        app = express(); app.listen = () => ({ close() {} });
        const get = app.get.bind(app);
        // Express recognizes native-realm RegExp routes; bridge VM literals.
        app.get = (route, ...handlers) => get(Object.prototype.toString.call(route) === '[object RegExp]' ? new RegExp(route.source, route.flags) : route, ...handlers);
        return app;
      }, express);
      if (name === 'express-rate-limit') return options => { policy = options; return rateLimit({ ...options, max: 2 }); };
      if (name === 'node:path') return { ...path, resolve: () => build };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), context, { filename: source });
  assert.equal(policy.windowMs, 60000);
  assert.equal(policy.max, 3000);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (let i = 0; i < 2; i++) {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    await response.text();
  }
  const response = await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.123' } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('ratelimit-limit'), '2');
  await response.text();
});
