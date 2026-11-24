// Quality API: clinker-to-cement correlation workbench, prediction & spec
// optimisation, and the what-if simulator.

const express = require('express');
const { PLANTS, byId } = require('../domain/plants');
const { BIS, SAFETY_MPA, GRADE_BASE } = require('../domain/bis');
const I = require('../kpi/insight');
const LAB = require('../sim/lab');
const PR = require('../sim/process');
const ADV = require('../sim/advisory');
const { logAudit } = require('../sim/store');
const { round, mean, sd, pearson, clamp } = require('../sim/util');

const router = express.Router();
const plantOf = (q, dflt) => (q.plant && byId[q.plant] ? q.plant : dflt);
const cards = (ids, f) => ids.map((id) => I.card(id, f)).filter(Boolean);

const FEATURES = [
  ['lsf', 'Kiln feed LSF', (b) => b.clinker.lsf], ['fcao', 'Free lime', (b) => b.clinker.fcao], ['c3s', 'Alite C₃S', (b) => b.clinker.c3s],
  ['c2s', 'Belite C₂S', (b) => b.clinker.c2s], ['c3a', 'C₃A', (b) => b.clinker.c3a], ['litre', 'Litre weight', (b) => b.clinker.litre],
  ['alite', 'Alite crystal size', (b) => b.clinker.aliteSize], ['blaine', 'Blaine', (b) => b.blaine], ['so3', 'SO₃', (b) => b.so3], ['s3', '3-day strength', (b) => b.s3],
];

function lotAt(plantId, line, day) {
  return LAB.lab.clinkerLots.find((c) => c.plant === plantId && c.line === line && c.day === day);
}

router.get('/quality', (req, res) => {
  const p = plantOf(req.query, 'MTP');
  const grade = req.query.grade && BIS[req.query.grade] ? req.query.grade : null;
  const res28 = LAB.lab.batches.filter((b) => b.plant === p && b.s28 != null && (!grade || b.grade === grade));
  // Aligned: strength paired with the clinker that actually went into the batch (genealogy).
  // Naive: strength paired with whatever clinker was sampled on the day the 28-day result arrived.
  const pairs = res28.map((b) => {
    const firstLot = LAB.lab.clinkerLots.find((c) => c.id === b.lots[0].id);
    const naive = firstLot ? lotAt(b.clinkerPlant, firstLot.line, b.day - 28) : null;
    return { id: b.id, grade: b.grade, s28: b.s28, c3s: b.clinker.c3s, fcao: b.clinker.fcao, naiveC3s: naive ? naive.c3s : null, naiveFcao: naive ? naive.fcao : null, day: b.day };
  });
  const withNaive = pairs.filter((x) => x.naiveC3s != null);
  // Normalise strength by grade so mixed-grade scatters stay comparable.
  const gm = {}; res28.forEach((b) => (gm[b.grade] = gm[b.grade] || []).push(b.s28));
  const gmean = Object.fromEntries(Object.entries(gm).map(([g, a]) => [g, mean(a)]));
  const dev = (x) => round(x.s28 - gmean[x.grade], 2);
  const g3 = {}; res28.filter((b) => b.s3 != null).forEach((b) => (g3[b.grade] = g3[b.grade] || []).push(b.s3));
  const g3m = Object.fromEntries(Object.entries(g3).map(([g, a]) => [g, mean(a)]));
  const matrix = FEATURES.map(([key, label, fn]) => {
    const rows = res28.filter((b) => fn(b) != null);
    // Early strength is compared within grade, like the 28-day target.
    const xs = rows.map((b) => (key === 's3' ? b.s3 - g3m[b.grade] : fn(b)));
    return { key, label, s28: round(pearson(xs, rows.map((b) => b.s28 - gmean[b.grade])), 2), millSec: round(pearson(xs, rows.map((b) => b.millSec)), 2) };
  });
  // Residence-time chain: last 60 grinding days.
  const src = byId[p].type === 'grinding' ? byId[p].clinkerFrom : p;
  const srcLine = byId[src].kilns[byId[src].kilns.length - 1].id;
  const chain = [];
  for (let d = 59; d >= 0; d--) {
    const lot = lotAt(src, srcLine, d + 2);
    const day = LAB.lab.batches.filter((b) => b.plant === p && b.day === d && (!grade || b.grade === grade));
    const date = day[0]?.date || lot?.date;
    if (!lot || !date) continue;
    const s28 = day.filter((b) => b.s28 != null);
    chain.push({ date, day: d, lsf: lot.lsf, fcao: lot.fcao, c3s: lot.c3s, s28: s28.length ? round(mean(s28.map((b) => b.s28 - gmean[b.grade])), 2) : null, p28: day.length ? round(mean(day.map((b) => LAB.batchView(b).p28 - (gmean[b.grade] || GRADE_BASE[b.grade].s28))), 2) : null });
  }
  res.json({
    plant: p, grade, src, grades: byId[p].grades,
    cards: cards(['q.fcaoInSpec', 'q.fcaoSigma', 'q.lsfSigma', 'q.hFactor', 'q.c3s', 'q.sigma28', 'q.bis28', 'q.gypsumDehyd'], { plant: p }),
    scatter: {
      aligned: pairs.slice(-160).map((x) => ({ x: x.c3s, y: dev(x), id: x.id })),
      naive: withNaive.slice(-160).map((x) => ({ x: x.naiveC3s, y: dev(x), id: x.id })),
      rAligned: round(pearson(pairs.map((x) => x.c3s), pairs.map(dev)), 2),
      rNaive: round(pearson(withNaive.map((x) => x.naiveC3s), withNaive.map(dev)), 2),
      fcaoAligned: pairs.slice(-160).map((x) => ({ x: x.fcao, y: dev(x) })),
      rFcao: round(pearson(pairs.map((x) => x.fcao), pairs.map(dev)), 2),
      n: pairs.length,
    },
    matrix, chain,
    lines: (PR.state[src]?.lines || []).map((L) => ({ id: L.id, name: L.name, est: L.fs.est.slice(-120).map((x) => ({ t: x.t, v: x.v })), lab: L.fs.lab, paused: L.paused })),
  });
});

