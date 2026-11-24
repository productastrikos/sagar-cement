// Chart building blocks shared by the KPI drawer, pages and the Document Studio.
// Every colour comes from a token set: the live theme (useTokens) on screen, or
// the fixed PAPER set inside A4 documents (§9.3).
import React from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { catTick, tick, tooltipStyle } from '../lib/tokens';

export const fmtNum = (dp = 1) => (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));

/** KPI trend & prediction chart (§8.7). width set → fixed size (paper); otherwise responsive. */
export function TrendChart({ s, showF, showC, fmt, label, t, height = 200, width, refLines = [] }) {
  const rows = s.labels.map((l, i) => ({
    l,
    actual: i <= s.nowIndex ? s.actual[i] : null,
    previous: showC ? s.previous[i] : null,
    forecast: showF && i >= s.nowIndex ? s.forecast[i] : null,
    band: showF && i >= s.nowIndex && s.lower[i] != null ? [s.lower[i], s.upper[i]] : null,
  }));
  const tt = tooltipStyle(t);
  const chart = (
    <ComposedChart data={rows} margin={{ top: 10, right: 8, left: -6, bottom: 0 }} width={width} height={width ? height : undefined}>
      <CartesianGrid vertical={false} stroke={t['app-chart-grid']} />
      <XAxis dataKey="l" tick={tick(t)} axisLine={{ stroke: t['app-border'] }} tickLine={false} minTickGap={18} interval="preserveStartEnd" />
      <YAxis tick={tick(t)} tickFormatter={fmt} axisLine={false} tickLine={false} tickCount={5} width={50} domain={['auto', 'auto']} />
      {!width && <Tooltip formatter={(v) => (Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])}` : fmt(v))} {...tt} cursor={{ stroke: t['app-text-faint'], strokeOpacity: 0.4 }} />}
      {showF && <Area dataKey="band" name="95% range" stroke="none" fill={t['app-forecast-band']} fillOpacity={1} isAnimationActive={false} tooltipType="none" />}
      <Area type="monotone" dataKey="actual" name="Actual" stroke={t['app-series-1']} strokeWidth={2} fill={t['app-series-1-fill']} fillOpacity={1} dot={false}
        activeDot={{ r: 4, stroke: t['app-panel'], strokeWidth: 2 }} isAnimationActive={false} connectNulls />
      {showC && <Line type="monotone" dataKey="previous" name="Previous" stroke={t['app-chart-ref']} strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} connectNulls />}
      {showF && <Line type="monotone" dataKey="forecast" name="Forecast" stroke={t['app-forecast']} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />}
      {refLines.map((r) => (
        <ReferenceLine key={r.label} y={r.y} stroke={t[`app-${r.tone || 'warning'}`]} strokeDasharray="4 3" strokeWidth={1.25}
          label={{ value: r.label, position: 'insideTopRight', fill: t[`app-${r.tone || 'warning'}`], fontSize: 9, fontFamily: 'Lato', fontWeight: 700 }} />
      ))}
      <ReferenceLine x={s.labels[s.nowIndex]} stroke={t['app-text-faint']} strokeDasharray="2 3"
        label={{ value: 'NOW', position: 'insideTopLeft', fill: t['app-text-faint'], fontSize: 9, fontWeight: 700, fontFamily: 'Lato' }} />
    </ComposedChart>
  );
  return (
    <div role="img" aria-label={`${label} trend, ${s.labels[0]} to ${s.stats.endLabel}; latest ${fmt(s.stats.last)}`}>
      {width ? chart : <ResponsiveContainer width="100%" height={height}>{chart}</ResponsiveContainer>}
    </div>
  );
}

/** Grouped horizontal bars (§8.9): actual + optional forecast ghost bar. */
export function BreakdownChart({ rows, showF, fmt, t, onPick, width, catWidth = 150 }) {
  const h = Math.max(130, rows.length * 26 + 24);
  const tt = tooltipStyle(t);
  const chart = (
    <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 14, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%" width={width} height={width ? h : undefined}>
      <CartesianGrid horizontal={false} stroke={t['app-chart-grid']} />
      <XAxis type="number" tickFormatter={fmt} tick={tick(t)} axisLine={false} tickLine={false} tickCount={3} />
      <YAxis type="category" dataKey="label" width={catWidth} tick={catTick(t)} axisLine={false} tickLine={false} />
      {!width && <Tooltip formatter={(v) => fmt(v)} {...tt} cursor={{ fill: t['app-accent'] || t['app-series-1'], fillOpacity: 0.06 }} />}
      <Bar dataKey="value" name="Actual" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} cursor={onPick ? 'pointer' : undefined}
        onClick={(r) => onPick && r && r.payload && onPick(r.payload)}>
        {rows.map((r) => <Cell key={r.key} fill={r.tone === 'neutral' ? t['app-text-faint'] : r.tone ? t[`app-${r.tone}-bar`] || t['app-series-1'] : t['app-series-1']} />)}
      </Bar>
      {showF && <Bar dataKey="forecast" name="Forecast (end of period)" fill={t['app-forecast-ghost']} stroke={t['app-forecast']} strokeWidth={1} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} />}
    </BarChart>
  );
  return width ? chart : <ResponsiveContainer width="100%" height={h}>{chart}</ResponsiveContainer>;
}

/** Generic multi-series chart for documents and simple page panels. series: [{key,name,type:'line'|'bar'|'area',dash,colorKey}] */
export function SeriesChart({ data, xKey, series, t, fmt = fmtNum(1), height = 220, width, stacked }) {
  const tt = tooltipStyle(t);
  const chart = (
    <ComposedChart data={data} margin={{ top: 10, right: 8, left: -6, bottom: 0 }} width={width} height={width ? height : undefined}>
      <CartesianGrid vertical={false} stroke={t['app-chart-grid']} />
      <XAxis dataKey={xKey} tick={tick(t)} axisLine={{ stroke: t['app-border'] }} tickLine={false} minTickGap={14} interval="preserveStartEnd" />
      <YAxis tick={tick(t)} tickFormatter={fmt} axisLine={false} tickLine={false} tickCount={5} width={50} />
      {!width && <Tooltip formatter={(v) => fmt(v)} {...tt} cursor={{ stroke: t['app-text-faint'], strokeOpacity: 0.4 }} />}
      {series.map((s) => {
        const c = t[s.colorKey] || t['app-series-1'];
        if (s.type === 'bar') return <Bar key={s.key} dataKey={s.key} name={s.name} fill={c} stackId={stacked ? 'a' : undefined} maxBarSize={22} radius={stacked ? 0 : [3, 3, 0, 0]} isAnimationActive={false} />;
        if (s.type === 'area') return <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={c} fill={c} fillOpacity={0.18} stackId={stacked ? 'a' : undefined} strokeWidth={1.5} dot={false} isAnimationActive={false} />;
        return <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={c} strokeWidth={s.width || 2} strokeDasharray={s.dash} dot={false} isAnimationActive={false} connectNulls />;
      })}
    </ComposedChart>
  );
  return width ? chart : <ResponsiveContainer width="100%" height={height}>{chart}</ResponsiveContainer>;
}

/** Chart legend chips (§8.7 / §14). */
export function Legend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label}>
          {it.kind === 'dot' && <i className="sw-dot" style={{ background: it.color }} />}
          {it.kind === 'line' && <i className={`sw-line ${it.dash ? `is-${it.dash}` : ''}`} style={{ borderColor: it.color }} />}
          {it.kind === 'band' && <i className="sw-band" style={{ background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}
