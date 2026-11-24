// Builds KPI card summaries and the KPI drawer payload (theme spec §8.16).
// Cards and drawers use the same series/aggregation rule, so the drawer's hero
// always equals the card value at the moment of opening.

const { byId } = require('../domain/plants');
const { byKpi, DIMS } = require('./registry');
const HIST = require('./history');
const { forecast } = require('./forecast');
const SC = require('../sim/scenarios');
const { hrand, round, clamp, mean, HOUR, DAY } = require('../sim/util');

const kpiDecisions = {}; // recId → { by, at }

const HZ = {
  '12H': { src: 'hourly', n: 12, b: 1, steps: 6, period: 24, len: '6 hours' },
  '24H': { src: 'hourly', n: 24, b: 1, steps: 8, period: 24, len: '8 hours' },
  '7D': { src: 'hourly', n: 28, b: 6, steps: 12, period: 4, len: '3 days' },
  '30D': { src: 'daily', n: 30, b: 1, steps: 7, period: 7, len: '7 days' },
  '90D': { src: 'daily', n: 90, b: 1, steps: 14, period: 7, len: '14 days' },
  '180D': { src: 'daily', n: 180, b: 1, steps: 30, period: 7, len: '30 days' },
  '1Y': { src: 'daily', n: 52, b: 7, steps: 9, period: 0, len: '60 days' },
};
const horizonsOf = (def) => (def.grain === 'rec' ? ['30D', '90D', '180D', '1Y'] : ['12H', '24H', '7D', '30D']);
const defaultTf = (def) => (def.grain === 'rec' ? '90D' : def.kind === 'sum' ? '24H' : '30D');

/* ── Formatting ─────────────────────────────────────────────────────────── */
function fmt(def, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: def.dp, maximumFractionDigits: def.dp });
}
function rag(def, v) {
  if (!def.th || v == null) return 'normal';
  const [w, c] = def.th;
  if (def.goodUp) return v <= c ? 'critical' : v < w ? 'warning' : 'normal';
  return v >= c ? 'critical' : v > w ? 'warning' : 'normal';
}
const RAG_TEXT = { normal: 'NORMAL', warning: 'WARNING', critical: 'CRITICAL' };
const threshText = (def) => (def.th ? `Normal ${def.goodUp ? '≥' : '≤'} ${fmt(def, def.th[0])}${def.unit && def.unit !== '' ? ' ' + def.unit : ''}` : 'Live');

/** §8.17 bounds: counts ≥ 0, percentages 0–100, unless the KPI says otherwise. */
function boundsOf(def) {
  const pct = def.unit === '%';
  return { lo: def.lo ?? (def.kind === 'sum' || pct ? 0 : -Infinity), hi: def.hi ?? (pct ? 100 : Infinity) };
}
/** Is an active scenario driving this KPI at the filtered plants? (forecast shock then persists) */
function scenarioDriving(def, filters) {
  const ids = plantsOf(def, filters);
  return SC.active.some((a) => ids.includes(a.plant) && a.level > 0.1 && SC.DEFS[a.key].biases[`k:${def.id}`] !== undefined);
}

/* ── Series ─────────────────────────────────────────────────────────────── */
function plantsOf(def, filters = {}) {
  const all = HIST.plantsFor(def).map((p) => p.id);
  return filters.plant ? all.filter((id) => id === filters.plant) : all;
}

function dimAdjust(def, arr, filters) {
  let out = arr;
  for (const [dim, val] of Object.entries(filters || {})) {
    if (dim === 'plant' || !val || !DIMS[dim] || !def.dims.includes(dim)) continue;
    const d = DIMS[dim];
    if (def.kind === 'sum') {
      const i = d.values.indexOf(val);
      const share = d.shares?.[i] ?? 1 / d.values.length;
      out = out.map((v) => v * share);
    } else {
      const r = (hrand(`${def.id}|${dim}|${val}`) - 0.5) * 2;
      if (def.goodUp && def.hi === 100) out = out.map((v) => clamp(100 - (100 - v) * (1 + r * 0.6), def.lo ?? 0, 100));
      else out = out.map((v) => clamp(v * (1 + r * (def.spread ?? 0.045)), def.lo ?? -Infinity, def.hi ?? Infinity));
    }
  }
  return out;
}

