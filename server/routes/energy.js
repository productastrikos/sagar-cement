// Energy API: group scorecard, power automation (SLD, MD predictor, power
// quality), ToD & merit-order dispatch, and sectional process efficiency.

const express = require('express');
const { PLANTS, byId, FLEET, cementTph } = require('../domain/plants');
const { STATE_TARIFFS, curve, rateAt, SOURCE_COST } = require('../domain/tariffs');
const I = require('../kpi/insight');
const { byKpi } = require('../kpi/registry');
const PW = require('../sim/power');
const PR = require('../sim/process');
const LAB = require('../sim/lab');
const SC = require('../sim/scenarios');
const ADV = require('../sim/advisory');
const { logAudit } = require('../sim/store');
const { round, istHour, istMonth } = require('../sim/util');

const router = express.Router();
const plantOf = (q, dflt) => (q.plant && byId[q.plant] ? q.plant : dflt);
const cards = (ids, f) => ids.map((id) => {
  const def = byKpi[id];
  if (f.plant && def && def.plants && !def.plants.includes(f.plant)) return null;
  if (f.plant && def && def.scope === 'integrated' && byId[f.plant].type !== 'integrated') return null;
  return I.card(id, f);
}).filter(Boolean);
const val = (id, plant) => I.currentValue(byKpi[id], plant ? { plant } : {});

/* ── Energy scorecard ──────────────────────────────────────────────────── */
router.get('/energy', (req, res) => {
  const p = plantOf(req.query);
  const target = (label, id, fy27, fy30, unit, goodUp) => ({ label, id, current: round(val(id, p), byKpi[id].dp), fy27, fy30, unit, goodUp });
  res.json({
    cards: cards(['e.pfCostT', 'e.powerCost', 'e.sec', 'e.shc', 'e.green', 'e.tsr', 'e.co2', 'e.whrs', 'e.clinkerPower', 'e.grindPower'], { plant: p }),
    targets: [
      target('Green power share', 'e.green', FLEET.greenTargetFy27, FLEET.greenTargetFy30, '%', true),
      target('Electrical SEC', 'e.sec', FLEET.secTargetFy27, FLEET.secTargetFy30, 'kWh/t', false),
      target('Thermal SHC', 'e.shc', null, FLEET.shcTargetFy30, 'kcal/kg', false),
      target('Thermal substitution', 'e.tsr', FLEET.tsrTargetFy27, FLEET.tsrTargetFy30, '%', true),
      target('Scope 1+2 CO₂', 'e.co2', FLEET.co2TargetFy27, null, 'kg/t', false),
    ],
    plants: PLANTS.map((pl) => {
      const s = PW.power[pl.id].supply;
      return {
        id: pl.id, name: pl.name, state: pl.state, type: pl.type, loadMw: round(s.load, 1),
        sec: round(val('e.sec', pl.id), 1), shc: pl.type === 'integrated' ? Math.round(val('e.shc', pl.id)) : null, green: round(val('e.green', pl.id), 1),
        powerCost: round(val('e.powerCost', pl.id), 2), pfCost: Math.round(val('e.pfCostT', pl.id)), co2: Math.round(val('e.co2', pl.id)),
        mix: { Grid: round(s.Grid, 2), CPP: round(s.CPP, 2), WHRS: round(s.WHRS, 2), Solar: round(s.Solar, 2), Hydro: round(s.Hydro, 2) },
        assets: pl.power, slot: s.slotLabel, rate: s.rate, unit: s.unit,
      };
    }),
    trend: { sec: I.insight('e.sec', { tf: '1Y', filters: p ? { plant: p } : {} }).series, green: I.insight('e.green', { tf: '30D', filters: p ? { plant: p } : {} }).series },
    compliance: [
      { label: 'BEE PAT', text: 'Mattampally (PAT-2) and Gudipadu (PAT-5) met targets; Andhra Cements is a PAT-3 designated consumer; Bayyavaram notified.' },
      { label: 'ISO 50001:2018', text: 'Certified across SCL plants — initial 20 Jun 2024, recertified 4 Jan 2026.' },
      { label: 'SBTi', text: 'First Indian cement company with validated net-zero 2050 targets; CDP B; CRISIL ESG 53.' },
    ],
  });
});

