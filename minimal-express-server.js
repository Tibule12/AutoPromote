const express = require("express");

// Create a simple Express app
const app = express();
const PORT = 5000;

// Add a simple health check endpoint
app.get("/health", (req, res) => {
  console.log("Health check request received");
  res.json({
    status: "OK",
    message: "Minimal Express server is running",
    timestamp: new Date().toISOString(),
  });
});

// Add a catch-all route
app.get("*", (req, res) => {
  console.log(`Request received for ${req.url}`);
  res.json({
    message: "Hello from minimal Express server",
    path: req.url,
    timestamp: new Date().toISOString(),
  });
});

// Start the server
const server = app
  .listen(PORT, () => {
    console.log(`Minimal Express server running on port ${PORT}`);
    console.log(`Test it by navigating to http://localhost:${PORT}/health`);
  })
  .on("error", err => {
    console.error("Server error:", err);
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Try a different port.`);
    }
  });
