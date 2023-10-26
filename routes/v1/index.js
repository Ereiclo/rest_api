const express = require('express');
const router = express.Router();
const routes = require('./routes');

/* GET home page. */
router.use('/v1',routes)

module.exports = router;
