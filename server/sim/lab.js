// Laboratory layer: the live sample stream (barcoded chain of custody), the
// 200-day clinker-lot and cement-batch dataset behind the correlation workbench
// and strength forecaster, and material genealogy.

const { PLANTS, byId } = require('../domain/plants');
const { INSTRUMENTS, LAB_FOR } = require('../domain/catalog');
const { BIS, GRADE_BASE, SAFETY_MPA, checkBatch } = require('../domain/bis');
const SC = require('./scenarios');
const { ar1, clamp, round, gauss, rnd, pick, ymd, pad, hrand, DAY, mean } = require('./util');

const DAYS = 200;
const lab = { samples: [], seq: 400, clinkerLots: [], batches: [], crm: {} };

/* ── Clinker chemistry helpers (IS 269 Bogue coefficients) ─────────────── */
function bogue(o, fcao = 0) {
  const cao = o.CaO - fcao;
  const c3s = 4.071 * cao - 7.6 * o.SiO2 - 6.718 * o.Al2O3 - 1.43 * o.Fe2O3 - 2.852 * o.SO3;
  const c2s = 2.867 * o.SiO2 - 0.7544 * c3s;
  return { c3s, c2s, c3a: 2.65 * o.Al2O3 - 1.692 * o.Fe2O3, c4af: 3.043 * o.Fe2O3 };
}
const lsfOf = (o) => (o.CaO / (2.8 * o.SiO2 + 1.18 * o.Al2O3 + 0.65 * o.Fe2O3)) * 100;

/* ── Historical clinker lots and cement batches ──────────────────────────── */
// Historical anomalies placed so the dashboards have a real story to show.
const HISTORY_EVENTS = [
  { plant: 'MTP', line: 'K2', fromDay: 46, toDay: 43, fcao: 1.4, c3s: -6.5, note: 'S1-type XRF drift' },
  { plant: 'JRB', line: 'K1', fromDay: 16, toDay: 14, fcao: 0.4, c3s: -4, note: 'cooler channelling' },
  { plant: 'DCP', line: 'K1', fromDay: 70, toDay: 66, fcao: 0.9, c3s: -3, note: 'CF silo pad fault' },
];
const SCM_EVENTS = [{ plant: 'JJP', grade: 'PSC', fromDay: 21, toDay: 18, s28: -9, s3: -5, blaine: -40 }];

