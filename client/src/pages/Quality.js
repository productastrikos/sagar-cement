// Quality workbench — clinker parameters correlated with finished cement quality,
// aligned on material residence time (the demo's process-lag moment).
import React from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { Download } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useTokens, tick, tooltipStyle } from '../lib/tokens';
import { PLANT_NAME, fmtDay, fmtTime } from '../lib/format';
import { kpisSection, tableSection, seriesSection, textSection } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip } from '../components/Advisory';
import { SeriesChart, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, SelectField, Segmented, DownloadIcon, Callout, usePlantParam } from '../components/ui';

function Scatterplot({ points, t, xLabel, color }) {
  const tt = tooltipStyle(t);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 10, right: 10, left: -6, bottom: 4 }}>
        <CartesianGrid stroke={t['app-chart-grid']} />
        <XAxis type="number" dataKey="x" name={xLabel} tick={tick(t)} domain={['auto', 'auto']} axisLine={{ stroke: t['app-border'] }} tickLine={false} />
        <YAxis type="number" dataKey="y" name="28-day vs grade mean" tick={tick(t)} axisLine={false} tickLine={false} width={44} />
        <ReferenceLine y={0} stroke={t['app-text-faint']} strokeDasharray="2 3" />
        <Tooltip {...tt} cursor={{ strokeDasharray: '3 3' }} formatter={(v) => Number(v).toFixed(2)} />
        <Scatter data={points} fill={color} fillOpacity={0.7} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

const corrColor = (r) => (r >= 0 ? 'var(--app-series-1)' : 'var(--app-teal)');

