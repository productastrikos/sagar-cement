// Shell-level API: live sync, notifications, KPI cards and drawers, advisories,
// audit, search, scenarios (demo director) and the fleet overview.

const express = require('express');
const { PLANTS, byId, HQ, FLEET } = require('../domain/plants');
const I = require('../kpi/insight');
const { byKpi } = require('../kpi/registry');
const ADV = require('../sim/advisory');
const SC = require('../sim/scenarios');
const LAB = require('../sim/lab');
const CN = require('../sim/connectivity');
const PW = require('../sim/power');
const ENGINE = require('../sim/engine');
const { audit, notifications, logAudit } = require('../sim/store');

const router = express.Router();
const plantOf = (q) => (q.plant && byId[q.plant] ? q.plant : undefined);
const cards = (ids, f) => ids.map((id) => I.card(id, f)).filter(Boolean);

/* ── Live sync (polled by the shell) ───────────────────────────────────── */
router.get('/live', (req, res) => {
  const list = ADV.list();
  const open = list.filter((a) => a.status === 'open');
  const byDomain = (d) => open.filter((a) => a.domain === d).length;
  res.json({
    serverTime: new Date().toISOString(), sync: ENGINE.status(),
    advisory: {
      updatedAt: new Date().toISOString(),
      counts: { open: open.length, critical: open.filter((a) => a.severity === 'critical').length, high: open.filter((a) => a.severity === 'high').length },
      summary: [
        `${open.length} open advisories across ${new Set(open.map((a) => a.plant)).size} plants — ${byDomain('quality')} quality, ${byDomain('process')} process, ${byDomain('energy')} energy, ${byDomain('data')} data.`,
        open[0] ? `Deal with first: ${open[0].short} at ${open[0].plantName} (${open[0].severity}, ${open[0].confidence}% confidence).` : 'Nothing needs attention right now.',
        `₹${Math.round(open.reduce((s, a) => s + (a.impactLakh || 0), 0))} lakh a month identified in open items (estimates, before verification).`,
      ],
      top: open.slice(0, 5),
      open: open.map((a) => ({ id: a.id, key: a.key, title: a.title, short: a.short, plant: a.plant, plantName: a.plantName, severity: a.severity, domain: a.domain, engine: a.engine, route: a.route })),
      ops: [
        ...Object.values(CN.conn.gateways).filter((g) => g.uplink !== 'up').map((g) => ({ tone: 'warning', text: `${byId[g.plant].name} edge gateway ${g.uplink} — ${g.buffer} records buffered, 0 lost.`, route: '/connectivity' })),
        ...(CN.conn.quarantine.filter((q) => q.status === 'quarantined').length ? [{ tone: 'info', text: `${CN.conn.quarantine.filter((q) => q.status === 'quarantined').length} records held in the dead-letter queue for review.`, route: '/connectivity' }] : []),
        ...PLANTS.filter((p) => SC.isActive('S7', p.id)).map((p) => ({ tone: 'danger', text: `Free-lime soft sensor paused at ${p.name} until data health recovers.`, route: '/connectivity' })),
      ].slice(0, 3),
    },
    notifications: notifications.slice(0, 40),
    unread: notifications.filter((n) => !n.read).length,
  });
});

router.post('/notifications/read', (req, res) => {
  const { id } = req.body || {};
  notifications.forEach((n) => { if (!id || n.id === id) n.read = true; });
  res.json({ ok: true });
});

/* ── KPIs ──────────────────────────────────────────────────────────────── */
router.get('/kpis', (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean);
  res.json({ cards: cards(ids, { plant: plantOf(req.query) }) });
});

router.get('/kpi/:id', (req, res) => {
  const { tf, dim, ...rest } = req.query;
  const filters = Object.fromEntries(Object.entries(rest).filter(([, v]) => v && v !== 'All'));
  const data = I.insight(req.params.id, { tf, dim, filters });
  if (!data) return res.status(404).json({ error: `Unknown KPI ${req.params.id}` });
  res.json(data);
});

router.post('/kpi/:id/apply', (req, res) => {
  const { recId, text } = req.body || {};
  if (!recId) return res.status(400).json({ error: 'recId is required' });
  I.applyRec(recId);
  logAudit(req.user, 'Applied AI recommendation', `${byKpi[req.params.id]?.label || req.params.id} · ${text || recId}`);
  res.json({ ok: true });
});