function seedHistory() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const p of PLANTS.filter((x) => x.type === 'integrated')) {
    for (const k of p.kilns) {
      let c3s = 60.5; let fcao = 1.1; let litre = 1225; let lsf = 95; let size = 24;
      for (let d = DAYS; d >= 0; d--) {
        c3s = ar1(c3s, 60.5, 1.6, 0.7); fcao = ar1(fcao, 1.1, 0.2, 0.6); litre = ar1(litre, 1225, 22, 0.6);
        lsf = ar1(lsf, 95, 0.6, 0.5); size = ar1(size, 24, 2.2, 0.6);
        let ev = HISTORY_EVENTS.find((e) => e.plant === p.id && e.line === k.id && d <= e.fromDay && d >= e.toDay);
        const c3sV = c3s + (ev ? ev.c3s : 0); const fV = fcao + (ev ? ev.fcao : 0);
        lab.clinkerLots.push({
          id: `CL-${p.id}-${k.id}-${ymd(new Date(today - d * DAY))}`, plant: p.id, line: k.id, day: d,
          date: new Date(today - d * DAY).toISOString(),
          lsf: round(lsf + (ev ? 3 : 0), 2), fcao: round(clamp(fV, 0.3, 3.2), 2), c3s: round(c3sV, 1),
          c2s: round(clamp(76 - c3sV - 0.3 + gauss() * 0.8, 8, 30), 1), c3a: round(7.8 + gauss() * 0.5, 1), c4af: round(11.4 + gauss() * 0.5, 1),
          litre: Math.round(litre - (ev ? 100 : 0) - (fV - 1.1) * 40), aliteSize: round(size, 1),
          bzt: Math.round(1430 + gauss() * 8 + (ev ? 10 : 0)), sat: Math.round(1045 + gauss() * 15),
          quench: round(clamp(24 + gauss() * 2 - (ev && ev.note.includes('cooler') ? 9 : 0), 10, 30), 1),
        });
      }
    }
  }
  // Cement batches: each plant grinds its grades daily from the last 1–3 days of clinker.
  for (const p of PLANTS) {
    const src = p.type === 'grinding' ? byId[p.clinkerFrom] : p;
    for (const grade of p.grades) {
      const base = GRADE_BASE[grade];
      const clk = base.clinker / 0.92;
      const mi = p.grades.indexOf(grade) % p.mills.length;
      const mill = p.mills[mi];
      const srcKiln = src.kilns[src.kilns.length - 1 - (mi % src.kilns.length)] || src.kilns[0];
      for (let d = DAYS - 3; d >= 0; d--) {
        const lots = lab.clinkerLots.filter((c) => c.plant === src.id && c.line === srcKiln.id && c.day >= d + 1 && c.day <= d + 3);
        if (!lots.length) continue;
        const w = lots.map((_, i) => [0.5, 0.3, 0.2][i] || 0.1);
        const ws = w.reduce((a, b) => a + b, 0);
        const wa = (f) => lots.reduce((s, c, i) => s + c[f] * w[i], 0) / ws;
        const cC3s = wa('c3s'); const cF = wa('fcao'); const cLitre = wa('litre');
        const ev = SCM_EVENTS.find((e) => e.plant === p.id && e.grade === grade && d <= e.fromDay && d >= e.toDay);
        const blaine = base.blaine + gauss() * 7 + (ev ? ev.blaine : 0);
        const so3 = base.so3 + gauss() * 0.12;
        const s28true = base.s28 + clk * (0.55 * (cC3s - 60.5) - 2.0 * (cF - 1.1)) + 0.07 * (blaine - base.blaine)
          - 1.5 * Math.abs(so3 - base.so3) + gauss() * 1.05 + (ev ? ev.s28 : 0);
        const s3 = base.s3 + clk * 0.35 * (cC3s - 60.5) + 0.05 * (blaine - base.blaine) + gauss() * 0.85 + (ev ? ev.s3 : 0);
        const s7 = base.s7 + clk * 0.45 * (cC3s - 60.5) + 0.06 * (blaine - base.blaine) + gauss() * 0.95;
        const date = new Date(today - d * DAY);
        lab.batches.push({
          id: `CB-${p.id}-${mill.id}-${ymd(date)}-${pad(p.grades.indexOf(grade) + 1)}`,
          plant: p.id, mill: mill.id, grade, day: d, date: date.toISOString(), clinkerPlant: src.id,
          lots: lots.map((c, i) => ({ id: c.id, w: round(w[i] / ws, 2) })),
          clinker: { c3s: round(cC3s, 1), fcao: round(cF, 2), litre: Math.round(cLitre), lsf: round(wa('lsf'), 2), c2s: round(wa('c2s'), 1), c3a: round(wa('c3a'), 1), aliteSize: round(wa('aliteSize'), 1) },
          blaine: Math.round(blaine), so3: round(so3, 2), scm: round(base.scm + gauss() * 1.2, 1),
          ist: Math.round(150 + gauss() * 20), millSec: round(25 + 0.06 * (blaine - base.blaine) + 0.016 * (cLitre - 1225) + gauss() * 0.6, 2),
          s3: d >= 3 ? round(s3, 1) : null, s7: d >= 7 ? round(s7, 1) : null, s28: d >= 28 ? round(s28true, 1) : null,
          s28true: round(s28true, 1), p28: round(s28true + gauss() * 0.95, 1), tonnes: Math.round(2200 + rnd() * 1800),
        });
      }
    }
  }
  for (const p of PLANTS) for (const i of LAB_FOR[p.type]) lab.crm[`${p.id}-${i}`] = 28 + rnd() * 18;
}

/** Live strength forecast for open batches reflects active scenarios at the clinker source. */
// Only today's in-progress batch can contain material affected by a live scenario;
// cubes already cast keep their results (anchored on grinding date, never test date).
function liveP28(b) {
  if (b.day > 0) return b.p28;
  const src = b.clinkerPlant;
  return round(b.p28 + SC.bias(src, null, 'lab:s28') * (BIS[b.grade].s28 / 53) + (b.plant !== src ? SC.bias(b.plant, null, 'lab:s28') : 0), 1);
}

