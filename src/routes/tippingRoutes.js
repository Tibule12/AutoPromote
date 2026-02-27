const express = require("express");
const router = express.Router();

// Stub for tipping routes
// POST /tips/send
router.post("/send", (req, res) => {
  res.status(501).json({ error: "Tipping not implemented yet" });
});

module.exports = router;
