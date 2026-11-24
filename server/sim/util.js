// Seeded randomness and small numeric helpers shared by the whole simulation.
// Everything random flows through one seeded generator, so a fresh boot always
// produces the same history (and therefore the same forecasts) — §8.17 determinism.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261120);
const rnd = () => rng();

let spare = null;
function gauss() {
  if (spare !== null) { const s = spare; spare = null; return s; }
  let u = 0; let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  const mag = Math.sqrt(-2 * Math.log(u));
  spare = mag * Math.sin(2 * Math.PI * v);
  return mag * Math.cos(2 * Math.PI * v);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => { const p = 10 ** d; return Math.round(v * p) / p; };
const lerp = (a, b, t) => a + (b - a) * t;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Deterministic pseudo-random number in [0,1) for a string key. */
const hrand = (key) => mulberry32(hash(String(key)))();

/** Mean-reverting AR(1) step — the research's recommended generator for plant signals. */
function ar1(prev, mu, sigma, phi = 0.8) {
  return mu + phi * (prev - mu) + sigma * Math.sqrt(1 - phi * phi) * gauss();
}

const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n)); const my = mean(ys.slice(0, n));
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx; const b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Indian Standard Time helpers — the plants run on IST whatever the server clock says. */
const IST_OFFSET = 5.5 * HOUR;
const istHour = (ts = Date.now()) => new Date(ts + IST_OFFSET).getUTCHours();
const istMonth = (ts = Date.now()) => new Date(ts + IST_OFFSET).getUTCMonth() + 1;

module.exports = {
  rnd, gauss, clamp, round, lerp, hash, hrand, ar1, pick, pad, ymd, mean, sd, pearson,
  HOUR, DAY, istHour, istMonth,
};
