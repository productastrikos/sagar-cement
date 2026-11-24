// Data-side API: connectivity & data health, lab integration, material
// genealogy, and field & vision.

const express = require('express');
const { PLANTS, byId } = require('../domain/plants');
const { INSTRUMENTS, LAB_FOR } = require('../domain/catalog');
const I = require('../kpi/insight');
const CN = require('../sim/connectivity');
const LAB = require('../sim/lab');
const PR = require('../sim/process');
const SC = require('../sim/scenarios');
const { logAudit } = require('../sim/store');
const { round, mean } = require('../sim/util');

const router = express.Router();
const plantOf = (q) => (q.plant && byId[q.plant] ? q.plant : undefined);
const cards = (ids, f) => ids.map((id) => I.card(id, f)).filter(Boolean);

/* ── Connectivity & data health ────────────────────────────────────────── */
router.get('/connectivity', (req, res) => {
  const p = plantOf(req.query);
  const now = Date.now();
  const list = CN.conn.list.filter((c) => !p || c.plant === p).map((c) => ({
    id: c.id, plant: c.plant, plantName: byId[c.plant].name, cls: c.cls, name: c.name, short: c.short, protocol: c.protocol, adapter: c.adapter,
    state: c.state, error: c.error, latencyS: round(c.latencyMs / 1000, 1), completeness: round(c.completeness, 2), rejectRate: round(c.rejectRate, 2),
    uptime: round(c.uptime, 2), lastGoodMin: round((now - c.lastGoodAt) / 60000, 1), recordsToday: c.recordsToday,
  }));
  const gateways = Object.values(CN.conn.gateways).filter((g) => !p || g.plant === p).map((g) => ({
    ...g, plantName: byId[g.plant].name, connectors: CN.conn.list.filter((c) => c.plant === g.plant).length,
    online: CN.conn.list.filter((c) => c.plant === g.plant && c.state === 'online').length, downForS: g.downUntil > now ? Math.round((g.downUntil - now) / 1000) : 0,
  }));
  // Week-1 instrument protocol audit: how each instrument class gets to the edge.
  const audit = Object.values(INSTRUMENTS).map((ins) => ({
    instrument: ins.name, example: ins.example, protocol: ins.protocol, path: ins.adapter,
    tier: ins.adapter.startsWith('Native') ? 'Native OPC UA / Modbus' : ins.adapter.startsWith('Serial') ? 'Serial-to-Ethernet gateway' : 'Validated file drop-zone',
    plants: PLANTS.filter((pl) => LAB_FOR[pl.type].includes(ins.id)).map((pl) => pl.id),
  }));
  res.json({
    cards: cards(['d.completeness', 'd.latency', 'd.freshness', 'd.uptime', 'd.rejectRate', 'd.dupRate', 'd.buffer', 'd.genealogy'], { plant: p }),
    gateways, connectors: list, audit,
    quarantine: CN.conn.quarantine.filter((q) => !p || q.plant === p).slice(0, 40).map((q) => ({ ...q, plantName: byId[q.plant].name })),
    normalised: CN.conn.normalised.slice(0, 6).map((n) => ({ ...n, plantName: byId[n.plant].name })),
    counters: { ...CN.conn.counters, replayed: Object.values(CN.conn.gateways).reduce((s, g) => s + g.replayedTotal, 0), lost: 0 },
    s7: PLANTS.filter((pl) => SC.isActive('S7', pl.id)).map((pl) => pl.id),
  });
});

router.post('/connectivity/simulate', (req, res) => {
  const { action } = req.body || {};
  const plant = byId[req.body?.plant] ? req.body.plant : 'MTP';
  let out = { ok: true };
  if (action === 'wan') { CN.wanOutage(plant, 60); logAudit(req.user, 'Simulated WAN outage (60 s)', `${byId[plant].name} edge gateway`); }
  else if (action === 'malformed') { out.record = CN.malformed(plant); logAudit(req.user, 'Injected malformed XRF row', `${byId[plant].name} · ${out.record.id}`); }
  else if (action === 'dcom') { const gp = byId[plant].type === 'integrated' ? plant : 'GDP'; SC.start('S7', gp); logAudit(req.user, 'Simulated DCOM patch failure', byId[gp].name); }
  else return res.status(400).json({ error: 'Unknown action' });
  res.json(out);
});