router.get('/prediction', (req, res) => {
  const p = plantOf(req.query, undefined);
  const grade = req.query.grade && BIS[req.query.grade] ? req.query.grade : null;
  const scope = (b) => (!p || b.plant === p) && (!grade || b.grade === grade);
  const open = LAB.lab.batches.filter((b) => scope(b) && b.day < 28).map(LAB.batchView)
    .sort((a, b) => (b.atRisk - a.atRisk) || (a.p28 - BIS[a.grade].s28) - (b.p28 - BIS[b.grade].s28)).slice(0, 40)
    .map((b) => ({ id: b.id, plant: b.plant, plantName: byId[b.plant].name, grade: b.grade, day: b.day, date: b.date, s3: b.s3, s7: b.s7, p28: b.p28, bisMin: BIS[b.grade].s28, target: BIS[b.grade].s28 + SAFETY_MPA, atRisk: b.atRisk, bisPass: b.bisPass, blaine: b.blaine, so3: b.so3 }));
  const tested = LAB.lab.batches.filter((b) => scope(b) && b.s28 != null && b.day < 120).sort((a, b) => b.day - a.day);
  const err = tested.map((b) => b.p28 - b.s28);
  const ss = tested.map((b) => b.s28); const ms = mean(ss);
  const backtest = {
    points: tested.slice(-90).map((b) => ({ date: b.date, id: b.id, grade: b.grade, predicted: b.p28, actual: b.s28 })),
    mae: round(mean(err.map(Math.abs)), 2), rmse: round(Math.sqrt(mean(err.map((e) => e * e))), 2), bias: round(mean(err), 2),
    r2: round(1 - err.reduce((s, e) => s + e * e, 0) / Math.max(1e-9, ss.reduce((s, v) => s + (v - ms) ** 2, 0)), 2), n: tested.length,
    method: 'Chronological split: trained on results up to each batch’s grinding date, scored on the next 28-day result. Never a random split.',
  };
  const gradesIn = [...new Set(LAB.lab.batches.filter((b) => !p || b.plant === p).map((b) => b.grade))];
  const giveaway = gradesIn.map((g) => {
    const r = LAB.lab.batches.filter((b) => (!p || b.plant === p) && b.grade === g && b.s28 != null && b.day >= 28 && b.day < 58);
    const m = r.length ? mean(r.map((b) => b.s28)) : null;
    return { grade: g, standard: BIS[g].standard, bisMin: BIS[g].s28, target: BIS[g].s28 + SAFETY_MPA, mean: m != null ? round(m, 1) : null, sigma: r.length > 2 ? round(sd(r.map((b) => b.s28)), 2) : null, giveaway: m != null ? round(m - (BIS[g].s28 + SAFETY_MPA), 1) : null, n: r.length };
  });
  const plantForSensor = p && byId[p].type === 'integrated' ? p : 'MTP';
  res.json({
    plant: p || null, grade,
    cards: cards(['q.strengthMae', 'q.softSensorErr', 'q.p28Risk', 'q.giveaway', 'q.offSpec', 'q.bis28'], { plant: p }),
    open, backtest, giveaway,
    bis: Object.entries(BIS).map(([g, s]) => ({ grade: g, ...s })),
    sensor: { plant: plantForSensor, plantName: byId[plantForSensor].name, lines: PR.state[plantForSensor].lines.map((L) => ({ id: L.id, name: L.name, est: L.fs.est.slice(-90).map((x) => ({ t: x.t, v: x.v })), lab: L.fs.lab.slice(-3), forecast: PR.softSensorForecast(L), paused: L.paused })) },
    opportunities: ADV.list().filter((a) => a.key === 'GIVE' && (!p || a.plant === p)),
  });
});

