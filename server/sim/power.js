// Power automation and energy: feeder loads, multi-source supply (WHRS, solar,
// wheeled hydro, CPP, grid), the 15-minute sliding-window MD predictor, power
// quality, and the 24-hour merit-order / ToD dispatch optimiser (brief §2).

const { PLANTS, byId, cementTph } = require('../domain/plants');
const { FEEDERS_INTEGRATED, FEEDERS_GRINDING } = require('../domain/catalog');
const { rateAt, SOURCE_COST, STATE_TARIFFS } = require('../domain/tariffs');
const SC = require('./scenarios');
const { clamp, round, gauss, ar1, istHour, istMonth } = require('./util');

const power = {};
const MD_SAMPLES = 30; // one sample per tick; shown as a 15-minute window at 30 s spacing

/** Solar output fraction by IST hour (clear-sky bell, ~19% daily capacity factor). */
const solarFrac = (h) => (h < 6 || h >= 18 ? 0 : 0.62 * Math.sin(((h - 6 + 0.5) / 12) * Math.PI));
const baseLoadMw = (p) => (p.secBase * cementTph(p)) / 1000;

function supplyAt(p, hour, loadMw, opts = {}) {
  const pw = p.power;
  const month = istMonth();
  const tariff = rateAt(p.state, pw.gridKv, hour, month);
  const whrs = pw.whrsMw * (opts.whrsFrac ?? 0.5);
  const solar = pw.solarMw * solarFrac(hour) * (opts.solarPr ?? 1);
  const hydro = pw.hydroMw * 0.24;
  const green = whrs + solar + hydro;
  let cpp = 0;
  if (pw.cppOnline && pw.cppMw) {
    const want = pw.cppMw * (tariff.rate >= SOURCE_COST.CPP ? 0.9 : 0.55);
    cpp = clamp(Math.min(want, loadMw - green - loadMw * 0.08), 0, pw.cppMw);
  }
  const grid = Math.max(0, loadMw - green - cpp);
  const cost = (whrs * SOURCE_COST.WHRS + solar * SOURCE_COST.Solar + hydro * SOURCE_COST.Hydro + cpp * SOURCE_COST.CPP) * 1000
    + grid * 1000 * tariff.rate / (tariff.unit === 'kVAh' ? (opts.pf ?? 0.98) : 1);
  return { hour, slot: tariff.slot, slotLabel: tariff.slotLabel, rate: tariff.rate, unit: tariff.unit, load: loadMw, WHRS: whrs, Solar: solar, Hydro: hydro, CPP: cpp, Grid: grid, costRs: cost };
}

function init() {
  for (const p of PLANTS) {
    const feeders = (p.type === 'integrated' ? FEEDERS_INTEGRATED : FEEDERS_GRINDING).map((f) => ({ ...f, kw: 0, pf: 0.975, thd: f.vfd ? 7.2 : 3.1, rescheduled: false }));
    power[p.id] = {
      loadMw: baseLoadMw(p), feeders, md: [], projected: 0, pf: p.id === 'DCP' ? 0.972 : 0.982, thdV: p.id === 'DCP' ? 3.4 : 2.5,
      trafoLoad: 0, trafoTemp: 62, supply: null, rampMw: 0, whrsFrac: 0.5, solarPr: p.id === 'GDP' ? 0.74 : 0.8,
    };
    const st = power[p.id];
    for (let i = 0; i < MD_SAMPLES; i++) { stepPlant(p, st); }
  }
}

