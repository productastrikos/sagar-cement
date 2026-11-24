// Per-KPI, per-plant history: 720 hourly points (30 days) and 730 daily points
// (2 years, so a 1-year horizon still has a previous period). The last point of
// both series is the KPI's live value, so a card and its drawer always agree.

const { PLANTS } = require('../domain/plants');
const SC = require('../sim/scenarios');
const { ar1, clamp, gauss, istHour, DAY, HOUR } = require('../sim/util');

const H = 720; const D = 730;
const store = {}; // kpiId → plantId → { hourly:[], daily:[], hourAnchor, dayAnchor }

const DIURNAL = {
  solar: (h) => (h >= 7 && h <= 17 ? Math.sin(((h - 7) / 10) * Math.PI) : -0.25),
  peak: (h) => ((h >= 6 && h < 10) || (h >= 18 && h < 22) ? 1 : h >= 10 && h < 16 ? -0.6 : -0.2),
  day: (h) => Math.sin(((h - 4) / 24) * 2 * Math.PI),
};

const baseOf = (def, pid) => (typeof def.base === 'object' ? def.base[pid] ?? def.base.default : def.base);
const diurnal = (def, h) => (def.diurnal ? DIURNAL[def.diurnal[0]](h) * def.diurnal[1] : 0);
const plantsFor = (def) => PLANTS.filter((p) => (def.plants ? def.plants.includes(p.id) : def.scope === 'all' || !def.scope || p.type === def.scope));

function gen(def, p) {
  // hourFn(plantId, hourOfDay) lets a KPI's history follow the same model as its live value.
  const hourly24 = def.hourFn ? Array.from({ length: 24 }, (_, hh) => def.hourFn(p.id, hh)) : null;
  const mu = hourly24 ? hourly24.reduce((x, y) => x + y, 0) / 24 : baseOf(def, p.id);
  const sdD = def.sd ?? Math.abs(mu) * 0.02;
  const phi = def.phi ?? 0.8;
  const lo = def.lo ?? -Infinity; const hi = def.hi ?? Infinity;
  // Generated backwards from today: the most recent history sits on today's level
  // (≈ the live value), and older history wanders — so charts never jump at NOW
  // unless a scenario genuinely moved the live value.
  const targetAt = (ago) => {
    const ev = (def.events || []).find((e) => e.plant === p.id && ago <= e.from && ago >= e.to);
    return mu + (def.trend || 0) * ago + (ev ? ev.delta : 0);
  };
  const daily = new Array(D);
  let v = targetAt(0);
  daily[D - 1] = clamp(v, lo, hi);
  for (let i = D - 2; i >= 0; i--) {
    v = ar1(v, targetAt(D - 1 - i), sdD, phi);
    daily[i] = clamp(v, lo, hi);
  }
  const hNow = istHour();
  const hourly = new Array(H);
  let noise = 0;
  for (let i = H - 1; i >= 0; i--) {
    const ago = H - 1 - i;
    const day = daily[D - 1 - Math.floor((ago + (23 - hNow)) / 24)] ?? mu;
    const hod = ((hNow - ago) % 24 + 24) % 24;
    if (i < H - 1) noise = ar1(noise, 0, def.hsd ?? sdD * 0.5, 0.7);
    hourly[i] = (clamp(hourly24 ? hourly24[hod] + (day - mu) + noise : day + diurnal(def, hod) + noise, lo, hi));
  }
  return { hourly, daily, hourAnchor: Math.floor(Date.now() / HOUR), dayAnchor: Math.floor(Date.now() / DAY), noise: 0 };
}

function ensure(def) {
  if (store[def.id]) return;
  store[def.id] = {};
  for (const p of plantsFor(def)) store[def.id][p.id] = gen(def, p);
}

function current(def, pid) {
  const s = store[def.id]?.[pid];
  return s ? s.hourly[s.hourly.length - 1] : null;
}

function tick(defs) {
  const hourNow = Math.floor(Date.now() / HOUR);
  const dayNow = Math.floor(Date.now() / DAY);
  const h = istHour();
  for (const def of defs) {
    ensure(def);
    for (const p of plantsFor(def)) {
      const s = store[def.id][p.id];
      if (hourNow !== s.hourAnchor) { s.hourly.push(s.hourly[s.hourly.length - 1]); s.hourly.shift(); s.hourAnchor = hourNow; }
      if (dayNow !== s.dayAnchor) { s.daily.push(s.daily[s.daily.length - 1]); s.daily.shift(); s.dayAnchor = dayNow; }
      let v;
      const live = def.live ? def.live(p.id) : null;
      if (live != null && Number.isFinite(live)) v = live;
      else {
        const bias = SC.bias(p.id, null, `k:${def.id}`);
        const mu = s.daily[s.daily.length - 2] ?? baseOf(def, p.id);
        if (def.grain === 'rec') {
          s.noise = ar1(s.noise, 0, (def.sd ?? Math.abs(mu) * 0.02) * 0.08, 0.98);
          v = mu + s.noise + bias;
        } else {
          s.noise = ar1(s.noise, 0, def.hsd ?? (def.sd ?? Math.abs(mu) * 0.02) * 0.5, 0.85);
          v = mu + diurnal(def, h) + s.noise + bias;
        }
      }
      v = clamp(v, def.lo ?? -Infinity, def.hi ?? Infinity);
      s.hourly[s.hourly.length - 1] = v;
      s.daily[s.daily.length - 1] = v;
    }
  }
}

module.exports = { store, ensure, current, tick, plantsFor, baseOf, H, D };
