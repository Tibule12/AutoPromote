let initializeTestEnvironment;
try {
  ({ initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
} catch (e) {
  // not available
}

const DEFAULT_RETRIES = 3;

const net = require("net");

async function tryConnectPort(port, host = "127.0.0.1", timeout = 200) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let done = false;
    const onResult = ok => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch (e) {}
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once("error", () => onResult(false));
    socket.once("timeout", () => onResult(false));
    socket.connect(port, host, () => onResult(true));
  });
}

async function discoverEmulatorHost() {
  const candidates = [8080, 8081, 8082, 9090, 9000];
  for (const port of candidates) {
    // try common hostnames
    if (await tryConnectPort(port, "127.0.0.1")) return `127.0.0.1:${port}`;
    if (await tryConnectPort(port, "localhost")) return `localhost:${port}`;
  }
  return null;
}

async function initializeTestEnvironmentWithDiscovery(projectId, retries = DEFAULT_RETRIES) {
  if (!initializeTestEnvironment) throw new Error("@firebase/rules-unit-testing not available");
  const emHost = process.env.FIRESTORE_EMULATOR_HOST;
  let resolvedHost = emHost;
  if (!resolvedHost) {
    // attempt to auto-discover a running emulator on common ports
    // and set FIRESTORE_EMULATOR_HOST so downstream code sees it
    // (this makes direct `jest` runs find a locally-running emulator).
    // This is best-effort and will not start emulators.
    // eslint-disable-next-line no-await-in-loop
    const found = await discoverEmulatorHost();
    if (found) {
      process.env.FIRESTORE_EMULATOR_HOST = found;
      resolvedHost = found;
    }
  }
  const opts = { projectId };
  if (resolvedHost) {
    const [host, port] = resolvedHost.split(":");
    opts.firestore = { host, port: parseInt(port, 10) };
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await initializeTestEnvironment(opts);
    } catch (e) {
      if (attempt === retries) throw e;
      // small backoff
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

module.exports = { initializeTestEnvironmentWithDiscovery };