function stepPlant(p, st) {
  const hour = istHour();
  // E1: mills ramp toward 122% of contract demand over ~3 minutes unless people act.
  let rampMw = 0;
  const e1 = SC.active.find((a) => a.key === 'E1' && a.plant === p.id);
  if (e1) {
    const base = supplyAt(p, hour, baseLoadMw(p), { pf: st.pf, solarPr: st.solarPr });
    const targetGrid = (1.22 * p.power.cmdKva * st.pf) / 1000;
    const full = Math.max(3, targetGrid - base.Grid);
    const prog = clamp((Date.now() - e1.startedAt) / (100 * 1000), 0, 1);
    rampMw = full * prog * (1 - e1.applied.size / SC.DEFS.E1.actions.length);
    st.feeders.forEach((f) => { if (f.key === 'cm2') f.rescheduled = e1.applied.size > 0; });
  }
  st.rampMw += (rampMw - st.rampMw) * 0.5;
  const load = clamp(ar1(st.loadMw, baseLoadMw(p), baseLoadMw(p) * 0.012, 0.85), baseLoadMw(p) * 0.9, baseLoadMw(p) * 1.1);
  st.loadMw = load;
  const resch = st.feeders.find((f) => f.rescheduled);
  const totalMw = load + st.rampMw - (resch ? load * resch.share : 0);
  st.whrsFrac = clamp(ar1(st.whrsFrac, 0.5, 0.03, 0.9), 0.35, 0.62);
  const sup = supplyAt(p, hour, totalMw, { pf: st.pf, whrsFrac: st.whrsFrac, solarPr: st.solarPr / 0.8 });
  st.supply = sup;
  st.feeders.forEach((f) => {
    const extra = ['rawmill', 'cm1', 'cm2'].includes(f.key) && st.rampMw > 0 ? st.rampMw / 3 : 0;
    f.kw = f.rescheduled ? 0 : Math.max(0, (load * f.share + extra) * 1000 * (1 + gauss() * 0.02));
    f.pf = clamp(ar1(f.pf, f.vfd ? 0.968 : 0.982, 0.004, 0.8), 0.9, 0.999);
    f.thd = clamp(ar1(f.thd, f.vfd ? 7.4 : 3.0, 0.3, 0.8), 1, 14);
  });
  st.pf = clamp(ar1(st.pf, p.id === 'DCP' ? 0.972 : 0.982, 0.002, 0.85), 0.9, 0.999);
  st.thdV = clamp(ar1(st.thdV, p.id === 'DCP' ? 3.4 : 2.5, 0.12, 0.85), 1, 8);
  const gridKva = (sup.Grid * 1000) / st.pf;
  const pct = (gridKva / p.power.cmdKva) * 100;
  st.md.push(round(pct, 1));
  if (st.md.length > MD_SAMPLES) st.md.shift();
  const last = st.md.slice(-8);
  const slope = last.length > 1 ? (last[last.length - 1] - last[0]) / (last.length - 1) : 0;
  const recent = st.md.slice(-10);
  st.projected = round(clamp(recent.reduce((a, b) => a + b, 0) / recent.length + slope * 12, 0, 200), 1);
  st.trafoLoad = round(clamp((gridKva / (p.power.cmdKva * 1.25)) * 100, 0, 140), 1);
  st.trafoTemp = round(ar1(st.trafoTemp, 48 + 42 * (st.trafoLoad / 100) ** 2, 0.6, 0.9), 1);
}

function tick() { for (const p of PLANTS) stepPlant(p, power[p.id]); }

/** MD forecast for the rest of the window (straight-line from the recent slope). */
function mdForecast(plantId) {
  const st = power[plantId];
  const last = st.md.slice(-8);
  const slope = last.length > 1 ? (last[last.length - 1] - last[0]) / (last.length - 1) : 0;
  const now = st.md[st.md.length - 1];
  return Array.from({ length: 12 }, (_, i) => round(clamp(now + slope * (i + 1), 0, 200), 1));
}

/** Rupee exposure of a projected MD breach, per state rules (brief §2). */
function mdExposure(p, projectedPct) {
  const t = STATE_TARIFFS[p.state];
  const cmd = p.power.cmdKva;
  const month = istMonth();
  const slot = rateAt(p.state, p.power.gridKv, istHour(), month).slot;
  if (projectedPct <= 100) return { rs: 0, text: 'No penalty — projected demand stays inside contract demand' };
  const excessKva = ((projectedPct - 100) / 100) * cmd;
  const kva = Math.round(excessKva).toLocaleString('en-IN');
  const monthKwh = baseLoadMw(p) * 1000 * 720 * 0.75;
  const rate = rateAt(p.state, p.power.gridKv, 19, month).rate;
  if (p.state === 'MP') {
    if (projectedPct <= 120) return { rs: 0, text: 'MPERC: no penalty between 100% and 120% of CMD' };
    const mult = projectedPct > 130 ? 1 : 0.3;
    return { rs: Math.round(excessKva * t.demandPerKva * mult), text: `MPERC: excess ${kva} kVA billed at ${projectedPct > 130 ? '2×' : '1.3×'} fixed charge (₹${t.demandPerKva}/kVA)` };
  }
  if (p.state === 'OD') {
    if (projectedPct <= 120 && slot !== 'peak') return { rs: 0, text: 'OERC: penalty-free up to 120% of CD outside the peak slot' };
    return { rs: Math.round(excessKva * t.demandPerKva), text: `OERC: excess ${kva} kVA billed at 2× demand charge (₹${t.demandPerKva}/kVA)${slot === 'peak' ? ' — the breach falls in the peak slot' : ''}` };
  }
  let rs = excessKva * t.demandPerKva;
  let text = `${t.regulator}: excess ${kva} kVA billed at 2× demand charge (₹${t.demandPerKva}/kVA)`;
  if (projectedPct > 120) {
    if (p.state === 'TG') { rs += monthKwh * rate * (projectedPct > 200 ? 0.2 : 0.15); text += ', plus a 15% surcharge on the whole month\u2019s energy (above 120% CMD)'; }
    else { rs += monthKwh * rate * ((projectedPct - 120) / projectedPct) * 0.5; text += ', plus the excess energy share billed at 1.5× (above 120% CMD)'; }
  }
  return { rs: Math.round(rs), text };
}

