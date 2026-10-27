const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
async function restartDemoApi(directory) {
  const configFile = path.join(directory, "config.json");
  const config = JSON.parse(fs.readFileSync(configFile));
  require("../../src/services/unifiedCredits/runtime").assertSandbox(config.env);
  const pid = Number(fs.readFileSync(`${configFile}.api-pid`, "utf8"));
  const command = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
  if (
    !command.includes(configFile) ||
    !command.some(value => value.endsWith("/application-host.cjs")) ||
    !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(config.origin)
  )
    throw new Error("Owned demo API required");
  const env = {
    ...config.env,
    NODE_PATH: path.resolve(path.dirname(require.resolve("firebase-admin")), "../.."),
  };
  process.kill(pid, "SIGKILL");
  const log = fs.openSync(path.join(directory, "api-restart.log"), "a", 0o600);
  const child = spawn(
    process.execPath,
    [path.join(__dirname, "application-host.cjs"), configFile],
    { env, cwd: path.resolve(__dirname, "../.."), stdio: ["ignore", log, log], detached: true }
  );
  fs.closeSync(log);
  child.unref();
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(config.origin, { signal: AbortSignal.timeout(500) })).ok)
        return { previousPid: pid, pid: child.pid, origin: config.origin };
    } catch {
      /* Starting. */
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Demo API restart did not become ready");
}
module.exports = { restartDemoApi };
if (require.main === module)
  restartDemoApi(process.argv[2])
    .then(() => console.log("Owned local API restarted; worker/emulators retained."))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