router.post('/connectivity/quarantine/:id', (req, res) => {
  const q = CN.resolve(req.params.id, req.body?.action);
  if (!q) return res.status(404).json({ error: 'Record not found' });
  logAudit(req.user, q.status === 'released' ? 'Released quarantined record' : 'Discarded quarantined record', `${q.id} · ${q.reason}`);
  res.json({ ok: true, record: q });
});

/* ── Lab integration ───────────────────────────────────────────────────── */
router.get('/lab', (req, res) => {
  const p = plantOf(req.query);
  const samples = LAB.lab.samples.filter((s) => !p || s.plant === p);
  const instruments = Object.values(INSTRUMENTS).map((ins) => {
    const own = samples.filter((s) => s.instrument === ins.id);
    const conns = CN.conn.list.filter((c) => c.key === ins.id && (!p || c.plant === p));
    return {
      ...ins, latest: own[0] || null, count: own.length,
      state: conns.some((c) => c.state === 'offline') ? 'offline' : conns.some((c) => c.state !== 'online') ? 'degraded' : conns.length ? 'online' : 'n/a',
      plants: conns.map((c) => c.plant), review: own.filter((s) => s.qc !== 'VALID').length,
      crm: round(mean(Object.entries(LAB.lab.crm).filter(([k]) => k.endsWith(`-${ins.id}`) && (!p || k.startsWith(p))).map(([, v]) => v)), 0),
    };
  });
  // Cross-check: cross-belt predicted raw-meal CaO vs lab XRF raw-meal CaO (S1 evidence).
  const cross = PLANTS.filter((pl) => pl.type === 'integrated' && (!p || pl.id === p)).map((pl) => {
    const cba = LAB.lab.samples.filter((s) => s.plant === pl.id && s.instrument === 'cba').slice(0, 3);
    const xrf = LAB.lab.samples.filter((s) => s.plant === pl.id && s.instrument === 'xrf' && s.stage === 'Raw meal').slice(0, 3);
    const a = cba.length ? mean(cba.map((s) => s.params['Predicted raw-meal CaO'])) : null;
    const b = xrf.length ? mean(xrf.map((s) => s.params.CaO)) : null;
    const resid = a != null && b != null ? round(a - b, 2) : null;
    return { plant: pl.id, plantName: pl.name, crossBelt: a != null ? round(a, 2) : null, xrf: b != null ? round(b, 2) : null, residual: resid, flag: resid != null && Math.abs(resid) > 0.4 };
  });
  res.json({
    cards: cards(['l.samples', 'l.tat', 'l.adherence', 'l.crmDrift', 'l.cubeCv', 'q.offSpec'], { plant: p }),
    instruments, samples: samples.slice(0, 120), cross,
    crm: Object.entries(LAB.lab.crm).filter(([k]) => !p || k.startsWith(p)).map(([k, v]) => ({ key: k, plant: k.split('-')[0], instrument: INSTRUMENTS[k.split('-')[1]].short, value: round(v, 0) })),
  });
});

/* ── Material genealogy ────────────────────────────────────────────────── */
router.get('/genealogy', (req, res) => {
  const p = plantOf(req.query) || 'MTP';
  const batches = LAB.lab.batches.filter((b) => b.plant === p && b.day <= 40).sort((a, b) => a.day - b.day).slice(0, 40).map(LAB.batchView)
    .map((b) => ({ id: b.id, grade: b.grade, day: b.day, date: b.date, s28: b.s28, p28: b.p28, bisPass: b.bisPass, atRisk: b.atRisk, tonnes: b.tonnes, mill: b.mill }));
  const sel = req.query.batch && LAB.lab.batches.some((b) => b.id === req.query.batch) ? req.query.batch : (batches.find((b) => !b.bisPass) || batches[0])?.id;
  res.json({
    plant: p, cards: cards(['d.genealogy', 'g.lots', 'g.residence', 'q.clinkerFactor'], { plant: p }), batches, selected: sel,
    lineage: sel ? LAB.genealogy(sel) : null,
    model: [
      { table: 'dim_plant_asset', grain: 'ISA-95 asset tree: enterprise → plant → section → line → asset / instrument', keys: 'asset_id · plant_id · parent_asset_id' },
      { table: 'dim_material_lot', grain: 'Lots from quarry pile to cement silo and rail rake', keys: 'lot_id · plant_id · silo_or_pile_id' },
      { table: 'bridge_material_genealogy', grain: 'Mass-weighted parent → child lineage across silos and rakes', keys: '(parent_lot_id, child_lot_id) · weight_fraction · residence_lag_min' },
      { table: 'fact_process_telemetry', grain: '1-minute historian roll-ups from DCS, PLC, cross-belt, IEC 61850', keys: '(asset_id, tag_code, ts_utc) · lot_id' },
      { table: 'fact_lab_sample_header', grain: 'Chain of custody for every physical or robotic sample', keys: 'sample_uuid · barcode_id · sampled / received / analysed / aligned_process ts' },
      { table: 'fact_lab_measurement', grain: 'Tidy results across XRF, XRD, PSD, calorimeter, microscopy, CTM', keys: '(sample_uuid, parameter_code, replicate_no) · qc_flag · basis' },
      { table: 'fact_camera_and_health', grain: 'Vision features plus edge-gateway and buffer heartbeats', keys: '(asset_id, metric_code, ts_utc) · connector_state · buffer_depth' },
    ],
  });
});

