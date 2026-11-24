// KPI detail drawer (§8): what is it now → how is it moving → where will it go →
// where does it come from → what should I do → where are the records.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, Download, Info, RotateCcw, Sparkles, X } from 'lucide-react';
import { get, post } from '../lib/api';
import { useTokens } from '../lib/tokens';
import { KpiIcon } from '../lib/icons';
import { useStudio } from '../lib/studio';
import { useToast } from '../lib/toast';
import { fmtTime } from '../lib/format';
import { TrendChart, BreakdownChart, Legend, fmtNum } from './charts';
import { Callout, Segmented, StatusChip, TrendBadge, RagLabel } from './ui';

const LIVE_REFRESH_MS = 5000;

function useInsight(id, { tf, filters, dim }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const gen = useRef(0);
  const load = useCallback(async (quiet) => {
    const g = ++gen.current;
    if (!quiet) setRefreshing(true);
    try {
      const r = await get(`/kpi/${id}`, { tf, dim, ...filters });
      if (g === gen.current) { setData(r); setError(null); }
    } catch (e) {
      if (g === gen.current) setError(e.message);
    } finally {
      if (g === gen.current) setRefreshing(false);
    }
  }, [id, tf, dim, filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data?.live) return undefined;
    const t = setInterval(() => load(true), LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [data?.live, load]);
  return { data, error, refreshing, retry: () => load() };
}

function useDrawerA11y(ref, onClose, skipEsc) {
  useEffect(() => {
    ref.current?.querySelector('#kpi-drawer-title')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !skipEsc() && !document.querySelector('.app-modal-backdrop')) { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll('button:not(:disabled), select, [href], [tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ref, onClose, skipEsc]);
}

export function kpiDocSpec(k, d, { tf, filters, recsApplied }) {
  const unit = d.model.unit ? ` ${d.model.unit}` : '';
  const fmt = fmtNum(d.model.dp);
  const s = d.series;
  const dimLabel = d.dimensions[d.breakdown.dim]?.label || d.breakdown.dim;
  return {
    title: k.label,
    subtitle: `KPI detail · current ${d.hero.display}${unit} · ${d.hero.sub}`,
    filters: [{ k: 'Horizon', v: tf || d.tf }, ...Object.entries(filters).filter(([, v]) => v).map(([kk, v]) => ({ k: d.dimensions[kk]?.label || kk, v: d.dimensions[kk]?.labels?.[d.dimensions[kk].values.indexOf(v)] || v }))],
    sections: [
      { id: 'headline', type: 'kpis', title: 'Headline', items: [
        { label: `Current (${d.hero.ragText})`, value: `${d.hero.display}${unit}` },
        { label: `Forecast · ${s.stats.endLabel}`, value: s.canForecast ? `${fmt(s.stats.fEnd)}${unit}` : '—', sub: s.canForecast ? `95%: ${fmt(s.stats.lo)} – ${fmt(s.stats.hi)}` : 'Not enough history' },
        { label: 'vs previous period', value: `${s.stats.change >= 0 ? '▲' : '▼'} ${Math.abs(s.stats.change).toFixed(1)}%` },
        { label: 'Horizon', value: tf || d.tf },
      ] },
      { id: 'trend', type: 'chart', title: 'Trend & forecast', chart: { kind: 'trend', series: s, dp: d.model.dp, label: k.label } },
      { id: 'breakdown-chart', type: 'chart', title: `By ${dimLabel.toLowerCase()}`, chart: { kind: 'bar', rows: d.breakdown.rows, dp: d.model.dp } },
      { id: 'ai', type: 'ai', title: 'AI advisory', body: d.advisory.headline, bullets: [
        ...d.advisory.drivers,
        ...d.advisory.recommendations.map((r) => `Recommendation: ${r.text}${recsApplied?.[r.id] || r.applied ? ' (Applied)' : ''}`),
      ], engine: d.advisory.engine },
      { id: 'definition', type: 'text', title: 'Definition', body: `${d.definition} Source: ${d.source}. As of ${fmtTime(d.asOf)}.` },
      { id: 'breakdown-table', type: 'table', title: `Breakdown by ${dimLabel.toLowerCase()}`, cols: [{ h: dimLabel }, { h: 'Actual', num: true }, { h: 'Forecast', num: true }],
        rows: d.breakdown.rows.map((r) => [r.label, fmt(r.value), r.forecast == null ? '—' : fmt(r.forecast)]) },
      { id: 'data', type: 'table', title: 'Data', cols: [{ h: 'Period' }, { h: 'Actual', num: true }, { h: 'Forecast', num: true }, { h: '95% low', num: true }, { h: '95% high', num: true }, { h: 'Previous', num: true }],
        rows: s.labels.map((l, i) => [l, s.actual[i] == null ? '' : fmt(s.actual[i]), s.forecast[i] == null || i === s.nowIndex ? '' : fmt(s.forecast[i]), s.lower[i] == null || i === s.nowIndex ? '' : fmt(s.lower[i]), s.upper[i] == null || i === s.nowIndex ? '' : fmt(s.upper[i]), s.previous[i] == null ? '' : fmt(s.previous[i])]) },
      ...(d.records && d.records.rows.length ? [{ id: 'records', type: 'table', title: 'Contributing records', cols: d.records.cols, rows: d.records.rows.map((r) => r.cells.map(String)) }] : []),
    ],
  };
}

export default function KpiDrawer({ k, onClose }) {
  const t = useTokens();
  const navigate = useNavigate();
  const studio = useStudio();
  const toast = useToast();
  const ref = useRef(null);
  const start = k.filters || {};
  const [tf, setTf] = useState(null);
  const [filters, setFilters] = useState(start);
  const [dim, setDim] = useState(null);
  const [showF, setShowF] = useState(true);
  const [showC, setShowC] = useState(true);
  const [applied, setApplied] = useState({});
  const { data, error, refreshing, retry } = useInsight(k.id, { tf, filters, dim });
  // Default view: the hero follows the live card (the card re-polls every 5 s); once filters or the horizon change it shows the server's value for that slice.
  const pristine = tf === null && JSON.stringify(filters) === JSON.stringify(start);
  useDrawerA11y(ref, onClose, () => studio.isOpen);

  const go = (href) => { onClose(); navigate(href); };
  const fmt = data ? fmtNum(data.model.dp) : fmtNum(1);
  const unit = data?.model.unit ? data.model.unit : '';
  const canF = data?.series.canForecast;
  const changed = JSON.stringify(filters) !== JSON.stringify(start);

  const apply = async (r) => {
    try {
      await post(`/kpi/${k.id}/apply`, { recId: r.id, text: r.text });
      setApplied((a) => ({ ...a, [r.id]: true }));
      toast('success', 'Recommendation applied', `${r.text} — logged to the audit trail.`);
    } catch (e) { toast('danger', 'Could not apply', e.message); }
  };

  return createPortal(
    <>
      <div className="app-drawer-catcher" onClick={onClose} />
      <aside ref={ref} className={`app-drawer kpi-drawer ${refreshing && data ? 'is-refreshing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="kpi-drawer-title" tabIndex={-1}>
        <header className="app-drawer-head">
          <span className={`kpi-icon tone-${k.tone || 'accent'} ${k.ai ? 'is-ai' : ''}`}><KpiIcon name={k.icon} /></span>
          <div className="app-drawer-titles">
            <h2 className="app-drawer-title" id="kpi-drawer-title" tabIndex={-1}>{k.label}</h2>
            <div className="app-drawer-sub">
              {data?.live ? <><span className="status-dot is-live" /> KPI detail · live</> : `KPI detail · updated ${data ? fmtTime(data.asOf) : '—'}`}
            </div>
          </div>
          <button type="button" className="app-control-btn btn-sm" disabled={!data || data.empty}
            onClick={() => studio.open(kpiDocSpec(k, data, { tf: tf || data.tf, filters, recsApplied: applied }))}><Download size={13} /> Download</button>
          <button type="button" className="icon-btn sm" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </header>

        {error && !data ? (
          <div className="app-drawer-body">
            <Callout tone="danger" title="Couldn't load this KPI">{error} Check the server connection, then try again. <button type="button" className="app-control-btn btn-sm" onClick={retry}>Retry</button></Callout>
          </div>
        ) : !data ? (
          <div className="app-drawer-center"><span className="app-spinner" /></div>
        ) : data.empty ? (
          <div className="app-drawer-body">
            <div className="kpi-hero"><div className="kpi-hero-value"><span className="kpi-hero-num">0</span></div></div>
            <div className="kpi-well"><div className="app-empty"><div className="app-empty-title">No records match these filters.</div>
              <button type="button" className="app-control-btn btn-sm" onClick={() => setFilters(start)}>Reset filters</button></div></div>
          </div>
        ) : (
          <div className="app-drawer-body">
            {/* 8.5 Hero */}
            <div className="kpi-hero">
              <div>
                <div className="kpi-hero-value"><span className="kpi-hero-num astk-numeric">{pristine ? k.value : data.hero.display}</span>{unit && <span className="kpi-hero-unit">{unit}</span>}</div>
                <div className="kpi-hero-sub">{data.hero.sub}</div>
              </div>
              <div className="kpi-hero-badges">
                <TrendBadge change={data.hero.trend} good={data.model.goodUp ? data.hero.trend > 0 : data.hero.trend < 0} cap={data.hero.caption} />
                <RagLabel rag={data.hero.rag} text={data.hero.ragText} />
              </div>
            </div>

            {/* 8.6 Filters */}
            <div className="kpi-filters">
              <div className="kpi-filter-row">
                <Segmented label="Horizon" options={data.horizons.map((h) => ({ value: h, label: h }))} value={tf || data.tf} onChange={setTf} />
                {data.model.dims.slice(0, 3).map((d) => {
                  const dd = data.dimensions[d];
                  return (
                    <label key={d} className={`app-fsel ${filters[d] ? 'is-on' : ''}`}>
                      <span>{dd.label}</span>
                      <select value={filters[d] || ''} onChange={(e) => setFilters((f) => ({ ...f, [d]: e.target.value || undefined }))} aria-label={dd.label}>
                        <option value="">All</option>
                        {dd.values.map((v, i) => <option key={v} value={v}>{dd.labels[i]}</option>)}
                      </select>
                    </label>
                  );
                })}
                {changed && <button type="button" className="app-ghost-btn btn-sm" onClick={() => setFilters(start)}><RotateCcw size={11} /> Reset</button>}
              </div>
              <div className="kpi-filter-row">
                {canF && (
                  <button type="button" className={`app-tchip is-ai ${showF ? 'is-on' : ''}`} aria-pressed={showF} onClick={() => setShowF((v) => !v)}>
                    <span className="app-tchip-box">{showF && <Check size={9} strokeWidth={3} />}</span> Forecast
                  </button>
                )}
                <button type="button" className={`app-tchip ${showC ? 'is-on' : ''}`} aria-pressed={showC} onClick={() => setShowC((v) => !v)}>
                  <span className="app-tchip-box">{showC && <Check size={9} strokeWidth={3} />}</span> Compare previous
                </button>
              </div>
            </div>

            {/* 8.7 Trend & prediction */}
            <section className="kpi-well">
              <div className="kpi-well-head">
                <h3 className="kpi-sec-title">Trend &amp; prediction</h3>
                <Legend items={[
                  { kind: 'dot', color: t['app-series-1'], label: 'Actual' },
                  ...(showC ? [{ kind: 'line', dash: 'dotted', color: t['app-chart-ref'], label: 'Previous' }] : []),
                  ...(showF && canF ? [{ kind: 'line', dash: 'dashed', color: t['app-forecast'], label: 'Forecast' }] : []),
                ]} />
              </div>
              <TrendChart s={data.series} showF={showF && canF} showC={showC} fmt={fmt} label={k.label} t={t} />
              {!canF && <p className="kpi-note">Not enough history to forecast.</p>}
            </section>

            {/* 8.8 Mini-stats */}
            <div className="kpi-mini-stats">
              <div className="app-mini-stat">
                <div className={`v ${showF && canF ? 'is-forecast' : 'is-none'}`}>{showF && canF ? `${fmt(data.series.stats.fEnd)}` : '—'}</div>
                <div className="l">Forecast · {data.series.stats.endLabel}</div>
              </div>
              <div className="app-mini-stat">
                <div className={`v ${showF && canF ? '' : 'is-none'}`}>{showF && canF ? `±${data.series.stats.bandPct}%` : '—'}</div>
                <div className="l">95% range</div>
              </div>
              <div className="app-mini-stat">
                <div className={`v ${(data.model.goodUp ? data.series.stats.change > 0 : data.series.stats.change < 0) ? 'is-good' : 'is-bad'}`}>
                  {data.series.stats.change >= 0 ? '▲' : '▼'} {Math.abs(data.series.stats.change).toFixed(1)}%
                </div>
                <div className="l">vs previous period</div>
              </div>
            </div>

            {/* 8.9 Breakdown */}
            <section className="kpi-well">
              <div className="kpi-well-head">
                <h3 className="kpi-sec-title">Breakdown</h3>
                <Segmented label="Breakdown dimension" options={data.model.dims.map((d) => ({ value: d, label: data.dimensions[d].label }))} value={data.breakdown.dim} onChange={setDim} />
              </div>
              {data.breakdown.rows.length ? (
                <BreakdownChart rows={data.breakdown.rows} showF={showF && canF} fmt={fmt} t={t} onPick={(r) => r.href && go(r.href)} />
              ) : <p className="kpi-note">No breakdown for these filters.</p>}
            </section>

            {/* 8.10 Key figures */}
            {data.keyFigures && (
              <div>
                <h3 className="kpi-sec-title" style={{ marginBottom: 8 }}>Key figures</h3>
                <div className="kpi-figures">
                  {data.keyFigures.map((f) => (
                    <div key={f.label} className="kpi-figure">
                      <span className="kpi-figure-label">{f.label}</span>
                      <span className={`kpi-figure-value ${f.tone && f.tone !== 'neutral' ? `tone-${f.tone}` : ''}`}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 8.11 AI advisory */}
            <section className="kpi-advisory">
              <div className="kpi-advisory-eyebrow"><Sparkles size={12} /> AI advisory <span className="kpi-advisory-engine">{data.advisory.engine}</span></div>
              <p className="kpi-advisory-headline">{data.advisory.headline}</p>
              {data.advisory.drivers.length > 0 && <>
                <h4 className="kpi-sec-title">Drivers</h4>
                <ul className="kpi-drivers">{data.advisory.drivers.map((d) => <li key={d}>{d}</li>)}</ul>
              </>}
              {data.advisory.recommendations.length > 0 && <>
                <h4 className="kpi-sec-title">Recommended actions</h4>
                <ul className="kpi-recs">
                  {data.advisory.recommendations.map((r) => (
                    <li key={r.id} className="kpi-rec">
                      <span className="kpi-rec-text">{r.text}</span>
                      {r.applied || applied[r.id]
                        ? <StatusChip tone="success"><CheckCircle2 size={10} /> Applied</StatusChip>
                        : <button type="button" className="app-ai-btn" onClick={() => apply(r)}>Apply <ArrowRight size={11} /></button>}
                    </li>
                  ))}
                </ul>
              </>}
            </section>

            {/* 8.12 Contributing records */}
            {data.records && (
              <div className="kpi-records">
                <h3 className="kpi-sec-title" style={{ marginBottom: 8 }}>Contributing records</h3>
                {data.records.rows.length ? (
                  <div className="table-wrap">
                    <table className="app-table compact">
                      <thead><tr>{data.records.cols.map((c) => <th key={c.h} className={c.num ? 'numeric' : ''}>{c.h}</th>)}</tr></thead>
                      <tbody>
                        {data.records.rows.map((r, i) => (
                          <tr key={i} className="is-clickable" tabIndex={0} onClick={() => r.href && go(r.href)} onKeyDown={(e) => e.key === 'Enter' && r.href && go(r.href)}>
                            {r.cells.map((c, j) => <td key={j} className={data.records.cols[j]?.num ? 'numeric' : j === 0 ? 'mono' : ''}>{String(c)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="kpi-note">No records match these filters.</p>}
                {data.records.total > data.records.rows.length && <p className="kpi-note">Showing {data.records.rows.length} of {data.records.total}. Open the full list for the rest.</p>}
              </div>
            )}

            {/* 8.13 Definition */}
            <p className="kpi-definition"><Info size={13} /><span><b>Definition · </b>{data.definition} Source: {data.source}. Updated {fmtTime(data.asOf)}.</span></p>
          </div>
        )}

        {data && !data.empty && (
          <footer className="app-drawer-foot">
            <button type="button" className="app-primary-btn btn-md" onClick={() => { const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString(); go(`${data.cta.href.split('?')[0]}${q ? `?${q}` : ''}`); }}>
              {data.cta.label} <ArrowRight size={13} />
            </button>
          </footer>
        )}
      </aside>
    </>,
    document.body,
  );
}
