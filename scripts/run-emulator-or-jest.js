#!/usr/bin/env node
/* run-emulator-or-jest.js

Orchestrate running the Firestore emulator for the full test suite.

Behavior:
- Prefer to use `npx firebase emulators:exec ...` which scopes env vars to the child process.
- If `emulators:exec` fails in a way that indicates env discovery may be unreliable for the full test matrix,
  fall back to starting `emulators:start` in the background, wait until it's ready, set FIRESTORE_EMULATOR_HOST
  in the current process environment and run Jest directly so all workers reliably inherit the env.
- If Java or firebase CLI prerequisites are missing, optionally fall back to running Jest directly when
  ALLOW_FALLBACK_NO_EMULATOR=1 is set.
*/
const { spawnSync, spawn } = require('child_process');
const { EOL } = require('os');

function tryRunFirebaseExec() {
  console.log('[run-emulator-or-jest] Attempting: npx firebase emulators:exec --only firestore "node ./scripts/exec-jest.js"');
  // Combine the command and script into a single argument for the script parameter
  const res = spawnSync('npx', ['firebase', 'emulators:exec', '--only', 'firestore', 'node ./scripts/exec-jest.js'], {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
  return res.status;
}

function runJestDirect(envExtras = {}) {
  console.log('[run-emulator-or-jest] Running Jest directly (node ./scripts/exec-jest.js)');
  const path = require('path');
  const fs = require('fs');
  const env = Object.assign({}, process.env, envExtras);
  // Remove any JEST_MATCH to ensure we run the full suite by default
  // if (env.JEST_MATCH) delete env.JEST_MATCH;
  // Ensure frontend packages (e.g., @testing-library/jest-dom) are resolvable
  const frontendNodeModules = path.join(process.cwd(), 'frontend', 'node_modules');
  if (!fs.existsSync(frontendNodeModules)) {
    console.log('[run-emulator-or-jest] frontend/node_modules missing — attempting to install frontend deps (npm ci --prefix frontend)');
    const install = spawnSync('npm', ['ci', '--prefix', 'frontend'], { stdio: 'inherit', shell: true });
    if (install.status !== 0) {
      console.warn('[run-emulator-or-jest] npm ci --prefix frontend failed; trying npm install --prefix frontend');
      const install2 = spawnSync('npm', ['install', '--prefix', 'frontend'], { stdio: 'inherit', shell: true });
      if (install2.status !== 0) {
        console.warn('[run-emulator-or-jest] Failed to install frontend dependencies automatically. CI should run `npm ci --prefix frontend` before tests.');
      } else {
        console.log('[run-emulator-or-jest] Frontend dependencies installed via npm install --prefix frontend');
      }
    } else {
      console.log('[run-emulator-or-jest] Frontend dependencies installed via npm ci --prefix frontend');
    }
  }
  if (env.NODE_PATH) {
    env.NODE_PATH = frontendNodeModules + path.delimiter + env.NODE_PATH;
  } else {
    env.NODE_PATH = frontendNodeModules;
  }
  // Node recognizes NODE_PATH when run with require('module').Module._initPaths() - many environments honor it
  const res = spawnSync('node', ['./scripts/exec-jest.js'], { stdio: 'inherit', env, shell: false });
  return res.status;
}

function startEmulatorBackground({timeoutMs = 60_000} = {}) {
  return new Promise((resolve, reject) => {
    console.log('[run-emulator-or-jest] Starting Firestore emulator in background: npx firebase emulators:start --only firestore');
    const child = spawn('npx', ['firebase', 'emulators:start', '--only', 'firestore'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let ready = false;
    let locatorPath = null;
    const timer = setTimeout(() => {
      if (!ready) {
        reject(new Error('Timed out waiting for emulator to be ready'));
      }
    }, timeoutMs);

    function onData(chunk) {
      const s = chunk.toString();
      stdout += s;
      // Capture locator file path emitted by the emulator
      const loc = s.match(/Emulator locator file path:\s*(.*)/i);
      if (loc && loc[1]) {
        locatorPath = loc[1].trim();
      }
      // Look for lines that indicate host/port or all emulators ready
      if (/All emulators ready/i.test(stdout) || /export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080/.test(stdout) || /127\.0\.0\.1:8080/.test(stdout)) {
        ready = true;
        clearTimeout(timer);
        // Before resolving, ensure the HTTP admin endpoint is responsive
        const host = '127.0.0.1:8080';
        (async () => {
          try {
            await waitForHttpReady('127.0.0.1', 8080, 10000);
            console.log('[run-emulator-or-jest] Firestore HTTP endpoint responsive');
            console.log('[run-emulator-or-jest] Firestore emulator ready at', host, locatorPath ? `(locator: ${locatorPath})` : '');
            resolve({ child, host, locator: locatorPath });
          } catch (err) {
            reject(new Error('Emulator HTTP endpoint did not become ready: ' + err && err.message));
          }
        })();
      }
    }

    child.stdout && child.stdout.on('data', onData);
    child.stderr && child.stderr.on('data', chunk => {
      const s = chunk.toString();
      stderr += s;
      onData(chunk);
    });

    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code, sig) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error('Emulator process exited prematurely with code ' + code + ' sig ' + sig + '\n' + stderr + '\n' + stdout));
      }
    });
  });
}