function batchView(b) {
  const p28 = liveP28(b);
  const s = BIS[b.grade];
  const status = checkBatch(b.grade, { ...b, p28 });
  const value28 = b.s28 ?? p28;
  return { ...b, p28, giveaway: round(value28 - (s.s28 + SAFETY_MPA), 1), bisPass: status.pass, checks: status.checks, atRisk: value28 < s.s28 + SAFETY_MPA * 0.5 };
}

/* ── Live sample stream ─────────────────────────────────────────────────── */
const STAGE_CODE = { Limestone: 'LS', 'Raw meal': 'RM', 'Kiln feed': 'KF', 'Hot meal': 'HM', Clinker: 'CK', Cement: 'CE', Fuel: 'FU', Slag: 'SL' };

function oxides(stage, plant, line) {
  const xb = SC.bias(plant, line, 'lab:xrfCao');
  const lt = SC.bias(plant, line, 'lab:lsfTrue');
  if (stage === 'Clinker') return { CaO: 65.2 + gauss() * 0.3 + lt * 0.12 + xb, SiO2: 21.4 + gauss() * 0.2, Al2O3: 5.3 + gauss() * 0.1, Fe2O3: 3.4 + gauss() * 0.08, MgO: (plant === 'JJP' ? 3.6 : 2.4) + gauss() * 0.15, SO3: 0.9 + gauss() * 0.1, K2O: 0.7, Na2O: 0.25, LOI: 0.3 };
  if (stage === 'Hot meal') return { CaO: 60.0 + gauss() * 0.4, SiO2: 19.5 + gauss() * 0.2, Al2O3: 4.9, Fe2O3: 3.1, MgO: 2.2, SO3: 2.1 + gauss() * 0.15 + SC.bias(plant, line, 'lab:hotSo3'), K2O: 1.1, Na2O: 0.3, LOI: 6.5 + gauss() * 0.4 - SC.bias(plant, line, 'lab:calc') * 0.5 };
  if (stage === 'Cement') return { CaO: 63.0 + gauss() * 0.3, SiO2: 20.6 + gauss() * 0.2, Al2O3: 5.2 + gauss() * 0.1, Fe2O3: 3.3 + gauss() * 0.08, MgO: 2.4 + gauss() * 0.15, SO3: 2.65 + gauss() * 0.12, K2O: 0.7, Na2O: 0.25, LOI: 1.6 + gauss() * 0.15 };
  const sd = stage === 'Raw meal' ? 0.2 : 0.15;
  return { CaO: 42.6 + gauss() * sd + lt * 0.11 + xb, SiO2: 14.0 + gauss() * 0.12, Al2O3: 3.5 + gauss() * 0.06, Fe2O3: 2.2 + gauss() * 0.05, MgO: 1.9 + gauss() * 0.1, SO3: 0.35, K2O: 0.65, Na2O: 0.18, LOI: 35.2 + gauss() * 0.15 };
}

