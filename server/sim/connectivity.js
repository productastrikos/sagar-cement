// Edge connectivity: per-plant edge gateways with disk-backed store-and-forward,
// connector health, validation/quarantine (dead-letter queue) and unit
// normalisation — research §C.2. This is the "broken pipe fix" live moment.

const { PLANTS } = require('../domain/plants');
const { CONNECTORS } = require('../domain/catalog');
const SC = require('./scenarios');
const { notify } = require('./store');
const { clamp, round, gauss, rnd, pick, ar1 } = require('./util');

const conn = {
  list: CONNECTORS.map((c) => ({
    ...c, state: 'online', error: null,
    latencyMs: c.cls === 'lab' ? 40000 + rnd() * 30000 : c.cls === 'erp' ? 9000 : 2500 + rnd() * 4000,
    completeness: 99.6 + rnd() * 0.4, rejectRate: rnd() * 0.25, dupRate: rnd() * 0.05, uptime: 99.7 + rnd() * 0.3,
    lastGoodAt: Date.now() - rnd() * 60000, recordsToday: Math.round(2000 + rnd() * 9000),
  })),
  gateways: Object.fromEntries(PLANTS.map((p) => [p.id, {
    plant: p.id, uplink: 'up', downUntil: 0, buffer: Math.round(rnd() * 6), replayedTotal: 0, lostTotal: 0, outages: 0,
    diskFreeGb: round(180 + rnd() * 60, 0), cpu: round(18 + rnd() * 10, 0),
  }])),
  quarantine: [],
  normalised: [],
  counters: { ingestedToday: 1840000 + Math.round(rnd() * 90000), normalisedToday: 1260, quarantinedToday: 0, releasedToday: 0 },
};

const REASONS = [
  { rule: 'Closure', instrument: 'xrf', reason: 'Oxide + LOI total 93.1% outside 98.0–101.5%', raw: 'CaO=41.2;SiO2=13.9;Al2O3=3.4;Fe2O3=2.2;LOI=32.4' },
  { rule: 'Barcode', instrument: 'xrf', reason: "Sample ID 'rm-1 2pm' fails PLANT-STAGE-LINE-YYYYMMDD-SEQ", raw: 'SampleName=rm-1 2pm' },
  { rule: 'Plausibility', instrument: 'xrd', reason: 'Free lime 0.04% outside plausibility window 0.1–3.0%', raw: 'fCaO=0.04;Rwp=14.8' },
  { rule: 'Duplicate', instrument: 'ctm', reason: 'Duplicate key (plant, instrument, sample, parameter, analysed_ts) — retry loop', raw: 'cube_set=CE-0417 age=7d' },
  { rule: 'Basis', instrument: 'cal', reason: 'Preliminary ADB GCV exported before sulphur/moisture correction', raw: 'GCV=8350;basis=ADB;status=PRELIM' },
  { rule: 'Clock', instrument: 'psa', reason: 'Lab PC clock 14 min ahead of NTP — timestamp held for re-alignment', raw: 'analysed_ts=…+14m' },
];

function quarantine(plant, r, at = Date.now()) {
  const q = {
    id: `DLQ-${String(4100 + conn.quarantine.length + conn.counters.quarantinedToday).padStart(5, '0')}`,
    at, plant, connector: `${plant}-${r.instrument}`, instrument: r.instrument, rule: r.rule, reason: r.reason, raw: r.raw, status: 'quarantined',
  };
  conn.quarantine.unshift(q);
  if (conn.quarantine.length > 120) conn.quarantine.length = 120;
  conn.counters.quarantinedToday += 1;
  return q;
}

function seed() {
  const now = Date.now();
  REASONS.forEach((r, i) => {
    const plant = r.instrument === 'cal' || r.instrument === 'xrd' ? pick(['MTP', 'GDP', 'JRB', 'DCP']) : pick(PLANTS).id;
    quarantine(plant, r, now - (i + 1) * 47 * 60 * 1000);
  });
  conn.quarantine[4].status = 'released';
  [['MTP', 'Blaine 3,420 cm²/g → 342 m²/kg'], ['BYV', 'Strength 412 kg/cm² → 40.4 MPa'], ['GDP', 'GCV 24,700 J/g → 5,900 kcal/kg']]
    .forEach(([plant, text], i) => conn.normalised.push({ at: now - i * 23 * 60000, plant, text }));
}

/* ── Live demo controls ─────────────────────────────────────────────────── */
function wanOutage(plant, seconds = 60) {
  const g = conn.gateways[plant];
  g.downUntil = Date.now() + seconds * 1000; g.uplink = 'down'; g.outages += 1;
  notify('urgent', `Edge uplink down at ${plant}`, `WAN link to the ${plant} edge gateway dropped. Store-and-forward is buffering locally — no data loss.`, '/connectivity', plant);
}

function malformed(plant) {
  const q = quarantine(plant, {
    rule: 'Closure + Barcode', instrument: 'xrf',
    reason: 'Oxide + LOI total 92.4% outside 98.0–101.5%; sample ID missing; Blaine column in cm²/g',
    raw: 'SampleName=;CaO=40.8;SiO2=13.7;Al2O3=3.3;Fe2O3=2.1;LOI=32.5;Blaine=3380',
  });
  notify('urgent', `Malformed XRF row quarantined at ${plant}`, `${q.id}: ${q.reason}. Held in the dead-letter queue; nothing reached the quality models.`, '/connectivity', plant);
  return q;
}

