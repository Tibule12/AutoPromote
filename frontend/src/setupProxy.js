const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  // Proxy API requests to the backend server
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:5000",
      changeOrigin: true,
      secure: false,
    })
  );

  // Explicitly disable COEP to allow loading cross-origin videos (e.g. from Firebase/Google Storage)
  app.use(function (req, res, next) {
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    next();
  });
};
