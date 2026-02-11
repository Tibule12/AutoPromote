const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  // Add headers for SharedArrayBuffer support (required for ffmpeg.wasm)
  app.use(function (req, res, next) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });
};
