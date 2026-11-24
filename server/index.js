require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const ENGINE = require('./sim/engine');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
for (const r of ['core', 'data', 'quality', 'energy', 'platform', 'sia']) app.use('/api', requireAuth, require(`./routes/${r}`));

// In single-process deployments the API also serves the built React app.
const CLIENT_BUILD_DIR = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(CLIENT_BUILD_DIR)) {
  app.use(express.static(CLIENT_BUILD_DIR));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment.' });
});

ENGINE.start();
app.listen(PORT, () => console.log(`S!aP ClinkerIQ API listening on http://localhost:${PORT}`));
