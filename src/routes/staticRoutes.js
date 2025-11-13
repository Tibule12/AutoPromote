const express = require('express');
const router = express.Router();

router.get('/terms-of-service', (req, res) => {
    res.status(200).send('Terms of Service');
});

router.get('/privacy-policy', (req, res) => {
    res.status(200).send('Privacy Policy');
});

module.exports = router;
