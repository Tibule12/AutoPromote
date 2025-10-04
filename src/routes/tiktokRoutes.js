// Consolidated: This file now simply re-exports the canonical top-level tiktokRoutes.js
// to prevent divergence between two implementations. All logic lives in /tiktokRoutes.js.
// If server.js ever falls back to this path, it will get the same router.
module.exports = require('../../tiktokRoutes');
