// Field layer: DCS tags per kiln line and mill, edge-AI camera features, and the
// free-lime soft sensor. Signals follow mean-reverting AR(1) around research
// baselines, plus whatever the active scenarios push in.

const { PLANTS, cementTph } = require('../domain/plants');
const { KILN_TAGS, MILL_TAGS, GU_EXTRA, PACK_TAGS, CAMERAS } = require('../domain/catalog');
const SC = require('./scenarios');
const { ar1, clamp, round, gauss, rnd, HOUR } = require('./util');

const state = {}; // plantId → { lines, mills, gu, pack, cementTph }

function tagDef([code, label, unit, mu, sdv, phi, lo, hi, nlo, nhi], section, over = {}) {
  return { code, label, unit, mu: over.mu ?? mu, sd: sdv, phi, lo, hi, nlo: over.nlo ?? nlo, nhi: over.nhi ?? nhi, section, v: over.mu ?? mu };
}

function initLine(plant, k) {
  const tags = [];
  for (const [section, defs] of Object.entries(KILN_TAGS)) {
    for (const d of defs) {
      const over = {};
      if (d[0] === 'PH_C1_TEMP' && k.stages === 6) Object.assign(over, { mu: 238, nlo: 215, nhi: 260 });
      tags.push(tagDef(d, section, over));
    }
  }
  const feed = (k.tpd * 1.55) / 24;
  tags.push(tagDef(['KLN_FEED', 'Kiln feed rate', 'tph', feed, feed * 0.008, 0.85, feed * 0.6, feed * 1.1, feed * 0.95, feed * 1.03], 'Kiln'));
  const cams = Object.fromEntries(CAMERAS.map((c) => [c.key, { ...c, v: c.mu }]));
  // Soft sensor: one point a minute for six hours, lab results every hour.
  const fs = { est: [], lab: [] };
  let f = 1.1;
  const now = Date.now();
  for (let i = 360; i >= 0; i--) {
    f = ar1(f, 1.1, 0.22, 0.97);
    const t = now - i * 60 * 1000;
    fs.est.push({ t, v: round(clamp(f + gauss() * 0.06, 0.2, 3.2), 2), truth: f });
    if (i % 60 === 0) fs.lab.push({ t, v: round(clamp(f + gauss() * 0.1, 0.2, 3.2), 2) });
  }
  return { id: k.id, name: k.name, tpd: k.tpd, stages: k.stages, tags, cams, fs, truth: f, paused: false, clinkerTpd: k.tpd * 0.93 };
}

function initMill(plant, m, i) {
  const grade = plant.grades[i % plant.grades.length];
  const secMu = { 'OPC 53': 26, 'OPC 43': 24.5, PPC: 21, PSC: 31, CC: 27 }[grade] + (m.kind === 'Ball mill' ? 3 : 0);
  const tph = cementTph(plant) / plant.mills.length;
  const tags = MILL_TAGS.map((d) => {
    const over = {};
    if (d[0] === 'SEC') Object.assign(over, { mu: secMu, nlo: secMu - 4, nhi: secMu + 3 });
    if (d[0] === 'TPH') Object.assign(over, { mu: tph, nlo: tph * 0.85, nhi: tph * 1.1 });
    return tagDef(d, 'Cement mill', over);
  });
  return { id: m.id, name: m.name, kind: m.kind, grade, tags, running: true };
}

function init() {
  for (const p of PLANTS) {
    state[p.id] = {
      lines: p.kilns.map((k) => initLine(p, k)),
      mills: p.mills.map((m, i) => initMill(p, m, i)),
      gu: p.type === 'grinding' ? GU_EXTRA.map((d) => tagDef(d, 'Slag & SCM')) : null,
      pack: PACK_TAGS.map((d) => tagDef(d, 'Packing')),
      cementTph: cementTph(p),
    };
  }
}

function step(t, plant, line, prefix) {
  const b = SC.bias(plant, line, `${prefix}:${t.code}`);
  t.v = clamp(ar1(t.v, t.mu + b, t.sd, t.phi), t.lo, t.hi);
}

