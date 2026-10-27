// Separate opt-in Google sample page. Never imports Firebase or a wallet.
const express = require("express");
const path = require("path");
const { isHostedRuntime } = require("../src/utils/authAuthority");
function createGoogleTestApp() {
  if (process.env.GOOGLE_REWARDED_TEST_ONLY !== "true" || isHostedRuntime())
    throw new Error("Explicit local Google test inventory only");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (process.env.GOOGLE_REWARDED_TEST_ONLY !== "true" || isHostedRuntime())
      return res.sendStatus(503);
    res.set("Cache-Control", "no-store");
    // A narrow, separate test origin; production/editor headers are untouched.
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-src https:; img-src 'self' https: data:; media-src https: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    );
    if (req.path.startsWith("/api/")) return res.sendStatus(404);
    next();
  });
  const directory = path.resolve(__dirname, "../sandbox/credits");
  app.get("/", (_req, res) => res.sendFile(path.join(directory, "google-test.html")));
  for (const name of ["google-test-controller.js", "google-test-page.js", "style.css"])
    app.get(`/${name}`, (_req, res) => res.sendFile(path.join(directory, name)));
  return app;
}
if (require.main === module) {
  const port = Number(process.env.GOOGLE_REWARDED_TEST_PORT || 8191);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port");
  createGoogleTestApp().listen(port, "127.0.0.1", () =>
    console.log(`Google sample only: http://127.0.0.1:${port}`)
  );
}
module.exports = { createGoogleTestApp };