function resolve(id, action) {
  const q = conn.quarantine.find((x) => x.id === id);
  if (!q) return null;
  q.status = action === 'release' ? 'released' : 'discarded';
  if (action === 'release') conn.counters.releasedToday += 1;
  return q;
}

/* ── Tick ───────────────────────────────────────────────────────────────── */
function tick() {
  const now = Date.now();
  for (const g of Object.values(conn.gateways)) {
    const plantConns = conn.list.filter((c) => c.plant === g.plant);
    if (g.downUntil > now) {
      g.uplink = 'down';
      g.buffer += plantConns.length * 3 + Math.round(rnd() * 6);
    } else if (g.buffer > 8 && g.uplink !== 'up') {
      g.uplink = 'backfilling';
      const drained = Math.max(25, Math.round(g.buffer * 0.3));
      const n = Math.min(drained, g.buffer);
      g.buffer -= n; g.replayedTotal += n;
    } else {
      if (g.uplink !== 'up' && g.buffer <= 8) notify('verified', `${g.plant} edge backlog replayed`, `Buffered records replayed in order — 0 lost. Completeness back to 100%.`, '/connectivity', g.plant);
      g.uplink = 'up';
      g.buffer = clamp(Math.round(ar1(g.buffer, 3, 2, 0.7)), 0, 12);
    }
    g.cpu = round(clamp(ar1(g.cpu, g.uplink === 'backfilling' ? 46 : 22, 3, 0.8), 5, 90), 0);
  }

  for (const c of conn.list) {
    const g = conn.gateways[c.plant];
    const s7 = SC.bias(c.plant, null, `conn:${c.key}`) > 0.5;
    if (s7) {
      c.state = c.key === 'cal' ? 'stale' : 'offline';
      c.error = c.key === 'cal' ? 'datalog.csv frozen at 1,024 KB' : 'OPC DA 0x80070005 · DCOM access denied (Event 10036)';
      c.completeness = clamp(c.completeness - 0.8, 60, 100);
      c.uptime = clamp(c.uptime - 0.05, 90, 100);
      continue;
    }
    c.error = null;
    if (g.uplink === 'down') {
      c.state = 'buffering';
      c.completeness = clamp(c.completeness - 0.25, 85, 100); // as seen upstream until backfill
    } else if (g.uplink === 'backfilling') {
      c.state = 'backfilling';
      c.completeness = clamp(c.completeness + 1.2, 0, 100);
      c.lastGoodAt = now;
    } else {
      c.state = 'online';
      c.completeness = clamp(ar1(c.completeness, 99.85, 0.08, 0.8), 97, 100);
      c.uptime = clamp(ar1(c.uptime, 99.85, 0.05, 0.9), 97, 100);
      const cadence = c.cls === 'lab' ? c.cadenceMin * 60000 : 4000;
      if (now - c.lastGoodAt > cadence * (0.4 + rnd())) c.lastGoodAt = now;
      c.recordsToday += c.cls === 'lab' ? (rnd() < 0.2 ? 1 : 0) : Math.round(5 + rnd() * 20);
    }
    const baseLat = c.cls === 'lab' ? 55000 : c.cls === 'erp' ? 9000 : 4500;
    c.latencyMs = Math.max(400, ar1(c.latencyMs, baseLat * (g.uplink === 'backfilling' ? 2.5 : 1), baseLat * 0.15, 0.8));
    const extraReject = SC.bias(c.plant, null, 'k:d.rejectRate');
    c.rejectRate = clamp(ar1(c.rejectRate, 0.15 + (c.key === 'cal' ? extraReject : 0), 0.05, 0.8), 0, 5);
    c.dupRate = clamp(ar1(c.dupRate, 0.03, 0.015, 0.8), 0, 2);
  }
  conn.counters.ingestedToday += Math.round(180 + rnd() * 60);
  if (rnd() < 0.015) {
    const r = pick(REASONS); const p = pick(PLANTS);
    if (!(p.type === 'grinding' && ['cal', 'xrd'].includes(r.instrument))) quarantine(p.id, r);
  }
  if (rnd() < 0.05) conn.counters.normalisedToday += 1;
}

/* ── Per-plant data-health roll-ups (feed the d.* KPIs) ────────────────── */
function health(plantId) {
  const cs = conn.list.filter((c) => c.plant === plantId);
  const g = conn.gateways[plantId];
  const ot = cs.filter((c) => c.cls !== 'lab' && c.cls !== 'erp');
  const now = Date.now();
  const staleMin = ot.map((c) => (c.state === 'online' ? (now - c.lastGoodAt) / 60000 : (now - c.lastGoodAt) / 60000 + (g.uplink === 'down' ? 5 : 0)));
  const labStale = cs.filter((c) => c.cls === 'lab' && c.state !== 'online').length;
  return {
    completeness: round(cs.reduce((s, c) => s + c.completeness, 0) / cs.length, 2),
    latency: round(Math.max(...ot.map((c) => c.latencyMs)) / 1000, 1),
    freshness: round(Math.max(...staleMin, labStale ? 12 + SC.bias(plantId, null, 'k:d.freshness') : 0), 1),
    rejectRate: round(cs.reduce((s, c) => s + c.rejectRate, 0) / cs.length, 2),
    dupRate: round(cs.reduce((s, c) => s + c.dupRate, 0) / cs.length, 3),
    uptime: round(cs.reduce((s, c) => s + c.uptime, 0) / cs.length, 2),
    buffer: g.buffer,
    online: cs.filter((c) => c.state === 'online').length,
    total: cs.length,
  };
}

module.exports = { conn, seed, tick, wanOutage, malformed, resolve, health, quarantine };
