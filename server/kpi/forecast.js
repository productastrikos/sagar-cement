// The "minimum honest model" from theme spec §8.17: least squares on the last
// min(n, 14) points, a seasonal profile when there is enough history
// (hour-of-day for hourly data, day-of-week for daily), and a 95% band of
// ± 1.96 · σ(residuals) · √min(h, 4). Deterministic: same data → same forecast.
//
// Two refinements (Desktop-Claude review 05):
//  • the slope is kept only if it is significant (|b| ≥ 2·SE(b)); otherwise flat,
//    so long horizons never extrapolate noise;
//  • the forecast is level-anchored at NOW: the gap between the live value and
//    the fitted line carries forward and decays with φ (φ = 1 while a scenario
//    driving this KPI is active — the shock persists until people act).

function forecast(values, steps, period = 0, lo = -Infinity, hi = Infinity, { phi = 0.85 } = {}) {
  const n = values.length;
  if (n < 6) return null;
  const prof = new Array(Math.max(1, period)).fill(0);
  if (period > 1 && n - 1 >= period * 2) {
    // Profile from history only — the live NOW point must not leak into its own hour's bucket.
    const hist = values.slice(0, n - 1);
    const overall = hist.reduce((x, y) => x + y, 0) / hist.length;
    const sums = new Array(period).fill(0); const cnt = new Array(period).fill(0);
    hist.forEach((v, i) => { sums[i % period] += v; cnt[i % period] += 1; });
    for (let k = 0; k < period; k++) prof[k] = cnt[k] ? sums[k] / cnt[k] - overall : 0;
  }
  const P = Math.max(1, period);
  const des = values.map((v, i) => v - prof[i % P]);
  const m = Math.min(n, 14);
  const ys = des.slice(-m);
  const mx = (m - 1) / 2; const my = ys.reduce((a, b) => a + b, 0) / m;
  let num = 0; let den = 0;
  ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  let b = den ? num / den : 0;
  let a = my - b * mx;
  const resid = ys.map((y, i) => y - (a + b * i));
  const sigma = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(1, m - 2)) || Math.abs(my) * 0.01;
  // Slope significance gate.
  const seB = den ? sigma / Math.sqrt(den) : Infinity;
  if (Math.abs(b) < 2 * seB) { b = 0; a = my; }
  // Level anchor: how far NOW sits off the fitted line.
  const offset = des[n - 1] - (a + b * (m - 1));
  const f = []; const lower = []; const upper = [];
  for (let h = 1; h <= steps; h++) {
    const v = a + b * (m - 1 + h) + offset * phi ** h + prof[(n - 1 + h) % P];
    const band = 1.96 * sigma * Math.sqrt(Math.min(h, 4));
    f.push(Math.min(hi, Math.max(lo, v)));
    lower.push(Math.min(hi, Math.max(lo, v - band)));
    upper.push(Math.min(hi, Math.max(lo, v + band)));
  }
  return { f, lower, upper, sigma };
}

module.exports = { forecast };