function tick() {
  const now = Date.now();
  for (const p of PLANTS) {
    const ps = state[p.id];
    for (const L of ps.lines) {
      L.tags.forEach((t) => step(t, p.id, L.id, 't'));
      for (const c of Object.values(L.cams)) {
        const b = SC.bias(p.id, L.id, `c:${c.key}`);
        c.v = Math.max(0, ar1(c.v, c.mu + b, c.sd, 0.8));
      }
      // Free lime: true value drifts with scenarios; soft sensor estimates it every minute.
      const fb = SC.bias(p.id, L.id, 'lab:fcao');
      L.truth = clamp(ar1(L.truth, 1.1 + fb, 0.2, 0.9), 0.2, 3.4);
      L.paused = SC.isActive('S7', p.id);
      const last = L.fs.est[L.fs.est.length - 1];
      const est = round(clamp(L.truth + gauss() * 0.07, 0.2, 3.4), 2);
      if (now - last.t >= 60 * 1000) {
        L.fs.est.push({ t: now, v: est, truth: L.truth });
        if (L.fs.est.length > 361) L.fs.est.shift();
      } else {
        last.v = est; last.truth = L.truth;
      }
      const lastLab = L.fs.lab[L.fs.lab.length - 1];
      if (now - lastLab.t >= HOUR) {
        L.fs.lab.push({ t: now, v: round(clamp(L.truth + gauss() * 0.1, 0.2, 3.4), 2) });
        if (L.fs.lab.length > 7) L.fs.lab.shift();
      }
      const torque = L.tags.find((x) => x.code === 'KLN_TRQ_PCT').v;
      L.clinkerTpd = L.tpd * clamp(0.93 + (torque - 64) * 0.001 + gauss() * 0.004, 0.85, 0.98);
    }
    ps.mills.forEach((m) => m.tags.forEach((t) => step(t, p.id, m.id, 'm')));
    if (ps.gu) ps.gu.forEach((t) => step(t, p.id, 'CM1', 'g'));
    ps.pack.forEach((t) => step(t, p.id, null, 'pk'));
    ps.cementTph = clamp(ar1(ps.cementTph, cementTph(p), cementTph(p) * 0.008, 0.9), cementTph(p) * 0.95, cementTph(p) * 1.05);
  }
}

/** Backfill: shift the last N minutes of a line's soft-sensor history (scenarios active at boot). */
function shiftHistory(plantId, lineId, delta, minutes = 150) {
  const L = state[plantId]?.lines.find((l) => l.id === lineId);
  if (!L) return;
  const n = L.fs.est.length;
  L.fs.est.forEach((pt, i) => {
    const age = n - 1 - i;
    if (age > minutes) return;
    const ramp = Math.min(1, (minutes - age) / 45);
    pt.v = round(clamp(pt.v + delta * ramp, 0.2, 3.4), 2); pt.truth += delta * ramp;
  });
  L.fs.lab.forEach((pt) => { if (Date.now() - pt.t < minutes * 60000) pt.v = round(clamp(pt.v + delta, 0.2, 3.4), 2); });
  L.truth += delta;
}

const tag = (plantId, lineId, code) => state[plantId]?.lines.find((l) => l.id === lineId)?.tags.find((t) => t.code === code)?.v;
const avgTag = (plantId, code) => {
  const ls = state[plantId]?.lines || [];
  if (!ls.length) return null;
  return ls.reduce((s, l) => s + l.tags.find((t) => t.code === code).v, 0) / ls.length;
};
const millTag = (plantId, code) => {
  const ms = state[plantId]?.mills || [];
  return ms.reduce((s, m) => s + m.tags.find((t) => t.code === code).v, 0) / (ms.length || 1);
};

/** Free-lime soft sensor forecast for the next 45 minutes (least squares on the last 20 minutes). */
function softSensorForecast(L) {
  const pts = L.fs.est.slice(-20);
  const n = pts.length;
  const xs = pts.map((_, i) => i); const ys = pts.map((p) => p.v);
  const mx = (n - 1) / 2; const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const slope = den ? num / den : 0;
  const lastV = ys[n - 1];
  return Array.from({ length: 10 }, (_, i) => {
    const h = (i + 1) * 4.5;
    const v = clamp(lastV + slope * h * 0.6, 0.2, 3.4);
    const band = 0.18 * Math.sqrt(Math.min(i + 1, 4));
    return { t: pts[n - 1].t + h * 60 * 1000, v: round(v, 2), lo: round(Math.max(0.1, v - band), 2), hi: round(v + band, 2) };
  });
}

module.exports = { state, init, tick, tag, avgTag, millTag, softSensorForecast, shiftHistory, rnd };
