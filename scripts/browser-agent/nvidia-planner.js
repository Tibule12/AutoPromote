"use strict";
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { ACTION_SCHEMA, SYSTEM } = require("./planner");
const execute = promisify(execFile);

class NvidiaPlanner {
  constructor({ host = "autopromote-l40s-staging", spool = "/tmp/autopromote-studio-l40s-20261006/browser-spool", timeoutMs = 60000 } = {}) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(host) || !/^\/[a-zA-Z0-9/_-]+$/.test(spool)) throw new Error("Invalid NVIDIA SSH host or spool path");
    this.host = host; this.spool = spool; this.timeoutMs = timeoutMs;
  }
  async decide({ task, snapshot, image, recovery }) {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "browser-planner-"));
    const id = crypto.randomUUID();
    const filename = path.join(temporary, `${id}.request.json`);
    try {
      await fs.writeFile(filename, JSON.stringify({ system: SYSTEM, schema: ACTION_SCHEMA, expires_at: Date.now() / 1000 + 55,
        input: { task, observation: snapshot, recovery }, image: image?.toString("base64") }), { mode: 0o600 });
      await execute("scp", ["-q", "-o", "RequestTTY=no", filename, `${this.host}:${this.spool}/${id}.request.json.tmp`], { timeout: this.timeoutMs });
      await execute("ssh", ["-T", "-o", "RequestTTY=no", this.host,
        `mv ${this.spool}/${id}.request.json.tmp ${this.spool}/${id}.request.json`], { timeout: this.timeoutMs });
      const { stdout } = await execute("ssh", ["-T", "-o", "RequestTTY=no", this.host,
        `for browser_planner_attempt in $(seq 1 55); do if test -f ${this.spool}/${id}.response.json; then cat ${this.spool}/${id}.response.json || exit 1; exit 0; fi; sleep 1; done; exit 1`],
        { timeout: this.timeoutMs, maxBuffer: 1_000_000 });
      const result = JSON.parse(stdout);
      if (result.error) throw new Error(`NVIDIA planner: ${result.error}`);
      this.lastReceipt = { model: result.model, revision: result.revision, gpu: result.gpu, seconds: result.seconds, inputTokens: result.input_tokens, outputTokens: result.output_tokens };
      return result.action;
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  }
}
module.exports = { NvidiaPlanner };
