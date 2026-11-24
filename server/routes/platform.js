// Platform API: S!aP architecture, connector library, models in use, the
// requirement-coverage map (meeting points → screens) and plant templates.

const express = require('express');
const { PLANTS, byId } = require('../domain/plants');
const { CONNECTORS, INSTRUMENTS, connectorsFor } = require('../domain/catalog');
const { KPIS } = require('../kpi/registry');
const { logAudit } = require('../sim/store');

const router = express.Router();

const PROTOCOL_FAMILY = (p) => (p.includes('IEC 61850') ? 'IEC 61850' : p.includes('OPC') ? 'OPC UA / DA' : p.includes('Modbus') ? 'Modbus TCP / RTU'
  : p.includes('RS-232') || p.includes('FTP') ? 'Serial & FTP' : p.includes('RTSP') ? 'RTSP + edge AI' : p.includes('OData') ? 'OData / REST' : 'File drop (CSV / XML)');

router.get('/platform', (req, res) => {
  const families = {};
  CONNECTORS.forEach((c) => { const f = PROTOCOL_FAMILY(c.protocol); families[f] = (families[f] || 0) + 1; });
  res.json({
    layers: [
      { key: 'connect', name: 'Connect', text: 'Edge gateways at each plant read lab instruments, DCS, field meters and cameras — read-only, inside the plant network.' },
      { key: 'collect', name: 'Collect', text: 'Validation, unit normalisation, barcode rules and a dead-letter queue. Disk-backed store-and-forward survives WAN loss.' },
      { key: 'historize', name: 'Historize', text: 'Time-series and lab facts in an ISA-95 model with mass-weighted material genealogy.' },
      { key: 'analyze', name: 'Analyze', text: 'Residence-time alignment, soft sensors, strength forecasting, MD prediction and merit-order optimisation.' },
      { key: 'visualize', name: 'Visualize', text: 'Fleet, plant and section views; every KPI opens its own trend, forecast and breakdown.' },
      { key: 'advise', name: 'Advise', text: 'Explainable advisories with evidence and actions. A person decides; nothing writes back to the DCS.' },
    ],
    families: Object.entries(families).map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count),
    connectorsInPoc: CONNECTORS.length,
    instruments: Object.values(INSTRUMENTS).map((i) => ({ name: i.name, protocol: i.protocol, adapter: i.adapter })),
    models: [
      { name: 'Residence-time aligner', kind: 'Plug-flow + CSTR silo model', use: 'Joins lab results to the process window that made the material', page: '/quality' },
      { name: 'Free-lime soft sensor v1.3', kind: 'Regression on kiln tags, lab-calibrated', use: '1-minute f-CaO between 1–2 h lab results', page: '/prediction' },
      { name: '28-day strength forecaster v2.0', kind: 'Gradient boosting on chemistry, PSD, early strength', use: 'Forecasts 28-day strength on grinding day', page: '/prediction' },
      { name: 'XRF drift detector', kind: 'Cross-belt vs XRF residual + CRM control chart', use: 'Catches calibration drift before it reaches the kiln', page: '/lab' },
      { name: 'Cooler vision model v0.9', kind: 'Edge AI on thermal camera features', use: 'Red-river risk on the grate', page: '/field' },
      { name: '15-min MD predictor', kind: 'Sliding-window projection', use: 'Forecasts contract-demand breaches with ₹ exposure', page: '/power' },
      { name: 'Merit-order optimiser', kind: 'Rule-based dispatch on state ToD tariffs', use: 'Shifts grinding out of peak slots', page: '/dispatch' },
      { name: 'Data-health monitor', kind: 'Completeness, freshness, rejects, buffers', use: 'Pauses AI models when inputs fail', page: '/connectivity' },
    ],
    coverage: [
      { point: 'Stabilise data receipt and handling (immediate focus)', screens: ['Connectivity & data health'], route: '/connectivity', how: 'Edge buffering, quarantine, replay, live data-health KPIs' },
      { point: 'Integrate XRF, XRD, particle size, cross-belt, calorimeter, microscope and strength testers', screens: ['Lab integration'], route: '/lab', how: 'All 7 instrument classes with protocol path, chain of custody and calibration drift' },
      { point: 'Connect field instruments, sensors and cameras with plant automation', screens: ['Field & vision'], route: '/field', how: 'Section-wise DCS tags, shell scanner, flame, cooler and belt cameras' },
      { point: 'Bring raw material, process, operational and field data together', screens: ['Material genealogy'], route: '/genealogy', how: 'One lineage from limestone pile to dispatched cement, with residence times' },
      { point: 'Correlate clinker parameters with cement quality and performance', screens: ['Quality workbench'], route: '/quality', how: 'Aligned vs naive correlation, driver matrix, residence-time chain' },
      { point: 'Predict process behaviour and optimise against product specifications', screens: ['Predict & optimise'], route: '/prediction', how: 'Soft sensor, 28-day forecaster, BIS checks, giveaway and what-if' },
      { point: 'Energy management and process efficiency', screens: ['Energy scorecard', 'Process efficiency'], route: '/energy', how: 'SEC/SHC vs CII, heat-loss waterfall, false air and over-grinding' },
      { point: 'Power automation and renewable energy', screens: ['Power automation', 'ToD & dispatch'], route: '/power', how: 'SLD, 15-min MD predictor, PF/THD, 4-state ToD dispatch' },
      { point: 'Corporate demo: architecture, connectivity, ingestion, analytics, visualisation', screens: ['Platform & architecture', 'Fleet overview'], route: '/platform', how: 'This page plus the 6-plant overview' },
    ],
    deployment: ['On-premise edge per plant', 'Hybrid (edge + Astrikos cloud)', 'Fully on-premise data centre'],
    guardrails: ['Read-only at the OT boundary — no writes to DCS, PLCs or relays', 'Human-in-the-loop: every advisory waits for a person', 'Runs above existing DCS, QCX/RoboLab and SAP — nothing is replaced'],
    kpis: KPIS.length,
    templates: [
      { key: 'integrated', name: 'Integrated plant', text: 'Kiln line(s), cement mills, 7 lab instrument classes, DCS, meters, cameras, SAP' },
      { key: 'grinding', name: 'Grinding unit', text: 'Cement mills, slag/fly-ash QC, 4 lab instrument classes, DCS, meters, SAP' },
    ],
    plants: PLANTS.map((p) => ({ id: p.id, name: p.name, type: p.type, connectors: CONNECTORS.filter((c) => c.plant === p.id).length })),
  });
});

router.post('/platform/template', (req, res) => {
  const { template = 'integrated', name = 'New plant' } = req.body || {};
  const proto = template === 'grinding' ? byId.BYV : byId.MTP;
  const id = String(name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'NEW';
  const conns = connectorsFor({ ...proto, id }).map((c) => ({ id: c.id, name: c.name, protocol: c.protocol, adapter: c.adapter }));
  const kpis = KPIS.filter((k) => !k.plants && (k.scope === 'all' || k.scope === template)).map((k) => k.label);
  logAudit(req.user, 'Cloned plant template', `${name} (${template})`);
  res.json({
    name, id, template, connectors: conns, kpis, screens: 13,
    steps: ['Week 1 · instrument protocol audit on site', 'Week 1–2 · edge gateway and read-only DCS/OPC UA link', 'Week 2–3 · lab connectors and barcode rules', 'Week 3–4 · KPI calibration against plant history'],
  });
});

module.exports = router;