function aggregate(def, src, filters) {
  HIST.ensure(def);
  const ids = plantsOf(def, filters);
  if (!ids.length) return null;
  const len = src === 'hourly' ? HIST.H : HIST.D;
  const out = new Array(len).fill(0);
  let wsum = 0;
  for (const id of ids) {
    const s = HIST.store[def.id][id][src];
    const w = def.kind === 'sum' ? 1 : byId[id].cementMtpa;
    for (let i = 0; i < len; i++) out[i] += s[i] * w;
    wsum += w;
  }
  const agg = def.kind === 'sum' ? out : out.map((v) => v / wsum);
  return dimAdjust(def, agg, filters);
}

function currentValue(def, filters) {
  const a = aggregate(def, 'hourly', filters);
  return a ? a[a.length - 1] : null;
}

function bucketise(arr, n, b) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const end = arr.length - k * b;
    const slice = arr.slice(Math.max(0, end - b), end);
    out.push(slice.length ? mean(slice) : null);
  }
  return out;
}

const IST = 5.5 * HOUR;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function labelAt(ts, kind) {
  const d = new Date(ts + IST);
  const day = `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  if (kind === 'h') return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  if (kind === 'h6') return `${day} ${String(d.getUTCHours()).padStart(2, '0')}h`;
  return day;
}

function buildSeries(def, tf, filters) {
  const z = HZ[tf];
  const raw = aggregate(def, z.src, filters);
  if (!raw) return null;
  const cur = raw[raw.length - 1];
  const total = Math.min(Math.floor(raw.length / z.b), Math.max(z.n * 2, z.period * 2 + 1, 28));
  const all = bucketise(raw, total, z.b);
  all[all.length - 1] = cur;
  const actualH = all.slice(-z.n);
  const prevH = all.slice(-2 * z.n, -z.n);
  const fit = all.slice(-Math.max(z.n, z.period * 2 + 1, 14)); // +1: the profile is built from history excluding NOW
  const canForecast = actualH.length >= 6;
  const { lo: bLo, hi: bHi } = boundsOf(def);
  const fc = canForecast ? forecast(fit, z.steps, z.period, bLo, bHi, { phi: scenarioDriving(def, filters) ? 1 : 0.85 }) : null;
  const stepMs = z.src === 'hourly' ? z.b * HOUR : z.b * DAY;
  const kind = z.src === 'hourly' ? (z.b === 1 ? 'h' : 'h6') : 'd';
  const now = Date.now();
  const labels = [];
  for (let i = z.n - 1; i >= 0; i--) labels.push(labelAt(now - i * stepMs, kind));
  for (let h = 1; h <= z.steps; h++) labels.push(labelAt(now + h * stepMs, kind));
  const nowIndex = z.n - 1;
  const pad = (a) => [...a, ...new Array(z.steps).fill(null)];
  const r = (v) => (v == null ? null : round(v, def.dp + 1));
  const actual = pad(actualH.map(r));
  const previous = [...(prevH.length === z.n ? prevH : new Array(z.n).fill(null)), ...new Array(z.steps).fill(null)].map(r);
  const forecastArr = new Array(z.n + z.steps).fill(null);
  const lower = new Array(z.n + z.steps).fill(null);
  const upper = new Array(z.n + z.steps).fill(null);
  if (fc) {
    forecastArr[nowIndex] = r(cur); lower[nowIndex] = r(cur); upper[nowIndex] = r(cur);
    fc.f.forEach((v, i) => { forecastArr[nowIndex + 1 + i] = r(v); lower[nowIndex + 1 + i] = r(fc.lower[i]); upper[nowIndex + 1 + i] = r(fc.upper[i]); });
  }
  const mA = mean(actualH.filter((x) => x != null));
  const mP = prevH.length ? mean(prevH.filter((x) => x != null)) : null;
  const change = mP != null && mP !== 0 ? ((mA - mP) / Math.abs(mP)) * 100 : 0;
  const fEnd = fc ? fc.f[fc.f.length - 1] : cur;
  const lo = fc ? fc.lower[fc.lower.length - 1] : cur;
  const hi = fc ? fc.upper[fc.upper.length - 1] : cur;
  return {
    labels, actual, previous, forecast: forecastArr, lower, upper, nowIndex, canForecast,
    stats: { last: r(cur), change: round(change, 1), fEnd: r(fEnd), lo: r(lo), hi: r(hi), bandPct: round(fEnd ? (((hi - lo) / 2) / Math.abs(fEnd)) * 100 : 0, 1), horizon: z.len, endLabel: labels[labels.length - 1] },
  };
}

/* ── Card ───────────────────────────────────────────────────────────────── */
function card(id, filters = {}) {
  const def = byKpi[id];
  if (!def) return null;
  const ids = plantsOf(def, filters);
  if (!ids.length) return null; // KPI does not apply to this plant (e.g. free lime at a grinding unit)
  const v = currentValue(def, filters);
  let foot = threshText(def);
  if (!filters.plant && ids.length > 1) {
    const per = ids.map((pid) => ({ pid, v: currentValue(def, { ...filters, plant: pid }) })).filter((x) => x.v != null);
    if (def.kind === 'sum') {
      const top = per.sort((a, b) => b.v - a.v)[0];
      if (top && v) foot = `${byId[top.pid].name} leads · ${Math.round((top.v / v) * 100)}% of total`;
    } else if (def.th) {
      const worst = per.sort((a, b) => (def.goodUp ? a.v - b.v : b.v - a.v))[0];
      if (worst) foot = `Weakest: ${byId[worst.pid].name} ${fmt(def, worst.v)}`;
    }
  } else if (filters.plant) foot = `${byId[filters.plant]?.name || ''} · ${threshText(def)}`;
  // Trend vs the prior period of the default comparison window.
  const src = def.grain === 'rec' ? 'daily' : 'hourly';
  const arr = aggregate(def, src, filters);
  const w = def.grain === 'rec' ? 30 : 24;
  const a = mean(arr.slice(-w)); const p = mean(arr.slice(-2 * w, -w));
  const change = p ? ((a - p) / Math.abs(p)) * 100 : 0;
  return {
    id, label: def.label, value: fmt(def, v), raw: v, unit: def.unit, foot, icon: def.icon, tone: def.tone, ai: !!def.ai,
    rag: rag(def, v), filters,
    trend: Math.abs(change) >= 0.05 ? { change: round(change, 1), good: def.goodUp ? change > 0 : change < 0, cap: def.grain === 'rec' ? 'vs prior 30d' : 'vs prior 24h' } : null,
  };
}

/* ── Drawer insight ─────────────────────────────────────────────────────── */
function dimValues(def, dim, filters) {
  if (dim === 'plant') return plantsOf(def, { ...filters, plant: undefined }).map((pid) => ({ key: pid, label: byId[pid].name }));
  return (DIMS[dim]?.values || []).map((v) => ({ key: v, label: v }));
}

function breakdown(def, dim, tf, filters) {
  const vals = dimValues(def, dim, filters);
  const rows = vals.map(({ key, label }) => {
    const f = { ...filters, [dim]: key };
    const s = buildSeries(def, tf, f);
    return { key, label, value: s ? s.stats.last : null, forecast: s ? s.stats.fEnd : null, href: `${def.route}${dim === 'plant' ? `?plant=${key}` : ''}` };
  }).filter((r) => r.value != null);
  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  rows.forEach((r) => { r.share = def.kind === 'sum' && total ? round((r.value / total) * 100, 1) : null; });
  rows.sort((a, b) => b.value - a.value);
  if (rows.length > 8) {
    const rest = rows.splice(7);
    rows.push({ key: 'other', label: 'Other', value: def.kind === 'sum' ? rest.reduce((s, r) => s + r.value, 0) : mean(rest.map((r) => r.value)), forecast: null, tone: 'neutral' });
  }
  return { dim, rows };
}

function advisoryFor(def, series, bd, filters) {
  const s = series.stats;
  const higher = s.change >= 0 ? 'higher' : 'lower';
  const rises = s.fEnd >= s.last ? 'rise' : 'ease';
  const unit = def.unit && def.unit !== '' ? ` ${def.unit}` : '';
  const ids = plantsOf(def, filters);
  const worstFirst = [...bd.rows].filter((r) => r.key !== 'other').sort((a, b) => (def.kind === 'sum' ? b.value - a.value : def.goodUp ? a.value - b.value : b.value - a.value));
  const top = worstFirst[0];
  const mover = [...bd.rows].filter((r) => r.forecast != null).sort((a, b) => Math.abs(b.forecast - b.value) - Math.abs(a.forecast - a.value))[0];
  const findings = [];
  if (def.th && ids.length > 1) {
    const crit = ids.filter((pid) => rag(def, currentValue(def, { ...filters, plant: pid })) === 'critical').map((pid) => byId[pid].name);
    if (crit.length) findings.push(`${crit.length} plant${crit.length > 1 ? 's' : ''} in the critical band: ${crit.join(', ')}.`);
  }
  for (const a of SC.active) {
    if (ids.includes(a.plant) && (SC.DEFS[a.key].biases[`k:${def.id}`] || SC.DEFS[a.key].route === def.route) && a.level > 0.1) {
      findings.push(`Active: ${SC.DEFS[a.key].short} at ${byId[a.plant].name} — see the AI advisory for evidence.`);
    }
  }
  const quiet = Math.abs(s.change) < 1 && Math.abs(s.fEnd - s.last) <= Math.abs(s.last) * 0.01 && !findings.length;
  if (quiet) return { engine: def.engine || 'rules-based · from live records', headline: `No unusual movement. ${def.label} is within its normal range for this horizon.`, drivers: [], recommendations: [] };
  const drivers = [];
  if (top) {
    drivers.push(def.kind === 'sum'
      ? `${top.label} is the largest contributor (${fmt(def, top.value)}${unit}${top.share ? `, ${top.share}% of total` : ''}).`
      : `${top.label} is furthest from target (${fmt(def, top.value)}${unit}).`);
  }
  if (mover && series.canForecast) drivers.push(`${mover.label} shows the biggest projected shift — ${fmt(def, mover.value)} → ${fmt(def, mover.forecast)}.`);
  if (series.canForecast) drivers.push(`95% prediction range at ${s.endLabel}: ${fmt(def, s.lo)} to ${fmt(def, s.hi)} (±${s.bandPct}%).`);
  drivers.push(...findings.slice(0, 1));
  const recs = (def.recs || []).slice(0, 3).map((t, i) => {
    const text = t.replace(/\{top\}/g, top ? top.label : 'the fleet');
    const rid = `${def.id}-${i}-${top ? top.key : 'all'}`;
    return { id: rid, text, applied: !!kpiDecisions[rid] };
  });
  return {
    engine: def.engine || 'rules-based · from live records',
    headline: `${def.label} is ${Math.abs(s.change).toFixed(1)}% ${higher} than the previous period and is forecast to ${rises} to ${fmt(def, s.fEnd)}${unit} over the next ${series.stats.horizon}.`,
    drivers, recommendations: recs,
  };
}

function insight(id, { tf, filters = {}, dim } = {}) {
  const def = byKpi[id];
  if (!def) return null;
  const horizons = horizonsOf(def);
  const t = horizons.includes(tf) ? tf : defaultTf(def);
  const f = Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && v !== 'All' && def.dims.includes(k)));
  const series = buildSeries(def, t, f);
  if (!series) return { empty: true };
  const v = currentValue(def, f); // raw — same rounding path as the card
  const r = rag(def, v);
  const dims = Object.fromEntries(def.dims.map((d) => [d, { label: DIMS[d].label, values: dimValues(def, d, {}).map((x) => x.key), labels: dimValues(def, d, {}).map((x) => x.label) }]));
  const bdDim = def.dims.includes(dim) ? dim : def.dims.find((d) => !f[d]) || def.dims[0];
  const bd = breakdown(def, bdDim, t, f);
  const ids = plantsOf(def, f);
  const keyFigures = def.th && ids.length > 1 ? (() => {
    const per = ids.map((pid) => rag(def, currentValue(def, { ...f, plant: pid })));
    return [
      { label: 'Normal', value: String(per.filter((x) => x === 'normal').length), tone: 'success' },
      { label: 'Warning', value: String(per.filter((x) => x === 'warning').length), tone: 'warning' },
      { label: 'Critical', value: String(per.filter((x) => x === 'critical').length), tone: 'danger' },
      { label: 'Target', value: `${def.goodUp ? '≥' : '≤'} ${fmt(def, def.th[0])}`, tone: 'neutral' },
    ];
  })() : null;
  const rec = def.records ? def.records({ ...f }) : null;
  return {
    id, tf: t, horizons,
    model: { fmt: def.unit, dp: def.dp, goodUp: def.goodUp, kind: def.kind, dims: def.dims, unit: def.unit },
    dimensions: dims,
    hero: { value: v, display: fmt(def, v), sub: card(id, f).foot, trend: series.stats.change, caption: `vs prior ${t.toLowerCase()}`, rag: r, ragText: RAG_TEXT[r] },
    series, breakdown: bd, keyFigures, advisory: advisoryFor(def, series, bd, f),
    records: rec && rec.rows.length ? rec : rec ? { ...rec, rows: [] } : null,
    definition: bdDim !== 'plant' || Object.keys(f).some((k) => k !== 'plant') ? `${def.def} Breakdown slices other than plant are indicative in this demo.` : def.def,
    source: def.source, asOf: new Date().toISOString(),
    cta: { label: def.cta, href: `${def.route}${f.plant ? `?plant=${f.plant}` : ''}` },
    live: def.grain === 'op',
  };
}

function applyRec(recId) { kpiDecisions[recId] = { at: Date.now() }; }

module.exports = { card, insight, applyRec, fmt, rag, currentValue };
