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
// Also inject telemetry disabling flags to prevent Firestore/gRPC recursion crashes on Render
const commonEnv = {
  ENABLE_BACKGROUND_JOBS: "true",
  // Fix for: EnabledTraceUtil.startActiveSpan stack overflow
  GOOGLE_CLOUD_DISABLE_GRPC_GCP_OBSERVABILITY: "true",
  // Disable OpenTelemetry SDK explicitly
  OTEL_SDK_DISABLED: "true",
  OTEL_TRACES_EXPORTER: "none", 
};

// Start Worker
const worker = startProcess("worker", "worker.js", [], commonEnv);

// Start Server
// We also pass the env vars to server to protect it from the same crash
const server = startProcess("server", "src/server.js", [], commonEnv);

// Handle termination signals to kill children
const cleanup = () => {
  console.log("[start-all] Terminating children...");
  worker.kill();
  server.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
