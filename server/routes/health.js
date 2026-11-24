const express = require('express');
const ENGINE = require('../sim/engine');

const router = express.Router();
router.get('/', (req, res) => res.json({ status: 'ok', service: 'clinkeriq-api', uptimeS: Math.round(process.uptime()), sim: ENGINE.status() }));

module.exports = router;