/* ── Power automation ──────────────────────────────────────────────────── */
router.get('/power', (req, res) => {
  const p = plantOf(req.query, 'DCP');
  const pl = byId[p];
  const st = PW.power[p];
  const s = st.supply;
  const t = STATE_TARIFFS[pl.state];
  const gridKva = (s.Grid * 1000) / st.pf;
  const e1 = SC.active.find((a) => a.key === 'E1' && a.plant === p);
  const hour = istHour();
  const slots = curve(pl.state, pl.power.gridKv, istMonth());
  const next = slots.slice(hour + 1).concat(slots).find((x) => x.slot !== s.slot);
  const monthKwh = PW.baseLoadMw(pl) * 1000 * 720 * (s.Grid / Math.max(0.1, s.load));
  res.json({
    plant: p, plantName: pl.name, state: pl.stateName, regulator: t.regulator, category: t.category,
    cards: cards(['pw.md', 'pw.pf', 'pw.thd', 'pw.peakShare', 'pw.loadFactor', 'pw.trafo'], { plant: p }),
    sld: {
      incomer: { kv: pl.power.gridKv, kva: Math.round(gridKva), cmdKva: pl.power.cmdKva, pct: round((gridKva / pl.power.cmdKva) * 100, 1), pf: round(st.pf, 3), thd: round(st.thdV, 1) },
      transformer: { loadPct: st.trafoLoad, temp: st.trafoTemp, ratingKva: Math.round(pl.power.cmdKva * 1.25) },
      sources: [
        { key: 'Grid', mw: round(s.Grid, 2), status: 'online' },
        { key: 'CPP', mw: round(s.CPP, 2), status: pl.power.cppMw ? (pl.power.cppOnline ? 'online' : 'offline') : 'none', capacity: pl.power.cppMw },
        { key: 'WHRS', mw: round(s.WHRS, 2), status: pl.power.whrsMw ? 'online' : pl.power.whrsPlannedMw ? 'planned' : 'none', capacity: pl.power.whrsMw || pl.power.whrsPlannedMw || 0 },
        { key: 'Solar', mw: round(s.Solar, 2), status: pl.power.solarMw ? 'online' : 'none', capacity: pl.power.solarMw },
        { key: 'Hydro', mw: round(s.Hydro, 2), status: pl.power.hydroMw ? 'online' : 'none', capacity: pl.power.hydroMw },
      ],
      feeders: st.feeders.map((f, i) => ({ key: f.key, name: f.name, bus: i % 2 ? 'B' : 'A', kw: Math.round(f.kw), pf: round(f.pf, 3), thd: round(f.thd, 1), vfd: f.vfd, shiftable: f.shiftable, rescheduled: f.rescheduled, loadPct: round((f.kw / (PW.baseLoadMw(pl) * 1000 * f.share * 1.25)) * 100, 0) })),
    },
    md: { samples: st.md, forecast: PW.mdForecast(p), projected: st.projected, live: st.md[st.md.length - 1], exposure: PW.mdExposure(pl, st.projected), warnAt: 95, cmdKva: pl.power.cmdKva, note: 'Demo runs the 15-minute window 6× faster than real time (one sample per 5 s, plotted at 30 s spacing).' },
    e1: e1 ? { active: true, level: round(e1.level, 2), applied: e1.applied.size, of: SC.DEFS.E1.actions.length, advisoryId: `ADV-E1-${p}` } : { active: false },
    tariff: { slot: s.slotLabel, rate: s.rate, unit: s.unit, nextSlot: next ? `${next.slotLabel} at ${String(next.hour).padStart(2, '0')}:00 (₹${next.rate})` : null, mdRule: t.mdRule, pfRule: t.pfRule, demandPerKva: t.demandPerKva },
    kvahLossLakh: s.unit === 'kVAh' ? round((monthKwh * s.rate * (1 / st.pf - 1)) / 1e5, 2) : 0,
  });
});

router.post('/power/ramp', (req, res) => {
  const p = byId[req.body?.plant] ? req.body.plant : 'DCP';
  SC.start('E1', p);
  logAudit(req.user, 'Simulated peak-hour mill ramp', byId[p].name);
  res.json({ ok: true });
});

/* ── ToD & dispatch ────────────────────────────────────────────────────── */
router.get('/dispatch', (req, res) => {
  const p = plantOf(req.query, 'DCP');
  const shift = Math.max(0, Math.min(4, Number(req.query.shift ?? 4)));
  const pl = byId[p];
  const d = PW.dispatchDay(p, shift);
  res.json({
    plant: p, plantName: pl.name, state: pl.state, regulator: STATE_TARIFFS[pl.state].regulator,
    cards: cards(['ds.savings', 'pw.peakShare', 'e.powerCost', 'e.green', 'ds.solarPr', 'ds.cppHeatRate'], { plant: p }),
    dispatch: d, adopted: !!ADV.effects.todAdopted[p], sourceCost: SOURCE_COST,
    tariffs: ['TG', 'AP', 'MP', 'OD'].map((s) => ({ state: s, regulator: STATE_TARIFFS[s].regulator, unit: STATE_TARIFFS[s].unit, curve: curve(s, s === 'OD' || s === pl.state ? pl.power.gridKv : 132, istMonth()).map((x) => ({ hour: x.hour, rate: x.rate, slot: x.slot })) })),
    fleet: PLANTS.map((x) => { const dd = PW.dispatchDay(x.id, 4); return { id: x.id, name: x.name, state: x.state, savingsLakhDay: ADV.effects.todAdopted[x.id] ? 0 : dd.savingsLakhDay, savingsCrYear: dd.savingsCrYear, peakShare: dd.peakShareBase, adopted: !!ADV.effects.todAdopted[x.id] }; }),
    month: istMonth(),
    note: `${pl.stateName} tariff for ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][istMonth() - 1]} — ${pl.state === 'AP' ? 'a low-demand month, so the AP peak is ₹0.50 below the high-month rate' : 'slot rates per the FY 2026–27 order'}.`,
  });
});