/* ── Advisories ────────────────────────────────────────────────────────── */
router.get('/advisories', (req, res) => {
  const p = plantOf(req.query);
  const list = ADV.list().filter((a) => (!p || a.plant === p) && (!req.query.domain || a.domain === req.query.domain));
  const open = list.filter((a) => a.status === 'open');
  const stage = (key, label) => ({ key, label, n: open.filter((a) => a.domain === key).length });
  res.json({
    cards: cards(['a.open', 'a.critical', 'a.applied', 'a.impact', 'a.confidence', 'a.paused'], { plant: p }),
    list, stages: [stage('quality', 'Quality'), stage('process', 'Process'), stage('energy', 'Energy'), stage('data', 'Data')],
    bySeverity: ['critical', 'high', 'medium', 'low'].map((s) => ({ key: s, n: open.filter((a) => a.severity === s).length })),
  });
});

router.post('/advisories/:id/apply', (req, res) => {
  const out = ADV.apply(req.params.id, Number(req.body?.idx ?? 0), req.user);
  if (!out) return res.status(404).json({ error: 'Advisory or action not found' });
  res.json(out);
});

router.post('/advisories/:id/dismiss', (req, res) => {
  ADV.dismiss(req.params.id, req.user);
  res.json({ ok: true });
});

/* ── Audit, exports ────────────────────────────────────────────────────── */
router.get('/audit', (req, res) => res.json({ audit: audit.slice(0, 200) }));
router.post('/audit/export', (req, res) => {
  const { title, format, filters, filename } = req.body || {};
  logAudit(req.user, `Downloaded ${format || 'document'}`, `${title || 'Document'}${filename ? ` · ${filename}` : ''}`, { filters });
  res.json({ ok: true });
});

/* ── Search ────────────────────────────────────────────────────────────── */
const PAGES = [
  ['Fleet overview', '/'], ['Connectivity & data health', '/connectivity'], ['Lab integration', '/lab'], ['Material genealogy', '/genealogy'],
  ['Quality workbench', '/quality'], ['Predict & optimise', '/prediction'], ['Field & vision', '/field'], ['Energy scorecard', '/energy'],
  ['Power automation', '/power'], ['ToD & dispatch', '/dispatch'], ['Process efficiency', '/efficiency'], ['AI advisory', '/advisory'], ['Platform & architecture', '/platform'],
];
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ groups: [] });
  const hit = (s) => String(s).toLowerCase().includes(q);
  const groups = [
    { type: 'Plants', items: PLANTS.filter((p) => hit(p.name) || hit(p.id) || hit(p.stateName)).map((p) => ({ label: p.name, desc: `${p.type === 'integrated' ? 'Integrated plant' : 'Grinding unit'} · ${p.stateName}`, href: `/?plant=${p.id}` })) },
    { type: 'Pages', items: PAGES.filter(([l]) => hit(l)).map(([l, h]) => ({ label: l, desc: 'Page', href: h })) },
    { type: 'Connectors', items: CN.conn.list.filter((c) => hit(c.id) || hit(c.name) || hit(c.protocol)).slice(0, 6).map((c) => ({ label: c.id, desc: `${c.name} · ${c.protocol} · ${c.state}`, href: `/connectivity?plant=${c.plant}` })) },
    { type: 'Cement batches', items: LAB.lab.batches.filter((b) => b.day < 60 && hit(b.id)).slice(0, 6).map((b) => ({ label: b.id, desc: `${b.grade} · ${byId[b.plant].name}`, href: `/genealogy?plant=${b.plant}&batch=${b.id}` })) },
    { type: 'Lab samples', items: LAB.lab.samples.filter((s) => hit(s.barcode)).slice(0, 6).map((s) => ({ label: s.barcode, desc: `${s.instrumentName} · ${s.stage}`, href: `/lab?plant=${s.plant}` })) },
    { type: 'Advisories', items: ADV.list().filter((a) => hit(a.title) || hit(a.plantName)).slice(0, 6).map((a) => ({ label: a.short || a.title, desc: `${a.plantName} · ${a.severity}`, href: '/advisory' })) },
    { type: 'KPIs', items: Object.values(byKpi).filter((k) => hit(k.label)).slice(0, 6).map((k) => ({ label: k.label, desc: 'KPI', href: k.route })) },
  ].filter((g) => g.items.length);
  res.json({ groups });
});

