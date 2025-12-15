const express = require("express");
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
// Stripe integration removed

const router = express.Router();

// Create a checkout session for a plan
// Stripe subscribe endpoint removed

// Raw body middleware for webhook verification
// Stripe webhook endpoint removed

module.exports = router;
