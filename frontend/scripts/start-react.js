const fs = require("fs");
const path = require("path");

// Large workspaces can exhaust Linux inotify limits before webpack starts.
// Polling avoids ENOSPC watcher failures and can still be disabled explicitly.
process.env.CHOKIDAR_USEPOLLING ??= "true";
process.env.CHOKIDAR_INTERVAL ??= "1000";
process.env.WATCHPACK_POLLING ??= "true";
process.env.WATCHPACK_POLLING_INTERVAL ??= "1000";

function patchWebpackDevServerConfig() {
  const configPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-scripts",
    "config",
    "webpackDevServer.config.js"
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing react-scripts dev server config at ${configPath}`);
  }

  const source = fs.readFileSync(configPath, "utf8");
  let nextSource = source;

  const legacyPattern =
    /    \/\/ `proxy` is run between `before` and `after` `webpack-dev-server` hooks[\s\S]*?    },\n  };\n};/;

  const modernBlock = `    // \`proxy\` is run between dev-server middleware hooks
    proxy,
    setupMiddlewares(middlewares, devServer) {
      if (!devServer) {
        throw new Error("webpack-dev-server is not defined");
      }

      // Keep \`evalSourceMapMiddleware\`
      // middlewares before \`redirectServedPath\` otherwise will not have any effect
      // This lets us fetch source contents from webpack for the error overlay
      devServer.app.use(evalSourceMapMiddleware(devServer));

      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons
        require(paths.proxySetup)(devServer.app);
      }

      // Redirect to \`PUBLIC_URL\` or \`homepage\` from \`package.json\` if url not match
      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));

      // This service worker file is effectively a 'no-op' that will reset any
      // previous service worker registered for the same host:port combination.
      // We do this in development to avoid hitting the production cache if
      // it used the same host and port.
      // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
      devServer.app.use(noopServiceWorkerMiddleware(paths.publicUrlOrPath));

      return middlewares;
    },
  };
};`;

  if (!nextSource.includes("setupMiddlewares(middlewares, devServer)")) {
    if (!legacyPattern.test(nextSource)) {
      throw new Error(
        "Could not find the legacy webpack-dev-server middleware block to patch automatically."
      );
    }

    nextSource = nextSource.replace(legacyPattern, modernBlock);
  }

  if (nextSource.includes("https: getHttpsConfig(),")) {
    nextSource = nextSource.replace(
      "    https: getHttpsConfig(),",
      `    server: (() => {
      const httpsConfig = getHttpsConfig();
      if (!httpsConfig) return "http";
      if (httpsConfig === true) return "https";
      return { type: "https", options: httpsConfig };
    })(),`
    );
  }

  if (nextSource !== source) {
    fs.writeFileSync(configPath, nextSource);
    console.log("[start-react] Patched react-scripts dev server config for webpack-dev-server v5.");
  }
}

function patchWebpackDevServerShutdown() {
  const WebpackDevServer = require("webpack-dev-server");
  if (
    typeof WebpackDevServer?.prototype?.close !== "function" &&
    typeof WebpackDevServer?.prototype?.stopCallback === "function"
  ) {
    WebpackDevServer.prototype.close = function close(callback) {
      return this.stopCallback(callback);
    };
  }
}

patchWebpackDevServerConfig();
patchWebpackDevServerShutdown();
require("react-scripts/scripts/start");