router.post('/prediction/whatif', (req, res) => {
  const { plant = 'MTP', grade = 'PPC', scm = 0, blaine = 0, so3 = 0 } = req.body || {};
  const g = BIS[grade] ? grade : 'PPC';
  const base = GRADE_BASE[g];
  const recent = LAB.lab.batches.filter((b) => b.plant === plant && b.grade === g && b.s28 != null && b.day < 60);
  const m28 = recent.length ? mean(recent.map((b) => b.s28)) : base.s28;
  const m3 = recent.length ? mean(recent.filter((b) => b.s3 != null).map((b) => b.s3)) : base.s3;
  const m7 = recent.length ? mean(recent.filter((b) => b.s7 != null).map((b) => b.s7)) : base.s7;
  const scmEff = g === 'PPC' ? [0.62, 0.48, 0.32] : g === 'PSC' || g === 'CC' ? [0.45, 0.36, 0.22] : [0.7, 0.55, 0.45];
  const so3Pen = (v) => -1.5 * Math.abs(v);
  const s3 = m3 - scmEff[0] * scm + 0.05 * blaine + so3Pen(so3) * 0.6;
  const s7 = m7 - scmEff[1] * scm + 0.06 * blaine + so3Pen(so3) * 0.8;
  const s28 = m28 - scmEff[2] * scm + 0.07 * blaine + so3Pen(so3);
  const band = 1.96 * 0.95;
  const tonnesMonth = recent.length ? mean(recent.map((b) => b.tonnes)) * 30 : 60000;
  const clinkerSavedT = (tonnesMonth * scm) / 100;
  const kwhDelta = blaine * 0.25;
  const lakh = (clinkerSavedT * 1800 - tonnesMonth * kwhDelta * 6.5) / 1e5;
  const out = {
    grade: g, standard: BIS[g].standard, bisMin: { s3: BIS[g].s3, s7: BIS[g].s7, s28: BIS[g].s28 }, target28: BIS[g].s28 + SAFETY_MPA,
    current: { s3: round(m3, 1), s7: round(m7, 1), s28: round(m28, 1) },
    predicted: { s3: round(s3, 1), s7: round(s7, 1), s28: round(s28, 1), lo28: round(s28 - band, 1), hi28: round(s28 + band, 1) },
    scmPct: round(clamp(base.scm + scm, 0, 70), 1), scmCap: g === 'PPC' ? 35 : g === 'PSC' ? 70 : g === 'CC' ? 65 : 5,
    pass: s3 >= BIS[g].s3 && s7 >= BIS[g].s7 && s28 - band >= BIS[g].s28, meetsTarget: s28 - band >= BIS[g].s28 + SAFETY_MPA,
    clinkerSavedT: Math.round(clinkerSavedT), energyKwhT: round(kwhDelta, 2), lakhPerMonth: round(lakh, 1),
    engine: 'S!aP 28-day strength forecaster v2.0 · sensitivity mode',
  };
  if (req.body?.log) logAudit(req.user, 'Saved what-if scenario', `${byId[plant]?.name || plant} ${g}: SCM ${scm >= 0 ? '+' : ''}${scm}%, Blaine ${blaine >= 0 ? '+' : ''}${blaine} m²/kg`);
  res.json(out);
});

module.exports = router;