async function stopEmulator(child) {
  if (!child || child.killed) return;
  try {
    console.log('[run-emulator-or-jest] Stopping emulator (sending SIGINT)');
    child.kill('SIGINT');
    // wait up to 10s for exit
    const start = Date.now();
    while (!child.killed && Date.now() - start < 10000) {
      await new Promise(r => setTimeout(r, 200));
    }
    if (!child.killed) {
      console.warn('[run-emulator-or-jest] Emulator did not stop, killing forcefully');
      child.kill('SIGKILL');
    }
  } catch (e) {
    console.warn('[run-emulator-or-jest] Error stopping emulator:', e && e.message);
  }
}

function waitForHttpReady(host, port, timeoutMs = 10000) {
  const http = require('http');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const req = http.request({ host, port, path: '/', method: 'GET', timeout: 2000 }, res => {
        // any response is considered ready
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(attempt, 200);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(attempt, 200);
      });
      req.end();
    })();
  });
}

(async function main() {
  try {
    // Check firebase CLI availability first
    const check = spawnSync('npx', ['firebase', '--version'], { stdio: 'pipe', shell: true });
    if (check.status !== 0) {
      console.error('[run-emulator-or-jest] Firebase CLI (`firebase`) not available via npx.');
      console.error('Install it locally with `npm install --save-dev firebase-tools` or set ALLOW_FALLBACK_NO_EMULATOR=1 to run tests without the emulator (not recommended for emulator-dependent tests).');
      if (process.env.ALLOW_FALLBACK_NO_EMULATOR === '1' || process.env.ALLOW_FALLBACK_NO_EMULATOR === 'true') {
        console.warn('[run-emulator-or-jest] ALLOW_FALLBACK_NO_EMULATOR set — running Jest directly (skipping emulator).');
        const fallback = runJestDirect();
        process.exit(fallback || 1);
      }
      process.exit(1);
    }

    // Check Java version for Firestore emulator (requires JDK 21+ as of firebase-tools 15+)
    try {
      const jv = spawnSync('java', ['-version'], { stdio: 'pipe', shell: false });
      const verOut = (jv.stderr || jv.stdout || {}).toString();
      const m = verOut.match(/version\s+"(\d+)(?:\.([\d.]+))?/);
      if (m) {
        const major = parseInt(m[1], 10);
        if (isNaN(major) || major < 21) {
          console.error('[run-emulator-or-jest] Detected Java major version:', m[1]);
          console.error('firebase emulators require JDK 21 or newer. Please install Temurin/OpenJDK 21+ to run the Firestore emulator.');
          console.error('As a temporary measure, set ALLOW_FALLBACK_NO_EMULATOR=1 to run Jest without the emulator (some tests will fail).');
          if (process.env.ALLOW_FALLBACK_NO_EMULATOR === '1' || process.env.ALLOW_FALLBACK_NO_EMULATOR === 'true') {
            console.warn('[run-emulator-or-jest] ALLOW_FALLBACK_NO_EMULATOR set — running Jest directly (skipping emulator).');
            const fallback = runJestDirect();
            process.exit(fallback || 1);
          }
          process.exit(1);
        }
      }
    } catch (e) {
      // If java check fails, surface a helpful message but continue to emulator attempt which may fail similarly
      console.warn('[run-emulator-or-jest] Could not determine Java version:', e && e.message);
    }

    // First try emulators:exec path — it's the simplest and isolates env to the child
    const execCode = (function(){ try { return tryRunFirebaseExec(); } catch (e) { console.warn('[run-emulator-or-jest] tryRunFirebaseExec threw:', e && e.message); return 1; } })();
    if (execCode === 0) {
      process.exit(0);
    }

    console.warn('[run-emulator-or-jest] emulators:exec returned non-zero exit code:', execCode, ' — trying background start path');

    // Background-start approach: start emulator, wait for ready, set FIRESTORE_EMULATOR_HOST, run jest, then stop emulator
    let emulatorChild;
    try {
      const { child, host, locator } = await startEmulatorBackground({ timeoutMs: 60_000 });
      emulatorChild = child;
      // Ensure the test envs see the host and locator
      const [hostName, hostPort] = host.split(':');
      process.env.FIRESTORE_EMULATOR_HOST = host;
      process.env.FIRESTORE_EMULATOR_HOST_NAME = hostName;
      process.env.FIRESTORE_EMULATOR_PORT = hostPort;
      if (locator) {
        // Locator is a JSON file written by the emulator hub; read it to discover hub host/port
        try {
          const fs = require('fs');
          const contents = fs.readFileSync(locator, 'utf8');
          const j = JSON.parse(contents);
          const hub = j && j.emulators && j.emulators.hub;
          if (hub && hub.host && hub.port) {
            const hubStr = `${hub.host}:${hub.port}`;
            process.env.FIREBASE_EMULATOR_HUB = hubStr;
            console.log('[run-emulator-or-jest] Exported FIREBASE_EMULATOR_HUB:', hubStr);
          } else {
            console.warn('[run-emulator-or-jest] Emulator locator file did not contain hub host/port');
          }
        } catch (e) {
          console.warn('[run-emulator-or-jest] Failed to read emulator locator file:', e && e.message);
        }
      }

      // If SKIP_JEST=1 is set, treat this as a smoke-check: emulator started successfully
      if (process.env.SKIP_JEST === '1' || process.env.SKIP_EMULATOR_TEST === '1') {
        console.log('[run-emulator-or-jest] SKIP_JEST set — emulator smoke-check OK, stopping emulator.');
        await stopEmulator(emulatorChild);
        process.exit(0);
      }

      // Run Jest directly — env will be inherited by worker processes
      const jestStatus = runJestDirect({ FIRESTORE_EMULATOR_HOST: host, FIREBASE_EMULATOR_HUB: process.env.FIREBASE_EMULATOR_HUB });
      // Stop emulator and exit with jest code
      await stopEmulator(emulatorChild);
      process.exit(jestStatus || 0);
    } catch (bgErr) {
      console.warn('[run-emulator-or-jest] Background emulator start failed:', bgErr && bgErr.message);
      // Attempt to discover an already-running emulator by scanning the OS temp folder for hub-*.json
      try {
        console.log('[run-emulator-or-jest] Attempting to detect an existing running emulator via hub-*.json in temp dir');
        const fs = require('fs');
        const path = require('path');
        const tmp = require('os').tmpdir();
        const cand = fs.readdirSync(tmp).find(f => /^hub-.*\.json$/i.test(f));
        if (cand) {
          const p = path.join(tmp, cand);
          console.log('[run-emulator-or-jest] Found locator:', p);
          const contents = fs.readFileSync(p, 'utf8');
          const j = JSON.parse(contents);
          const origins = j && j.origins;
          if (Array.isArray(origins) && origins.length) {
            const m = origins[0].match(/https?:\/\/([^:]+):(\d+)/i);
            if (m) {
              const hubStr = `${m[1]}:${m[2]}`;
              process.env.FIREBASE_EMULATOR_HUB = hubStr;
              process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
              console.log('[run-emulator-or-jest] Using detected emulator hub:', hubStr);
              const jestStatus = runJestDirect({ FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, FIREBASE_EMULATOR_HUB: hubStr });
              await stopEmulator(emulatorChild);
              process.exit(jestStatus || 0);
            }
          }
        }
      } catch (e) {
        console.warn('[run-emulator-or-jest] Could not detect existing emulator:', e && e.message);
      }

      if (process.env.ALLOW_FALLBACK_NO_EMULATOR === '1' || process.env.ALLOW_FALLBACK_NO_EMULATOR === 'true') {
        console.warn('[run-emulator-or-jest] ALLOW_FALLBACK_NO_EMULATOR set — running Jest directly (skipping emulator).');
        const fallbackCode = runJestDirect();
        // If emulatorChild exists, try to stop
        await stopEmulator(emulatorChild);
        process.exit(fallbackCode || 1);
      }
      await stopEmulator(emulatorChild);
      process.exit(1);
    }
  } catch (err) {
    console.warn('[run-emulator-or-jest] Unexpected error', err && err.message);
    if (process.env.ALLOW_FALLBACK_NO_EMULATOR === '1' || process.env.ALLOW_FALLBACK_NO_EMULATOR === 'true') {
      const fallbackCode = runJestDirect();
      process.exit(fallbackCode || 1);
    }
    process.exit(1);
  }
})();