/* ── Scenarios (demo director + scenario library) ──────────────────────── */
router.get('/scenarios', (req, res) => {
  res.json({
    library: Object.entries(SC.DEFS).map(([key, d]) => ({
      key, title: d.title, short: d.short, domain: d.domain, plant: d.plant, plantName: byId[d.plant].name, plantType: d.plantType, severity: d.severity,
      cause: d.cause, route: d.route, active: SC.active.filter((a) => a.key === key).map((a) => ({ plant: a.plant, level: Math.round(a.level * 100), applied: a.applied.size, of: d.actions.length })),
    })),
  });
});
router.post('/scenarios/:key/start', (req, res) => {
  const d = SC.DEFS[req.params.key];
  if (!d) return res.status(404).json({ error: 'Unknown scenario' });
  const plant = req.body?.plant && byId[req.body.plant] ? req.body.plant : d.plant;
  const s = SC.start(req.params.key, plant);
  logAudit(req.user, 'Started demo scenario', `${d.short} at ${byId[plant].name}`);
  res.json({ ok: true, plant: s.plant });
});
router.post('/scenarios/:key/stop', (req, res) => {
  SC.stop(req.params.key, req.body?.plant);
  logAudit(req.user, 'Stopped demo scenario', req.params.key);
  res.json({ ok: true });
});
router.post('/director/reset', (req, res) => {
  SC.active.splice(0, SC.active.length);
  Object.values(CN.conn.gateways).forEach((g) => { g.downUntil = 0; });
  logAudit(req.user, 'Reset demo', 'All scenarios cleared');
  res.json({ ok: true });
});

/* ── Fleet overview ────────────────────────────────────────────────────── */
const HEALTH_KPIS = ['q.bis28', 'e.sec', 'd.completeness', 'pw.md', 'q.fcaoInSpec'];
router.get('/overview', (req, res) => {
  const p = plantOf(req.query);
  const plants = PLANTS.map((pl) => {
    const rags = HEALTH_KPIS.map((id) => I.card(id, { plant: pl.id })).filter((c) => c && c.raw != null);
    const worst = rags.some((c) => c.rag === 'critical') ? 'critical' : rags.some((c) => c.rag === 'warning') ? 'warning' : 'normal';
    const st = PW.power[pl.id];
    const advs = ADV.list().filter((a) => a.plant === pl.id && a.status === 'open');
    return {
      id: pl.id, name: pl.name, state: pl.stateName, type: pl.type, lat: pl.lat, lng: pl.lng, cementMtpa: pl.cementMtpa, clinkerMtpa: pl.clinkerMtpa,
      health: worst, output: Math.round(I.currentValue(byKpi['o.output'], { plant: pl.id })), sec: I.card('e.sec', { plant: pl.id }).value,
      green: I.card('e.green', { plant: pl.id }).value, completeness: I.card('d.completeness', { plant: pl.id }).value, md: st.projected,
      advisories: advs.length, critical: advs.filter((a) => a.severity === 'critical').length, highlights: pl.highlights, power: pl.power, grades: pl.grades,
      issues: rags.filter((c) => c.rag !== 'normal').map((c) => `${c.label} ${c.value}${c.unit ? ' ' + c.unit : ''}`),
      estimated: pl.estimated,
    };
  });
  const fleetSec = I.insight('e.sec', { tf: '30D', filters: p ? { plant: p } : {} });
  const out = I.insight('o.output', { tf: '7D', filters: p ? { plant: p } : {} });
  res.json({
    fleet: FLEET, hq: HQ, plants,
    cards: cards(['o.output', 'o.util', 'e.sec', 'e.shc', 'e.green', 'e.pfCostT', 'q.bis28', 'q.fcaoInSpec', 'd.completeness', 'a.open'], { plant: p }),
    trend: { sec: fleetSec.series, output: out.series },
    distribution: PLANTS.map((pl) => ({ key: pl.id, label: pl.name, output: Math.round(I.currentValue(byKpi['o.output'], { plant: pl.id })), capacity: Math.round((pl.cementMtpa * 1e6) / 365) })),
    attention: plants.filter((x) => x.health !== 'normal' || x.advisories).sort((a, b) => (b.health === 'critical') - (a.health === 'critical') || b.advisories - a.advisories),
    latest: LAB.lab.samples.slice(0, 8).map((s) => ({ id: s.barcode, plant: byId[s.plant].name, instrument: s.instrumentName, stage: s.stage, at: s.analyzedAt, qc: s.qc, note: s.spec.note })),
  });
});

module.exports = router;