function makeParams(inst, stage, plant, line, grade) {
  const r = (v, d = 2) => round(v, d);
  switch (inst) {
    case 'xrf': {
      const o = oxides(stage, plant, line);
      const total = Object.values(o).reduce((a, b) => a + b, 0);
      const out = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v)]));
      const extra = stage === 'Hot meal' ? { Calcination: r(92.5 + gauss() * 0.8 + SC.bias(plant, line, 'lab:calc'), 1) } : {};
      return { ...out, LSF: r(lsfOf(o), 1), SM: r(o.SiO2 / (o.Al2O3 + o.Fe2O3)), AM: r(o.Al2O3 / o.Fe2O3), Total: r(total), ...extra };
    }
    case 'xrd': {
      if (stage === 'Cement') return { 'Gypsum dehydration': r(32 + gauss() * 5 + SC.bias(plant, line, 'lab:gypsumDehyd'), 0), Hemihydrate: r(0.9 + gauss() * 0.15), Dihydrate: r(2.4 + gauss() * 0.2) };
      const f = clamp(1.1 + SC.bias(plant, line, 'lab:fcao') + gauss() * 0.22, 0.2, 3.4);
      return { Alite: r(60.5 + SC.bias(plant, line, 'lab:c3s') + gauss() * 1.5, 1), Belite: r(15.2 + gauss() * 1.2 - SC.bias(plant, line, 'lab:c3s') * 0.5, 1), C3A: r(7.8 + gauss() * 0.5, 1), C4AF: r(11.5 + gauss() * 0.5, 1), 'Free lime': r(f), Periclase: r(1.2 + gauss() * 0.2) };
    }
    case 'psa': {
      const base = GRADE_BASE[grade] || GRADE_BASE['OPC 53'];
      return { Blaine: Math.round(base.blaine + gauss() * 6 + SC.bias(plant, line, 'lab:blaine')), D10: r(2.5 + gauss() * 0.2), D50: r(14 + gauss() * 0.8), D90: r(42 + gauss() * 2, 1), 'Band 3–30 µm': r(64 + gauss() * 1.5 + SC.bias(plant, line, 'lab:psdBand'), 1), 'R45': r(9 + gauss() * 0.8, 1) };
    }
    case 'cba': {
      const o = { CaO: 46 + gauss() * 1.1, SiO2: 7.4 + gauss() * 0.5, Al2O3: 1.9 + gauss() * 0.15, Fe2O3: 1.2 + gauss() * 0.1, MgO: (plant === 'JRB' ? 2.8 : 2.1) + gauss() * 0.3 };
      // Predicts raw-meal CaO from the true mix (no XRF bias), so the S1 residual emerges on its own.
      const predRm = 42.6 + SC.bias(plant, null, 'lab:lsfTrue') * 0.11 + gauss() * 0.08;
      return { ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v)])), 'Predicted raw-meal CaO': r(predRm), 'Belt load': Math.round(820 + gauss() * 60) };
    }
    case 'cal': {
      const fuel = pick(['Coal', 'Petcoke', 'Coal', 'AFR (RDF)']);
      const gcv = { Coal: 5900, Petcoke: 8150, 'AFR (RDF)': 3600 }[fuel] + gauss() * 120;
      const s = { Coal: 0.8, Petcoke: 3.8, 'AFR (RDF)': 0.4 }[fuel] + (fuel === 'Petcoke' ? SC.bias(plant, null, 'lab:fuelS') : 0);
      const prelim = fuel === 'Petcoke' && SC.isActive('S3', plant);
      return { Fuel: fuel, Basis: prelim ? 'ADB (preliminary)' : 'ARB', GCV: Math.round(gcv + (prelim ? 200 : 0)), NCV: Math.round(gcv - 260 + (prelim ? 380 : 0)), 'Sulphur': r(s), Moisture: r(fuel === 'AFR (RDF)' ? 14 : 6 + gauss() * 1, 1) };
    }
    case 'mic': {
      if (stage === 'Slag') return { 'Glass content': r(93 + gauss() * 1.2 + SC.bias(plant, line, 'g:SLAG_GLASS'), 1), Moisture: r(8 + gauss() * 0.8 + SC.bias(plant, line, 'g:SLAG_MOIST'), 1) };
      return { 'Alite size (AS)': r(24 + gauss() * 2.2, 1), 'Alite birefringence (AB)': r(0.0085 + gauss() * 0.0005, 4), 'Belite colour (BC rank)': Math.round(clamp(3 + gauss() * 0.4, 1, 4)), 'Ono 28-day estimate': r(41 + gauss() * 1.4, 1) };
    }
    case 'ctm': {
      const base = GRADE_BASE[grade] || GRADE_BASE['OPC 53'];
      const age = pick([1, 3, 7, 28]);
      const mu = { 1: base.s3 * 0.55, 3: base.s3, 7: base.s7, 28: base.s28 }[age]; // no live bias: these cubes were cast days ago
      const cubes = [0, 1, 2].map(() => r(mu + gauss() * mu * 0.02, 1));
      const m = mean(cubes);
      const cv = (Math.sqrt(cubes.reduce((s, x) => s + (x - m) ** 2, 0) / 2) / m) * 100;
      return { Grade: grade, 'Age (days)': age, 'Cube 1': cubes[0], 'Cube 2': cubes[1], 'Cube 3': cubes[2], Mean: r(m, 1), 'CV %': r(cv, 1) };
    }
    default: return {};
  }
}