/* ── Field & vision ────────────────────────────────────────────────────── */
router.get('/field', (req, res) => {
  const p = plantOf(req.query) || 'MTP';
  const ps = PR.state[p];
  const plant = byId[p];
  const lineId = ps.lines.some((l) => l.id === req.query.line) ? req.query.line : ps.lines[ps.lines.length - 1]?.id;
  const L = ps.lines.find((l) => l.id === lineId);
  const tagView = (t) => ({ code: t.code, label: t.label, unit: t.unit, value: round(t.v, t.unit === '%' && t.v < 1 ? 3 : Math.abs(t.v) < 10 ? 2 : Math.abs(t.v) < 100 ? 1 : 0), lo: t.nlo, hi: t.nhi, status: t.v < t.nlo || t.v > t.nhi ? 'warning' : 'normal', section: t.section });
  const sections = {};
  if (L) L.tags.forEach((t) => { (sections[t.section] = sections[t.section] || []).push(tagView(t)); });
  ps.mills.forEach((m) => { sections[`${m.name} · ${m.grade}`] = m.tags.map((t) => tagView({ ...t, section: m.name })); });
  if (ps.gu) sections['Slag & SCM'] = ps.gu.map(tagView);
  sections.Packing = ps.pack.map(tagView);
  // Kiln shell profile along the kiln length, with the scanner's hottest zone.
  const shell = L ? Array.from({ length: 16 }, (_, i) => {
    const pos = i * 4;
    const base = 250 + 90 * Math.exp(-(((pos - 22) / 12) ** 2)) + (pos > 50 ? -40 : 0);
    const hot = Math.max(0, L.cams.shell.v) * Math.exp(-(((pos - 26) / 4) ** 2));
    return { pos, baseline: Math.round(base), temp: Math.round(base + hot + Math.sin(i * 1.7) * 4) };
  }) : [];
  res.json({
    plant: p, plantName: plant.name, type: plant.type, lines: ps.lines.map((l) => ({ id: l.id, name: l.name, tpd: l.tpd, stages: l.stages })), line: lineId,
    cards: plant.type === 'integrated' ? cards(['p.clinker', 'p.shell', 'p.falseAir', 'p.coolerEff', 'p.coalCo', 'p.redRiver'], { plant: p }) : cards(['o.output', 'e.grindPower', 'q.gypsumDehyd', 'd.completeness'], { plant: p }),
    sections: Object.entries(sections).map(([name, tags]) => ({ name, tags })),
    cameras: L ? Object.values(L.cams).map((c) => ({ key: c.key, name: c.name, feature: c.feature, unit: c.unit, value: round(c.v, c.unit === 'index' ? 2 : 1), normalHi: c.normalHi, critHi: c.critHi, status: c.v > c.critHi ? 'critical' : c.v > c.normalHi ? 'warning' : 'normal' })) : [],
    shell,
    softSensor: L ? { est: L.fs.est.slice(-90).map((x) => ({ t: x.t, v: x.v })), lab: L.fs.lab, paused: L.paused } : null,
  });
});

module.exports = router;
