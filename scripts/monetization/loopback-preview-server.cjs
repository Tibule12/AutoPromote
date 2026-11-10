const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { rateLimit } = require("express-rate-limit");

// Historical review tools may forward only to their explicitly configured API.
// A URL in an incoming proxy request never chooses a host or port.
function createLoopbackPreviewServer({ appOrigin, build, requestLimit = 6000 }) {
  const api = new URL(appOrigin);
  if (
    api.protocol !== "http:" ||
    api.hostname !== "127.0.0.1" ||
    !api.port ||
    api.username ||
    api.password ||
    api.pathname !== "/" ||
    api.search ||
    api.hash ||
    !Number.isInteger(requestLimit) ||
    requestLimit < 1 ||
    requestLimit > 6000
  ) {
    throw new Error("Use one explicit loopback API and a bounded request limit.");
  }
  const directory = path.resolve(build);
  if (!fs.statSync(path.join(directory, "index.html")).isFile()) {
    throw new Error("A complete local review build is required.");
  }
  const app = express();
  app.use(
    rateLimit({ windowMs: 60000, max: requestLimit, standardHeaders: true, legacyHeaders: false })
  );
  const server = http.createServer(app);
  app.use((req, res, next) => {
    const address = req.socket.remoteAddress || "";
    if (!address.startsWith("127.") && address !== "::1" && !address.startsWith("::ffff:127."))
      return res.sendStatus(403);
    const ownOrigin = `http://127.0.0.1:${server.address().port}`;
    let target;
    try {
      target = new URL(req.originalUrl, ownOrigin);
    } catch {
      return res.sendStatus(400);
    }
    if (target.origin !== ownOrigin && target.origin !== api.origin) return res.sendStatus(403);
    if (target.username || target.password || target.hash) return res.sendStatus(403);
    if (!target.pathname.startsWith("/api/")) {
      req.url = target.pathname + target.search;
      return next();
    }
    const headers = { ...req.headers, host: api.host, connection: "close" };
    delete headers["proxy-authorization"];
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(api.port),
        path: target.pathname + target.search,
        method: req.method,
        headers,
      },
      response => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      }
    );
    upstream.setTimeout(120000, () => upstream.destroy(new Error("Local API deadline exceeded.")));
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });
  app.use(express.static(directory, { dotfiles: "deny" }));
  app.use((_req, res) => res.sendFile(path.join(directory, "index.html")));
  server.on("connect", (_req, socket) => socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"));
  return server;
}

module.exports = { createLoopbackPreviewServer };