function specFor(inst, stage, params, grade) {
  if (inst === 'xrf' && params.Total && (params.Total < 98 || params.Total > 101.5)) return { ok: false, note: `Oxide + LOI total ${params.Total}% outside 98.0–101.5%` };
  if (inst === 'xrf' && stage === 'Kiln feed' && Math.abs(params.LSF - 95) > 1.5) return { ok: false, note: `Kiln feed LSF ${params.LSF} outside 95.0 ± 1.5` };
  if (inst === 'xrd' && params['Free lime'] != null && (params['Free lime'] > 1.5 || params['Free lime'] < 0.5)) return { ok: false, note: `Free lime ${params['Free lime']}% outside 0.5–1.5%` };
  if (inst === 'xrd' && params['Gypsum dehydration'] > 65) return { ok: false, note: `Gypsum dehydration ${params['Gypsum dehydration']}% (false-set risk)` };
  if (inst === 'psa' && grade && params.Blaine < BIS[grade].blaineMin + 40) return { ok: false, note: `Blaine ${params.Blaine} m²/kg close to the ${grade} limit` };
  if (inst === 'xrf' && stage === 'Hot meal' && params.SO3 > 3.5) return { ok: false, note: `Hot meal SO₃ ${params.SO3}% above 3.5% — cyclone build-up risk` };
  if (inst === 'cal' && String(params.Basis).startsWith('ADB')) return { ok: false, note: 'Preliminary ADB result — sulphur/moisture correction pending' };
  if (inst === 'mic' && params.Moisture > 12) return { ok: false, note: `Slag moisture ${params.Moisture}% above 12%` };
  if (inst === 'cal' && params.Sulphur > 4) return { ok: false, note: `Fuel sulphur ${params.Sulphur}% above 4.0% blend cap` };
  if (inst === 'mic' && params['Glass content'] != null && params['Glass content'] < 85) return { ok: false, note: `Slag glass ${params['Glass content']}% below 85%` };
  if (inst === 'ctm' && params['CV %'] > 5) return { ok: false, note: `Cube CV ${params['CV %']}% — re-test` };
  return { ok: true, note: 'Within limits' };
}

function newSample(plant, inst, at = Date.now(), forcedStage = null) {
  const def = INSTRUMENTS[inst];
  const stage = forcedStage || (plant.type === 'grinding' && inst === 'mic' ? 'Slag' : pick(def.stages));
  const line = plant.kilns.length ? pick(plant.kilns).id : 'CM1';
  const lineCode = stage === 'Cement' || plant.type === 'grinding' ? pick(plant.mills).id : line;
  const grade = pick(plant.grades);
  const tat = { xrf: 14, xrd: 22, psa: 18, cba: 1, cal: 45, mic: 90, ctm: 12 }[inst] * (0.7 + rnd() * 0.7);
  const sampled = at - tat * 60 * 1000 - rnd() * 5 * 60 * 1000;
  const params = makeParams(inst, stage, plant.id, stage === 'Cement' || stage === 'Slag' ? lineCode : line, grade);
  const spec = specFor(inst, stage, params, grade);
  lab.seq += 1;
  return {
    id: `S-${lab.seq}`,
    barcode: `${plant.id}-${STAGE_CODE[stage]}-${lineCode}-${ymd(new Date(sampled))}-${pad(lab.seq % 10000, 4)}`,
    plant: plant.id, instrument: inst, instrumentName: def.short, stage, line: lineCode, grade: ['Cement', 'Slag'].includes(stage) || inst === 'ctm' ? grade : null,
    sampledAt: new Date(sampled).toISOString(), receivedAt: new Date(sampled + tat * 0.3 * 60000).toISOString(), analyzedAt: new Date(at).toISOString(),
    tatMin: round(tat, 0), params, qc: spec.ok ? 'VALID' : 'REVIEW', spec,
  };
}

function seedSamples() {
  const now = Date.now();
  for (let i = 160; i > 0; i--) {
    const p = pick(PLANTS);
    lab.samples.unshift(newSample(p, pick(LAB_FOR[p.type]), now - i * 45 * 1000));
  }
  lab.samples.reverse();
}

// Instruments and stages that carry each scenario's evidence — sampled more often while it is live.
const EVIDENCE = { S1: [['xrf', 'Raw meal'], ['cba', 'Limestone']], S2: [['xrf', 'Kiln feed']], S3: [['xrf', 'Hot meal'], ['cal', 'Fuel']], S4: [['xrd', 'Clinker'], ['mic', 'Clinker']], S5: [['xrd', 'Cement']], S6: [['mic', 'Slag'], ['psa', 'Cement']] };

