const express = require("express");
const router = express.Router();

// Stub for promotion routes
// GET /promotions/active
router.get("/active", (req, res) => {
  res.status(501).json({ error: "Promotions not implemented yet" });
});

module.exports = router;
