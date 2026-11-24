// Predict & optimise — predict process behaviour and optimise manufacturing
// parameters against BIS product specifications.
import React, { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Play, Save, Sparkles } from 'lucide-react';
import { usePoll, useLive } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useToast } from '../lib/toast';
import { useTokens, tick, tooltipStyle } from '../lib/tokens';
import { post } from '../lib/api';
import { PLANT_NAME, PLANT_OPTIONS, fmtDay, fmtTime } from '../lib/format';
import { kpisSection, tableSection, seriesSection, plantFilter } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip, AdvRow } from '../components/Advisory';
import { SeriesChart, Legend, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, SelectField, StatusChip, DownloadIcon, Callout, SEV_TONE, usePlantParam } from '../components/ui';

const GRADES = ['OPC 53', 'OPC 43', 'PPC', 'PSC', 'CC'];

function SensorChart({ L, t }) {
  const rows = useMemo(() => {
    const out = L.est.map((p) => ({ t: p.t, l: fmtTime(new Date(p.t).toISOString()), est: p.v }));
    L.lab.forEach((lp) => { const near = out.reduce((b, r) => (Math.abs(r.t - lp.t) < Math.abs(b.t - lp.t) ? r : b), out[0]); if (near) near.lab = lp.v; });
    const now = out[out.length - 1];
    if (now) { now.fc = now.est; now.band = [now.est, now.est]; }
    L.forecast.forEach((f) => out.push({ t: f.t, l: fmtTime(new Date(f.t).toISOString()), fc: f.v, band: [f.lo, f.hi] }));
    return out;
  }, [L]);
  const nowLabel = rows[L.est.length - 1]?.l;
  const tt = tooltipStyle(t);
  return (
    <div role="img" aria-label={`${L.name} free-lime soft sensor with 45-minute forecast`}>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={t['app-chart-grid']} />
          <XAxis dataKey="l" tick={tick(t)} axisLine={{ stroke: t['app-border'] }} tickLine={false} minTickGap={24} />
          <YAxis tick={tick(t)} axisLine={false} tickLine={false} width={40} domain={[0, 'auto']} />
          <Tooltip {...tt} formatter={(v) => (Array.isArray(v) ? `${v[0]} – ${v[1]}` : v)} />
          <ReferenceLine y={1.5} stroke={t['app-warning']} strokeDasharray="4 3" strokeWidth={1.25} label={{ value: '1.5% limit', position: 'insideTopRight', fill: t['app-warning'], fontSize: 9, fontFamily: 'Lato', fontWeight: 700 }} />
          <ReferenceLine y={0.5} stroke={t['app-text-faint']} strokeDasharray="4 3" />
          <Area dataKey="band" stroke="none" fill={t['app-forecast-band']} fillOpacity={1} isAnimationActive={false} />
          <Line dataKey="est" name="Soft sensor" stroke={t['app-series-1']} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="fc" name="Forecast" stroke={t['app-forecast']} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
          <Scatter dataKey="lab" name="Lab XRD" fill={t['app-teal']} isAnimationActive={false} />
          <ReferenceLine x={nowLabel} stroke={t['app-text-faint']} strokeDasharray="2 3" label={{ value: 'NOW', position: 'insideTopLeft', fill: t['app-text-faint'], fontSize: 9, fontWeight: 700, fontFamily: 'Lato' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WhatIf({ defaultPlant }) {
  const toast = useToast();
  const [plant, setPlant] = useState(defaultPlant || 'MTP');
  const [grade, setGrade] = useState('PPC');
  const [scm, setScm] = useState(3);
  const [blaine, setBlaine] = useState(0);
  const [so3, setSo3] = useState(0);
  const [r, setR] = useState(null);
  useEffect(() => {
    const id = setTimeout(() => post('/prediction/whatif', { plant, grade, scm, blaine, so3 }).then(setR).catch(() => {}), 180);
    return () => clearTimeout(id);
  }, [plant, grade, scm, blaine, so3]);
  const save = async () => { await post('/prediction/whatif', { plant, grade, scm, blaine, so3, log: true }); toast('success', 'What-if saved', 'Logged to the audit trail for the quality review.'); };
  return (
    <Panel title="What-if: optimise against the specification" eyebrow={r?.engine || 'Strength forecaster · sensitivity mode'}
      actions={<button type="button" className="app-ghost-btn btn-sm" onClick={save}><Save size={12} /> Save to audit trail</button>}>
      <div className="row wrap gap-12 mb-8">
        <label className="row small muted">Plant <select className="app-select select-sm" value={plant} onChange={(e) => setPlant(e.target.value)}>{PLANT_OPTIONS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label className="row small muted">Grade <select className="app-select select-sm" value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></label>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <div className="slider-row"><span>SCM share change</span><input type="range" min={-5} max={8} step={0.5} value={scm} onChange={(e) => setScm(Number(e.target.value))} aria-label="SCM share change" /><span className="v">{scm > 0 ? '+' : ''}{scm}%</span></div>
        <div className="slider-row"><span>Blaine change</span><input type="range" min={-30} max={30} step={5} value={blaine} onChange={(e) => setBlaine(Number(e.target.value))} aria-label="Blaine change" /><span className="v">{blaine > 0 ? '+' : ''}{blaine} m²/kg</span></div>
        <div className="slider-row"><span>SO₃ off optimum</span><input type="range" min={-0.6} max={0.6} step={0.1} value={so3} onChange={(e) => setSo3(Number(e.target.value))} aria-label="SO3 change" /><span className="v">{so3 > 0 ? '+' : ''}{so3.toFixed(1)}%</span></div>
      </div>
      {r && (
        <>
          <div className="stat-grid mt-12">
            <div className="stat"><div className="stat-label">3-day</div><div className="stat-value">{r.predicted.s3}</div><div className="stat-sub">BIS ≥ {r.bisMin.s3} · now {r.current.s3}</div></div>
            <div className="stat"><div className="stat-label">7-day</div><div className="stat-value">{r.predicted.s7}</div><div className="stat-sub">BIS ≥ {r.bisMin.s7} · now {r.current.s7}</div></div>
            <div className="stat"><div className="stat-label">28-day forecast</div><div className="stat-value tone-accent">{r.predicted.s28}</div><div className="stat-sub">95%: {r.predicted.lo28}–{r.predicted.hi28} · target {r.target28}</div></div>
            <div className="stat"><div className="stat-label">Impact</div><div className={`stat-value ${r.lakhPerMonth >= 0 ? 'tone-success' : 'tone-danger'}`}>₹{r.lakhPerMonth}L</div><div className="stat-sub">per month · {r.clinkerSavedT.toLocaleString('en-IN')} t clinker</div></div>
          </div>
          <div className="row wrap mt-8">
            <StatusChip tone={r.pass ? (r.meetsTarget ? 'success' : 'warning') : 'danger'}>{r.pass ? (r.meetsTarget ? 'Meets release target' : 'Passes BIS, under target') : 'Fails BIS'}</StatusChip>
            <span className="faint small">SCM share {r.scmPct}% (cap {r.scmCap}% under {r.standard}). A person approves any trial; nothing changes in the plant from here.</span>
          </div>
        </>
      )}
    </Panel>
  );
}

export default function Prediction() {
  const t = useTokens();
  const studio = useStudio();
  const toast = useToast();
  const { refresh } = useLive();
  const [plant, setPlant] = usePlantParam();
  const [grade, setGrade] = useState('');
  const { data, error, reload } = usePoll('/prediction', { plant, grade }, 8000);
  const lib = usePoll('/scenarios', null, 6000);

  const start = async (s) => {
    try { await post(`/scenarios/${s.key}/start`, { plant: s.plant }); toast('info', `${s.short} started at ${s.plantName}`, 'It ramps in over about 40 seconds. Watch the soft sensor, the forecaster and the AI advisory.'); lib.reload(); refresh(); }
    catch (e) { toast('danger', 'Could not start scenario', e.message); }
  };
  const bt = data?.backtest;
  const btRows = (bt?.points || []).map((p) => ({ d: fmtDay(p.date), predicted: p.predicted, actual: p.actual }));
  const download = () => studio.open({
    title: 'Predict & optimise', subtitle: 'Soft sensor, 28-day forecaster and BIS specification checks', filters: [...plantFilter(plant, PLANT_NAME[plant]), ...(grade ? [{ k: 'Grade', v: grade }] : [])],
    sections: [
      kpisSection(data.cards),
      tableSection('open', 'Open batches — 28-day forecast', ['Batch', 'Plant', 'Grade', { h: '3-day', num: true }, { h: '7-day', num: true }, { h: 'Forecast 28-day', num: true }, { h: 'BIS min', num: true }, 'Status'],
        data.open.map((b) => [b.id, b.plantName, b.grade, b.s3 ?? '—', b.s7 ?? '—', b.p28, b.bisMin, b.atRisk ? 'At risk' : 'OK'])),
      seriesSection('bt', `Forecaster backtest — MAE ${bt.mae} · RMSE ${bt.rmse} MPa`, btRows, 'd', [{ key: 'actual', name: 'Measured', colorKey: 'app-series-1' }, { key: 'predicted', name: 'Forecast', colorKey: 'app-forecast', dash: '5 4' }], 1),
      tableSection('give', 'Strength giveaway by grade', ['Grade', 'Standard', { h: 'BIS min', num: true }, { h: 'Target', num: true }, { h: 'Mean 28-day', num: true }, { h: 'σ', num: true }, { h: 'Giveaway', num: true }], data.giveaway.map((g) => [g.grade, g.standard, g.bisMin, g.target, g.mean, g.sigma, g.giveaway])),
      tableSection('bis', 'BIS specification limits', ['Grade', 'Standard', { h: '3d', num: true }, { h: '7d', num: true }, { h: '28d', num: true }, { h: 'Blaine min', num: true }, { h: 'SO₃ max', num: true }, { h: 'MgO max', num: true }], data.bis.map((b) => [b.grade, b.standard, b.s3, b.s7, b.s28max ? `${b.s28}–${b.s28max}` : b.s28, b.blaineMin, b.so3Max, b.mgoMax])),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Predict & optimise" subtitle="Predict process behaviour and optimise manufacturing parameters against BIS product specifications"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="prediction" match={(a) => a.domain === 'quality'} />
      <FilterBar showReset={!!(plant || grade)} onReset={() => { setPlant(''); setGrade(''); }}>
        <PlantSelect value={plant} onChange={setPlant} />
        <SelectField label="Grade" value={grade} onChange={setGrade} allLabel="All grades" options={GRADES} />
      </FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} cols={6} />
          <Panel title={`Free-lime soft sensor · ${data.sensor.plantName}`} eyebrow="1-minute estimate between hourly lab results · 45-minute forecast with 95% range"
            actions={<Legend items={[{ kind: 'line', color: t['app-series-1'], label: 'Soft sensor' }, { kind: 'dot', color: t['app-teal'], label: 'Lab XRD' }, { kind: 'line', dash: 'dashed', color: t['app-forecast'], label: 'Forecast' }, { kind: 'band', color: t['app-forecast-band'], label: '95% range' }]} />}>
            <div className="grid-2">
              {data.sensor.lines.map((L) => (
                <div key={L.id}>
                  <div className="row between"><b style={{ fontSize: 12.5 }}>{L.name}</b>
                    {L.paused ? <StatusChip tone="warning">Paused — inputs failed data health</StatusChip>
                      : <StatusChip tone={L.forecast[L.forecast.length - 1].v > 1.5 ? 'danger' : 'success'}>45 min: {L.forecast[L.forecast.length - 1].v}%</StatusChip>}</div>
                  <SensorChart L={L} t={t} />
                </div>
              ))}
            </div>
          </Panel>
          <div className="split-wide">
            <Panel flush title="Open batches — 28-day forecast on grinding day" eyebrow="Ranked by risk · results arrive 28 days later"
              actions={<DownloadIcon label="Download open batches" onClick={() => studio.open({ title: 'Open batches — 28-day forecast', filters: plantFilter(plant, PLANT_NAME[plant]), sections: [tableSection('open', 'Open batches', ['Batch', 'Plant', 'Grade', { h: '3-day', num: true }, { h: 'Forecast 28-day', num: true }, { h: 'BIS min', num: true }, 'Status'], data.open.map((b) => [b.id, b.plantName, b.grade, b.s3 ?? '—', b.p28, b.bisMin, b.atRisk ? 'At risk' : 'OK']))] })} />}>
              <div className="table-wrap tall">
                <table className="app-table compact">
                  <thead><tr><th>Batch</th><th>Grade</th><th className="numeric">3-day</th><th className="numeric">7-day</th><th className="numeric">Forecast 28-day</th><th className="numeric">BIS min · target</th><th>Status</th></tr></thead>
                  <tbody>{data.open.map((b) => (
                    <tr key={b.id} className={b.atRisk ? 'row-urgent' : ''}>
                      <td><span className="mono">{b.id}</span><div className="faint small">{b.plantName} · ground {fmtDay(b.date)}</div></td><td>{b.grade}</td>
                      <td className="numeric">{b.s3 ?? '—'}</td><td className="numeric">{b.s7 ?? '—'}</td><td className={`numeric ${b.atRisk ? 'tone-danger' : ''}`}><b>{b.p28}</b></td>
                      <td className="numeric">{b.bisMin} · {b.target}</td><td><StatusChip tone={b.atRisk ? 'danger' : 'success'}>{b.atRisk ? 'At risk' : 'On track'}</StatusChip></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Forecaster backtest" eyebrow="Measured vs forecast 28-day strength · chronological"
              actions={<Legend items={[{ kind: 'line', color: t['app-series-1'], label: 'Measured' }, { kind: 'line', dash: 'dashed', color: t['app-forecast'], label: 'Forecast' }]} />}>
              <div className="stat-grid" style={{ marginBottom: 8 }}>
                <div className="stat"><div className="stat-label">MAE</div><div className="stat-value">{bt.mae}</div><div className="stat-sub">MPa</div></div>
                <div className="stat"><div className="stat-label">RMSE</div><div className="stat-value">{bt.rmse}</div><div className="stat-sub">MPa</div></div>
                <div className="stat"><div className="stat-label">Bias</div><div className="stat-value">{bt.bias}</div><div className="stat-sub">MPa</div></div>
                <div className="stat"><div className="stat-label">R²</div><div className="stat-value">{bt.r2}</div><div className="stat-sub">n = {bt.n}</div></div>
              </div>
              <SeriesChart data={btRows} xKey="d" series={[{ key: 'actual', name: 'Measured', colorKey: 'app-series-1' }, { key: 'predicted', name: 'Forecast', colorKey: 'app-forecast', dash: '5 4' }]} t={t} fmt={fmtNum(1)} height={180} />
              <p className="faint small">{bt.method} Published plant studies report 0.8–1.15 MPa on the same basis.</p>
            </Panel>
          </div>
          <div className="split-wide">
            <WhatIf defaultPlant={plant} />
            <Panel flush title="Strength giveaway by grade" eyebrow="Mean 28-day vs release target (BIS + 3 MPa)">
              <div className="table-wrap">
                <table className="app-table compact">
                  <thead><tr><th>Grade</th><th className="numeric">BIS</th><th className="numeric">Mean</th><th className="numeric">σ</th><th className="numeric">Giveaway</th></tr></thead>
                  <tbody>{data.giveaway.map((g) => (
                    <tr key={g.grade}><td>{g.grade}<div className="faint small">{g.standard}</div></td><td className="numeric">{g.bisMin}</td><td className="numeric">{g.mean ?? '—'}</td><td className="numeric">{g.sigma ?? '—'}</td>
                      <td className={`numeric ${g.giveaway > 8 ? 'tone-warning' : ''}`}><b>{g.giveaway == null ? '—' : `${g.giveaway > 0 ? '+' : ''}${g.giveaway}`}</b></td></tr>
                  ))}</tbody>
                </table>
              </div>
              {data.opportunities.length > 0 && <ul className="adv-list" style={{ padding: 12 }}>{data.opportunities.map((a, i) => <AdvRow key={a.id} a={a} rank={i + 1} onApplied={reload} />)}</ul>}
            </Panel>
          </div>
          <Panel flush title="BIS specification limits" eyebrow="Every batch is checked against these (IS 269 · IS 1489 · IS 455 · IS 16415)"
            actions={<DownloadIcon label="Download BIS limits" onClick={() => studio.open({ title: 'BIS specification limits', sections: [tableSection('bis', 'Limits', ['Grade', 'Standard', { h: '3d MPa', num: true }, { h: '7d MPa', num: true }, { h: '28d MPa', num: true }, { h: 'Blaine min', num: true }, { h: 'SO₃ max', num: true }, { h: 'MgO max', num: true }, 'SCM'], data.bis.map((b) => [b.grade, b.standard, b.s3, b.s7, b.s28max ? `${b.s28}–${b.s28max}` : b.s28, b.blaineMin, b.so3Max, b.mgoMax, b.scm]))] })} />}>
            <div className="table-wrap">
              <table className="app-table compact">
                <thead><tr><th>Grade</th><th>Standard</th><th className="numeric">3-day</th><th className="numeric">7-day</th><th className="numeric">28-day</th><th className="numeric">Blaine min</th><th className="numeric">SO₃ max</th><th className="numeric">MgO max</th><th className="numeric">Setting (min)</th><th>Constituents</th></tr></thead>
                <tbody>{data.bis.map((b) => <tr key={b.grade}><td><b>{b.grade}</b></td><td>{b.standard}</td><td className="numeric">{b.s3}</td><td className="numeric">{b.s7}</td><td className="numeric">{b.s28max ? `${b.s28}–${b.s28max}` : `≥ ${b.s28}`}</td><td className="numeric">{b.blaineMin}</td><td className="numeric">{b.so3Max}</td><td className="numeric">{b.mgoMax}</td><td className="numeric">{b.ist} / {b.fst}</td><td>{b.scm}</td></tr>)}</tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Scenario library" eyebrow="Research scenarios — start one and watch it travel through the plant">
            {!lib.data ? <span className="app-spinner" /> : (
              <ul className="list-plain">
                {lib.data.library.filter((s) => ['quality', 'process'].includes(s.domain)).map((s) => (
                  <li key={s.key} className="row" style={{ padding: '9px 0', gap: 10 }}>
                    <span className="mono faint">{s.key}</span>
                    <div className="grow"><b style={{ fontSize: 12.5 }}>{s.title}</b><div className="faint small">{s.plantName} · {s.cause}</div></div>
                    <StatusChip tone={SEV_TONE[s.severity]}>{s.severity}</StatusChip>
                    {s.active.length ? <StatusChip tone="ai"><Sparkles size={10} /> Live · {s.active[0].level}%</StatusChip>
                      : <button type="button" className="app-control-btn btn-sm" onClick={() => start(s)}><Play size={12} /> Start</button>}
                  </li>
                ))}
              </ul>
            )}
            <Callout tone="info" title="Honest about the models" style={{ marginTop: 10, marginBottom: 0 }}>Forecasts here are scored chronologically on this plant's own history. They inform people; they never write to the DCS, QCX or BlendExpert.</Callout>
          </Panel>
        </>}
      </PageState>
    </div>
  );
}