export default function Quality() {
  const t = useTokens();
  const studio = useStudio();
  const [plant, setPlant, sp, setSp] = usePlantParam('MTP');
  const grade = sp.get('grade') || '';
  const aligned = sp.get('join') !== 'naive';
  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const { data, error, reload } = usePoll('/quality', { plant, grade }, 10000);
  const sc = data?.scatter;
  const chain = (data?.chain || []).map((c) => ({ ...c, d: fmtDay(c.date) }));

  const download = () => studio.open({
    title: 'Quality workbench', subtitle: `${PLANT_NAME[plant]}${grade ? ` · ${grade}` : ''} · clinker-to-cement correlation`, filters: [{ k: 'Plant', v: PLANT_NAME[plant] }, ...(grade ? [{ k: 'Grade', v: grade }] : []), { k: 'Join', v: aligned ? 'Residence-time aligned' : 'Naive timestamp' }],
    sections: [
      kpisSection(data.cards),
      textSection('finding', 'Finding', `Clinker alite (C₃S) explains 28-day strength with r = ${sc.rAligned} when each result is joined to the clinker that actually went into the batch (genealogy, residence-time aligned). Joined naively on the day the 28-day result arrived, the same data gives r = ${sc.rNaive}. Free lime: r = ${sc.rFcao}. n = ${sc.n} batches.`),
      tableSection('matrix', 'Driver matrix (Pearson r)', ['Parameter', { h: 'vs 28-day strength', num: true }, { h: 'vs mill kWh/t', num: true }], data.matrix.map((m) => [m.label, m.s28, m.millSec])),
      seriesSection('chain', 'Residence-time chain (grinding date)', chain, 'd', [{ key: 'c3s', name: 'Clinker C₃S %', colorKey: 'app-series-1' }, { key: 'lsf', name: 'Kiln feed LSF', colorKey: 'app-teal' }], 1),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Quality workbench" subtitle="Clinker parameters correlated with finished cement quality — joined on residence time, not on timestamps"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="quality" match={(a) => a.domain === 'quality'} />
      <FilterBar>
        <PlantSelect value={plant} onChange={setPlant} includeAll={false} />
        <SelectField label="Grade" value={grade} onChange={(v) => setParam('grade', v)} allLabel="All grades" options={data?.grades || []} />
        <label className="fb-field fb-range"><span className="app-label">How lab results are joined</span>
          <Segmented label="Join method" options={[{ value: 'aligned', label: 'Residence-time aligned' }, { value: 'naive', label: 'Naive timestamp join' }]} value={aligned ? 'aligned' : 'naive'} onChange={(v) => setParam('join', v === 'naive' ? 'naive' : '')} /></label>
      </FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards.slice(0, 4)} cols={4} />
          <KpiRow cards={data.cards.slice(4)} cols={4} />
          <div className="split-wide">
            <Panel title="Clinker alite vs 28-day strength" eyebrow={aligned ? 'Each result joined to the clinker that went into its batch' : 'Each result joined to clinker sampled the day the result arrived'}
              actions={<DownloadIcon label="Download scatter data" onClick={() => studio.open({ title: 'Alite vs 28-day strength', filters: [{ k: 'Plant', v: PLANT_NAME[plant] }, { k: 'Join', v: aligned ? 'aligned' : 'naive' }], sections: [tableSection('pts', 'Points', ['Batch', { h: 'C₃S %', num: true }, { h: '28-day vs grade mean MPa', num: true }], (aligned ? sc.aligned : sc.naive).map((p) => [p.id, p.x, p.y]))] })} />}>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginBottom: 10 }}>
                <div className="stat"><div className="stat-label">Aligned join</div><div className="stat-value tone-success">r = {sc.rAligned}</div><div className="stat-sub">genealogy + residence time</div></div>
                <div className="stat"><div className="stat-label">Naive join</div><div className="stat-value tone-danger">r = {sc.rNaive}</div><div className="stat-sub">timestamp of the 28-day result</div></div>
                <div className="stat"><div className="stat-label">Batches</div><div className="stat-value">{sc.n}</div><div className="stat-sub">{grade || 'all grades'} · 200 days</div></div>
              </div>
              <Scatterplot points={aligned ? sc.aligned : sc.naive} t={t} xLabel="C₃S %" color={aligned ? t['app-series-1'] : t['app-text-faint']} />
            </Panel>
            <div className="stack">
              <Callout tone="advisory" title="Why the join matters">
                A 28-day result arrives a month after the clinker was made. Joining it to clinker sampled that day pairs it with the wrong material —
                the relationship disappears (r = {sc.rNaive}). S!aP follows the material: limestone → raw meal (8–12 h silo) → clinker (60–90 min) →
                cement (1–3 days, or 7–14 by rail) → result anchored on the grinding date.
              </Callout>
              <Panel title="Free lime vs 28-day strength" eyebrow={`Aligned · r = ${sc.rFcao}`}>
                <Scatterplot points={sc.fcaoAligned} t={t} xLabel="Free lime %" color={t['app-teal']} />
              </Panel>
            </div>
          </div>
          <div className="grid-2">
            <Panel flush title="Driver matrix" eyebrow="Pearson r · aligned · strength normalised by grade">
              <div className="table-wrap">
                <table className="app-table compact">
                  <thead><tr><th>Clinker / cement parameter</th><th>vs 28-day strength</th><th>vs mill kWh/t</th></tr></thead>
                  <tbody>{data.matrix.map((m) => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      {[m.s28, m.millSec].map((r, i) => (
                        <td key={i}><span className="row"><span style={{ width: 90, height: 8, borderRadius: 999, background: 'var(--app-surface-raised)', position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                          <span style={{ position: 'absolute', top: 0, bottom: 0, left: r >= 0 ? '50%' : `${50 - Math.abs(r) * 50}%`, width: `${Math.abs(r) * 50}%`, background: corrColor(r) }} /></span>
                          <b className="astk-numeric" style={{ fontSize: 11.5 }}>{r > 0 ? '+' : ''}{r}</b></span></td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="panel-pad faint small">Alite raises strength; free lime and belite lower it. Dense, heavy clinker (litre weight) costs mill power.</div>
            </Panel>
            <Panel title="Residence-time chain" eyebrow="Upstream signals lined up on grinding date · last 60 days">
              {[['lsf', 'Kiln feed LSF', 'app-teal', 1], ['fcao', 'Clinker free lime %', 'app-warning', 2], ['c3s', 'Clinker alite C₃S %', 'app-series-1', 1], ['s28', '28-day vs grade mean (MPa)', 'app-info', 1]].map(([k, label, color, dp]) => (
                <div key={k}>
                  <div className="faint small" style={{ fontWeight: 700 }}>{label}</div>
                  <SeriesChart data={chain} xKey="d" series={[{ key: k, name: label, colorKey: color }]} t={t} fmt={fmtNum(dp)} height={78} />
                </div>
              ))}
            </Panel>
          </div>
          <Panel title="Free-lime soft sensor by kiln line" eyebrow="1-minute estimate · last 2 hours">
            <div className="grid-2">
              {data.lines.map((L) => (
                <div key={L.id}>
                  <div className="row between"><b style={{ fontSize: 12.5 }}>{L.name}</b>{L.paused && <span className="status-chip status-chip-warning">Paused by data health</span>}</div>
                  <SeriesChart data={L.est.map((p) => ({ t: fmtTime(new Date(p.t).toISOString()), v: p.v }))} xKey="t" series={[{ key: 'v', name: 'f-CaO %', colorKey: 'app-series-1' }]} t={t} fmt={fmtNum(2)} height={150} />
                </div>
              ))}
            </div>
          </Panel>
        </>}
      </PageState>
    </div>
  );
}