function tick(blocked = () => false) {
  for (const s of SC.active) {
    const ev = EVIDENCE[s.key];
    if (!ev || s.level < 0.3 || rnd() > 0.18) continue;
    const [inst, stage] = pick(ev);
    if (!blocked(s.plant, inst)) lab.samples.unshift(newSample(byId[s.plant], inst, Date.now(), stage));
  }
  if (rnd() < 0.55) {
    const p = pick(PLANTS);
    const inst = pick(LAB_FOR[p.type]);
    if (!blocked(p.id, inst)) {
      lab.samples.unshift(newSample(p, inst));
      if (lab.samples.length > 400) lab.samples.length = 400;
    }
  }
  for (const k of Object.keys(lab.crm)) {
    const [pid, inst] = k.split('-');
    const target = 36 + (inst === 'xrf' ? SC.bias(pid, null, 'lab:crmDrift') : 0);
    lab.crm[k] = clamp(ar1(lab.crm[k], target, 3, 0.9), 5, 99);
  }
}

/* ── Genealogy ──────────────────────────────────────────────────────────── */
function genealogy(batchId) {
  const b = lab.batches.find((x) => x.id === batchId);
  if (!b) return null;
  const v = batchView(b);
  const src = byId[b.clinkerPlant];
  const lots = b.lots.map((l) => {
    const c = lab.clinkerLots.find((x) => x.id === l.id);
    const kf = { id: c.id.replace('CL-', 'KF-'), lsf: round(c.lsf + gauss() * 0.2, 2), sm: round(2.46 + gauss() * 0.04, 2), am: round(1.58 + gauss() * 0.03, 2), h: round(7.4 + gauss() * 0.5, 1) };
    const rm = { id: c.id.replace('CL-', 'RM-'), lsf: round(kf.lsf + gauss() * 1.4, 1), r90: round(14 + gauss() * 1.2, 1) };
    const pile = { id: `LS-${src.id}-PILE-${String.fromCharCode(65 + (c.day % 4))}`, cao: round(46 + gauss() * 0.6, 2), mgo: round((src.id === 'JRB' ? 2.8 : 2.1) + gauss() * 0.2, 2), days: 5 + (c.day % 3) };
    const fuel = { id: `FU-${src.id}-RAKE-${(c.day * 7) % 97}`, type: c.day % 3 === 0 ? 'Petcoke' : 'Coal', ncv: Math.round(c.day % 3 === 0 ? 7900 : 5650 + gauss() * 80), s: round(c.day % 3 === 0 ? 3.7 : 0.8, 1) };
    return { ...l, clinker: c, kilnWindow: { from: new Date(new Date(c.date).getTime() + 2 * 3600e3).toISOString(), lagMin: Math.round(40 + rnd() * 15), bzt: c.bzt, sat: c.sat, quench: c.quench }, kf, rm, pile, fuel };
  });
  const scm = b.scm > 10 ? { kind: b.grade === 'PSC' ? 'GBFS' : 'Fly ash', id: `SCM-${b.plant}-${b.grade === 'PSC' ? 'GBFS' : 'FA'}-${b.day % 9}`, pct: b.scm, quality: b.grade === 'PSC' ? `Glass ${round(92 + gauss(), 1)}%` : `Fineness ${Math.round(330 + gauss() * 10)} m²/kg` } : null;
  return {
    batch: v, src: { id: src.id, name: src.name }, lots, scm,
    residence: [
      { from: 'Limestone pile', to: 'Raw meal', lag: '3–7 days (pre-blend build/reclaim)', method: 'Mass-weighted lot genealogy' },
      { from: 'Raw meal', to: 'Kiln feed', lag: '8–12 h (CF silo, EWMA)', method: 'EWMA on silo inventory' },
      { from: 'Kiln feed', to: 'Clinker', lag: '60–90 min (preheater + kiln + cooler)', method: 'Plug flow, scaled by kiln speed' },
      { from: 'Clinker', to: 'Cement', lag: b.plant === b.clinkerPlant ? '1–3 days (clinker silo)' : '7–14 days (rail rake to grinding unit)', method: b.plant === b.clinkerPlant ? 'Mass-weighted lot genealogy' : 'Rail manifest' },
      { from: 'Cement', to: '28-day result', lag: '28 days after casting', method: 'Anchored on grinding date, never test date' },
    ],
  };
}

module.exports = { lab, seedHistory, seedSamples, tick, batchView, genealogy, bogue, lsfOf, DAYS };
