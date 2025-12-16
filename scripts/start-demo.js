const { spawn } = require("child_process");
const path = require("path");

function start(name, cmd, args, opts) {
  const p = spawn(
    cmd,
    args,
    Object.assign({ stdio: "inherit", shell: true, cwd: process.cwd() }, opts)
  );
  p.on("exit", code => console.log(`${name} exited with code ${code}`));
  p.on("error", err => console.error(`${name} failed to start:`, err));
  return p;
}

console.log("Starting mock backend (port 8082)...");
const mock = start("mock-backend", "node", ["src/mock/tiktok_share_backend.js"]);

console.log("Starting static docs server (port 8081)...");
const httpServer = start("http-server", "npx.cmd", ["http-server", "docs", "-p", "8081"]);

// On process exit, kill children
process.on("exit", () => {
  try {
    mock.kill();
    httpServer.kill();
  } catch (e) {}
});
process.on("SIGINT", () => process.exit());