router.post('/dispatch/adopt', (req, res) => {
  const p = byId[req.body?.plant] ? req.body.plant : 'DCP';
  ADV.effects.todAdopted[p] = true;
  logAudit(req.user, 'Adopted ToD grinding schedule', byId[p].name);
  res.json({ ok: true });
});

/* ── Process efficiency ────────────────────────────────────────────────── */
router.get('/efficiency', (req, res) => {
  const p = plantOf(req.query, 'MTP');
  const pl = byId[p];
  const integrated = pl.type === 'integrated';
  const v = (id) => val(id, p);
  const six = integrated && pl.kilns.some((k) => k.stages === 6);
  const sections = integrated ? [
    { section: 'Crusher', unit: 'kWh/t limestone', current: 0.62, best: 0.6, cii: 0.57 },
    { section: 'Raw mill', unit: 'kWh/t raw meal', current: 11.2, best: 10.9, cii: 10.6 },
    { section: 'Coal mill', unit: 'kWh/t coal', current: 22.4, best: 21.6, cii: 21.2 },
    { section: 'Up to clinkerisation', unit: 'kWh/t clinker', current: round(v('e.clinkerPower'), 1), best: round(v('e.clinkerPower') - 2.1, 1), cii: six ? 41.4 : 45.3 },
    { section: 'Preheater fan', unit: 'kWh/t clinker', current: round(v('ef.phFan'), 2), best: round(v('ef.phFan') - 0.3, 2), cii: 4.6 },
    { section: 'Cement grinding', unit: 'kWh/t cement', current: round(v('e.grindPower'), 1), best: round(v('e.grindPower') - 1.4, 1), cii: 22.3 },
  ] : [
    { section: 'Cement grinding', unit: 'kWh/t cement', current: round(v('e.grindPower'), 1), best: round(v('e.grindPower') - 1.4, 1), cii: 31.1 },
    { section: 'Packing', unit: 'kWh/t cement', current: 0.78, best: 0.72, cii: 0.7 },
    { section: 'Compressors', unit: 'kWh/t cement', current: 0.84, best: 0.76, cii: 0.7 },
  ];
  let heat = null; let falseAir = null;
  if (integrated) {
    const shc = v('e.shc');
    const fa = v('p.falseAir');
    const parts = [
      { key: 'Clinker formation (theoretical)', value: 412.5, kind: 'base' },
      { key: 'Preheater exhaust', value: six ? 112 : 140 },
      { key: 'Cooler vent & clinker heat', value: round(62 - (v('p.coolerEff') - 74) * 3, 1) },
      { key: 'Shell radiation', value: round(30 + Math.max(0, v('p.shell')) * 0.5, 1) },
      { key: 'False air penalty', value: round(fa * 3, 1) },
    ];
    const known = parts.reduce((s, x) => s + x.value, 0);
    parts.push({ key: 'Moisture, CO & other', value: round(Math.max(4, shc - known), 1) });
    heat = { shc: Math.round(shc), parts, best: six ? 670 : 694 };
    const clkTpd = PR.state[p].lines.reduce((s, L) => s + L.clinkerTpd, 0);
    const series = I.insight('p.falseAir', { tf: '24H', filters: { plant: p } }).series;
    falseAir = { current: round(fa, 1), costLakhDay: round((Math.max(0, fa - 5) * 3 * clkTpd * 1000 * 1.75) / 1000 / 1e5, 2), series };
  }
  const grind = LAB.lab.batches.filter((b) => b.plant === p && b.day < 90).map((b) => ({ x: b.blaine, y: b.millSec, grade: b.grade }));
  res.json({
    plant: p, plantName: pl.name, integrated,
    cards: integrated ? cards(['ef.phFan', 'p.falseAir', 'p.coolerEff', 'e.clinkerPower', 'e.grindPower', 'e.shc'], { plant: p }) : cards(['e.grindPower', 'e.sec', 'e.powerCost', 'q.gypsumDehyd'], { plant: p }),
    sections, heat, falseAir, grind,
    whrs: pl.power.whrsMw ? { mw: pl.power.whrsMw, kwPerTpd: round((pl.power.whrsMw * 1000) / pl.kilns.reduce((s, k) => s + k.tpd, 0), 2), kwhT: round(v('e.whrs') || 0, 1), cii: 43 } : null,
  });
});

module.exports = router;
