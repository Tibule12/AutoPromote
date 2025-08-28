const express = require('express');
const router = express.Router();
const { createContent, getAllContent } = require('../controllers/contentController');

router.post('/', createContent);
router.get('/', getAllContent);

module.exports = router;