/** 24-hour dispatch: baseline (mills flat) vs ToD-optimised (shift N mill-hours out of peak). */
function dispatchDay(plantId, shiftHours = 0) {
  const p = byId[plantId];
  const st = power[plantId];
  const load = baseLoadMw(p);
  const millShare = st.feeders.filter((f) => f.shiftable && f.key.startsWith('cm')).reduce((s, f) => s + f.share, 0);
  const millMw = load * millShare; // mills assumed at 80% average with 25% headroom
  const rows = Array.from({ length: 24 }, (_, h) => ({ h, base: supplyAt(p, h, load * (1 + 0.015 * Math.sin(h / 3.8)), { pf: st.pf, solarPr: st.solarPr / 0.8 }) }));
  const peakHours = rows.filter((r) => r.base.slot === 'peak').sort((a, b) => b.base.rate - a.base.rate);
  const cheapHours = rows.filter((r) => r.base.slot !== 'peak').sort((a, b) => a.base.rate - b.base.rate);
  const shiftMwh = Math.min(shiftHours * millMw, peakHours.length * millMw);
  const headroom = millMw * 0.25;
  const adj = new Array(24).fill(0);
  let remove = shiftMwh;
  for (const r of peakHours) { const take = Math.min(millMw, remove); adj[r.h] -= take; remove -= take; if (remove <= 0) break; }
  let add = shiftMwh - remove;
  for (const r of cheapHours) { const put = Math.min(headroom, add); adj[r.h] += put; add -= put; if (add <= 0) break; }
  const moved = shiftMwh - remove - add;
  const out = rows.map((r) => {
    const opt = supplyAt(p, r.h, r.base.load + adj[r.h], { pf: st.pf, solarPr: st.solarPr / 0.8 });
    return { hour: r.h, slot: r.base.slot, slotLabel: r.base.slotLabel, rate: r.base.rate, base: r.base, opt };
  });
  const sum = (k, which) => out.reduce((s, r) => s + r[which][k], 0);
  const gridPeak = (which) => out.filter((r) => r.slot === 'peak').reduce((s, r) => s + r[which].Grid, 0);
  const baseCost = sum('costRs', 'base'); const optCost = sum('costRs', 'opt');
  const totalLoad = sum('load', 'base');
  const greenMwh = sum('WHRS', 'base') + sum('Solar', 'base') + sum('Hydro', 'base');
  return {
    plant: plantId, shiftHours, movedMwh: round(moved, 1), millMw: round(millMw, 1),
    rows: out.map((r) => ({
      hour: r.hour, slot: r.slot, slotLabel: r.slotLabel, rate: r.rate,
      base: Object.fromEntries(['load', 'WHRS', 'Solar', 'Hydro', 'CPP', 'Grid', 'costRs'].map((k) => [k, round(r.base[k], 2)])),
      opt: Object.fromEntries(['load', 'WHRS', 'Solar', 'Hydro', 'CPP', 'Grid', 'costRs'].map((k) => [k, round(r.opt[k], 2)])),
    })),
    baseCostLakh: round(baseCost / 1e5, 2), optCostLakh: round(optCost / 1e5, 2),
    savingsLakhDay: round((baseCost - optCost) / 1e5, 2), savingsCrYear: round(((baseCost - optCost) * 330) / 1e7, 2),
    blendedRate: round(baseCost / (totalLoad * 1000), 2), greenPct: round((greenMwh / totalLoad) * 100, 1),
    peakShareBase: round((gridPeak('base') / Math.max(0.01, sum('Grid', 'base'))) * 100, 1),
    peakShareOpt: round((gridPeak('opt') / Math.max(0.01, sum('Grid', 'opt'))) * 100, 1),
    co2AvoidedT: round(moved * 0.1, 1),
    constraint: `Limited by mill headroom (≈25% above the 80% average loading) and cement silo buffer (~30 h).`,
  };
}

module.exports = { power, init, tick, supplyAt, mdForecast, mdExposure, dispatchDay, baseLoadMw, solarFrac, MD_SAMPLES };
