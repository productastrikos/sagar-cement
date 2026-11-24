// Helpers that turn on-screen data into Document Studio sections (§9.4).
export const kpisSection = (cards, title = 'Key figures', id = 'kpis') => ({
  id, type: 'kpis', title,
  items: (cards || []).map((c) => ({ label: c.label, value: `${c.value}${c.unit ? ` ${c.unit}` : ''}`, sub: c.foot })),
});
export const tableSection = (id, title, cols, rows) => ({ id, type: 'table', title, cols: cols.map((c) => (typeof c === 'string' ? { h: c } : c)), rows: rows.map((r) => r.map((x) => (x == null ? '' : String(x)))) });
export const seriesSection = (id, title, data, xKey, series, dp = 1, stacked = false) => ({ id, type: 'chart', title, chart: { kind: 'series', data, xKey, series, dp, stacked } });
export const barSection = (id, title, rows, dp = 1) => ({ id, type: 'chart', title, chart: { kind: 'bar', rows, dp } });
export const trendSection = (id, title, series, dp = 1, label) => ({ id, type: 'chart', title, chart: { kind: 'trend', series, dp, label: label || title } });
export const textSection = (id, title, body) => ({ id, type: 'text', title, body });
export const aiSection = (id, title, body, bullets, engine) => ({ id, type: 'ai', title, body, bullets, engine });
export const plantFilter = (plant, name) => (plant ? [{ k: 'Plant', v: name }] : [{ k: 'Plant', v: 'All six plants' }]);
