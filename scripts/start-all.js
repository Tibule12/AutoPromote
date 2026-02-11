const { spawn } = require("child_process");
const path = require("path");

function startProcess(name, script, args = [], envVars = {}) {
  console.log(`[start-all] Starting ${name}...`);
  const child = spawn("node", [script, ...args], {
    stdio: "inherit",
    env: { ...process.env, ...envVars },
    cwd: path.resolve(__dirname, ".."),
  });

  child.on("exit", (code) => {
    console.log(`[start-all] ${name} exited with code ${code}`);
    // If one fails, kill the other? Or restart?
    // For now, let the container orchestration handle restart if the main process dies.
    // However, if server dies, we probably want to exit strict.
    if (name === "server") process.exit(code || 1);
  });

  return child;
}

// Ensure background jobs are enabled for the worker process
const workerEnv = { ENABLE_BACKGROUND_JOBS: "true" };

// Start Worker
const worker = startProcess("worker", "worker.js", [], workerEnv);

// Start Server
const server = startProcess("server", "src/server.js");

// Handle termination signals to kill children
const cleanup = () => {
  console.log("[start-all] Terminating children...");
  worker.kill();
  server.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
