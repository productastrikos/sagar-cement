// Chart token bridge (§5.9): chart libraries cannot read var(--…), so tokens are
// resolved once per theme and passed in. Never type a hex into a chart.
import { useMemo } from 'react';
import { useTheme } from './theme';

const NAMES = [
  'app-accent', 'app-teal', 'app-info', 'app-warning', 'app-success', 'app-danger', 'app-violet', 'app-advisory',
  'app-text', 'app-text-muted', 'app-text-faint', 'app-border', 'app-border-strong', 'app-panel', 'app-bg-elevated',
  'app-surface', 'app-surface-soft', 'app-surface-raised', 'app-chart-grid', 'app-chart-tooltip-bg', 'app-chart-tooltip-border',
  'app-success-bar', 'app-warning-bar', 'app-danger-bar',
  'app-series-1', 'app-series-1-fill', 'app-chart-ref', 'app-forecast', 'app-forecast-band', 'app-forecast-ghost',
  'app-teal-bg', 'app-info-bg', 'app-warning-bg', 'app-success-bg', 'app-danger-bg', 'app-advisory-soft',
];

export function readTokens() {
  const cs = getComputedStyle(document.body);
  return Object.fromEntries(NAMES.map((n) => [n, cs.getPropertyValue('--' + n).trim()]));
}

export function useTokens() {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readTokens(), [theme]);
}

/** Categorical order from §14 — never shuffled. */
export const seriesFor = (t) => [t['app-series-1'], t['app-teal'], t['app-info'], t['app-warning'], t['app-success'], t['app-danger'], t['app-text-faint']];

/** Fixed paper tokens for the A4 Document Studio (§9.3) — theme-independent. */
export const PAPER = {
  'app-series-1': '#5B4BC4', 'app-series-1-fill': 'rgba(91,75,196,0.12)', 'app-forecast': '#7466D2', 'app-forecast-band': 'rgba(91,75,196,0.12)',
  'app-forecast-ghost': 'rgba(91,75,196,0.28)', 'app-chart-ref': '#7D7A91', 'app-chart-grid': 'rgba(53,50,72,0.08)', 'app-text': '#2F2E33',
  'app-text-muted': '#565559', 'app-text-faint': '#7D7A91', 'app-border': '#E8E6F2', 'app-panel': '#FFFFFF', 'app-teal': '#1F7F74', 'app-info': '#2F6FBF',
  'app-success': '#0A8F42', 'app-warning': '#9A6512', 'app-danger': '#BE2E2E', 'app-success-bar': '#0A8F42', 'app-warning-bar': '#9A6512', 'app-danger-bar': '#BE2E2E',
  'app-chart-tooltip-bg': '#FFFFFF', 'app-chart-tooltip-border': '#E8E6F2',
};

export const tick = (t) => ({ fill: t['app-text-faint'], fontSize: 9.5, fontFamily: 'Lato' });
export const catTick = (t) => ({ fill: t['app-text-muted'], fontSize: 10.5, fontWeight: 700, fontFamily: 'Lato' });
export const tooltipStyle = (t) => ({
  contentStyle: { background: t['app-chart-tooltip-bg'], border: `1px solid ${t['app-chart-tooltip-border']}`, borderRadius: 8, fontFamily: 'Lato', fontSize: 11 },
  labelStyle: { color: t['app-text'], fontWeight: 700 },
  itemStyle: { color: t['app-text-muted'] },
});
