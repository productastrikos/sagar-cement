// Process efficiency — section-wise SEC vs plant best and CII v7.0, the kiln
// heat-loss waterfall, false air and over-grinding (energy demo, act 4).
import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useTokens, tick, catTick, tooltipStyle } from '../lib/tokens';
import { kpisSection, tableSection, trendSection } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip } from '../components/Advisory';
import { TrendChart, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, Stat, DownloadIcon, Callout, usePlantParam } from '../components/ui';

function Waterfall({ heat, t }) {
  let acc = 0;
  const rows = heat.parts.map((p) => { const r = { key: p.key, base: acc, value: p.value }; acc += p.value; return r; });
  rows.push({ key: 'Specific heat consumption', base: 0, value: heat.shc, total: true });
  const tt = tooltipStyle(t);
  return (
    <div role="img" aria-label={`Kiln heat balance: ${heat.shc} kcal/kg clinker`}>
      <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 34)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid horizontal={false} stroke={t['app-chart-grid']} />
          <XAxis type="number" tick={tick(t)} axisLine={false} tickLine={false} domain={[0, Math.ceil((heat.shc + 20) / 50) * 50]} />
          <YAxis type="category" dataKey="key" width={190} tick={catTick(t)} axisLine={false} tickLine={false} />
          <Tooltip {...tt} formatter={(v, n) => (n === 'base' ? null : `${v} kcal/kg`)} cursor={{ fill: t['app-accent'], fillOpacity: 0.05 }} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={r.key} fill={r.total ? t['app-series-1'] : i === 0 ? t['app-text-faint'] : t['app-warning-bar']} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Efficiency() {
  const t = useTokens();
  const studio = useStudio();
  const [plant, setPlant] = usePlantParam('MTP');
  const { data, error, reload } = usePoll('/efficiency', { plant }, 10000);
  const tt = tooltipStyle(t);
  const secTable = () => tableSection('sections', 'Section-wise SEC', ['Section', 'Unit', { h: 'Current', num: true }, { h: 'Plant best', num: true }, { h: 'CII best', num: true }, { h: 'Gap to CII %', num: true }],
    data.sections.map((s) => [s.section, s.unit, s.current, s.best, s.cii, Math.round(((s.current - s.cii) / s.cii) * 100)]));
  const download = () => studio.open({
    title: `Process efficiency · ${data.plantName}`, subtitle: 'Section-wise SEC, kiln heat balance, false air and over-grinding', filters: [{ k: 'Plant', v: data.plantName }],
    sections: [
      kpisSection(data.cards), secTable(),
      ...(data.heat ? [tableSection('heat', `Kiln heat balance — ${data.heat.shc} kcal/kg clinker`, ['Stream', { h: 'kcal/kg', num: true }], data.heat.parts.map((p) => [p.key, p.value]))] : []),
      ...(data.falseAir ? [trendSection('fa', 'Preheater false air — 24 hours', data.falseAir.series, 1)] : []),
      tableSection('grind', 'Over-grinding monitor', ['Grade', { h: 'Blaine m²/kg', num: true }, { h: 'Mill kWh/t', num: true }], data.grind.slice(0, 120).map((g) => [g.grade, g.x, g.y])),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Process efficiency" subtitle="Section-wise SEC against the plant's own best and CII v7.0, the kiln heat balance, false air and over-grinding"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="efficiency" match={(a) => a.domain === 'energy' || a.domain === 'process'} />
      <FilterBar><PlantSelect value={plant} onChange={setPlant} includeAll={false} /></FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} cols={data.cards.length === 6 ? 6 : 4} />
          <div className="split-wide">
            <Panel flush title="Section-wise SEC" eyebrow="Current vs plant best vs CII v7.0 best-in-class"
              actions={<DownloadIcon label="Download section SEC" onClick={() => studio.open({ title: `Section-wise SEC · ${data.plantName}`, sections: [secTable()] })} />}>
              <div className="table-wrap">
                <table className="app-table">
                  <thead><tr><th>Section</th><th className="numeric">Current</th><th className="numeric">Plant best</th><th className="numeric">CII best</th><th>Gap to CII</th></tr></thead>
                  <tbody>{data.sections.map((s) => {
                    const gap = ((s.current - s.cii) / s.cii) * 100;
                    return (
                      <tr key={s.section}><td><b>{s.section}</b><div className="faint small">{s.unit}</div></td><td className="numeric">{s.current}</td><td className="numeric">{s.best}</td><td className="numeric">{s.cii}</td>
                        <td><span className="row"><span className="progress-track" style={{ width: 90 }}><span className="progress-fill" style={{ display: 'block', width: `${Math.min(100, Math.max(0, gap) * 2.5)}%`, background: gap > 20 ? 'var(--app-danger)' : gap > 8 ? 'var(--app-warning)' : 'var(--app-success)' }} /></span><b className="small">{gap > 0 ? '+' : ''}{gap.toFixed(0)}%</b></span></td></tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div className="panel-pad faint small">Realistic analytics upside: 2–4 kWh/t electrical and 10–15 kcal/kg thermal — not the 15–25% sometimes quoted for other sectors.</div>
            </Panel>
            {data.whrs ? (
              <Panel title="Waste-heat recovery" eyebrow="Generation vs the CII rule of thumb">
                <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                  <Stat label="Installed" value={`${data.whrs.mw} MW`} sub={`${data.whrs.kwPerTpd} kW per TPD clinker`} />
                  <Stat label="Generation" value={`${data.whrs.kwhT}`} sub={`kWh/t clinker · CII best ${data.whrs.cii}`} tone={data.whrs.kwhT < 25 ? 'danger' : 'warning'} />
                </div>
                <Callout tone="info" title="Reading this" style={{ marginTop: 10, marginBottom: 0 }}>Modern 6-stage kilns yield about 1.25–1.8 kW per TPD. Low kWh/t here points at availability and boiler fouling, not sizing alone — Sagar's FY26 fleet averaged about 11.5 kWh/t.</Callout>
              </Panel>
            ) : (
              <Panel title="Grinding unit" eyebrow="No kiln at this site"><p className="muted small">{data.plantName} grinds clinker shipped by rail, so efficiency here is about the mill circuit, packing and compressed air.</p></Panel>
            )}
          </div>
          {data.heat && (
            <div className="grid-2">
              <Panel title="Kiln heat balance" eyebrow={`${data.heat.shc} kcal/kg clinker · best-in-class ${data.heat.best}`}>
                <Waterfall heat={data.heat} t={t} />
                <p className="faint small">Theoretical clinker-formation heat is fixed at 412.5 kcal/kg; everything to its right is controllable loss.</p>
              </Panel>
              <Panel title="Preheater false air" eyebrow="ΔO₂ across the preheater · last 24 hours">
                <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', marginBottom: 8 }}>
                  <Stat label="Now" value={`${data.falseAir.current}%`} sub="normal ≤ 5%" tone={data.falseAir.current > 10 ? 'danger' : data.falseAir.current > 5 ? 'warning' : 'success'} />
                  <Stat label="Cost above 5%" value={`₹${data.falseAir.costLakhDay}L`} sub="per day in fuel (≈ 3 kcal/kg per 1%)" />
                </div>
                <TrendChart s={data.falseAir.series} showF showC fmt={fmtNum(1)} label="False air" t={t} height={180} refLines={[{ y: 5, label: '5% normal', tone: 'warning' }]} />
              </Panel>
            </div>
          )}
          <Panel title="Over-grinding monitor" eyebrow="Blaine vs mill kWh/t · last 90 days of batches — every 10 m²/kg extra costs 2–3 kWh/t">
            <ResponsiveContainer width="100%" height={250}>
              <ScatterChart margin={{ top: 10, right: 10, left: -6, bottom: 4 }}>
                <CartesianGrid stroke={t['app-chart-grid']} />
                <XAxis type="number" dataKey="x" name="Blaine m²/kg" tick={tick(t)} domain={['auto', 'auto']} axisLine={{ stroke: t['app-border'] }} tickLine={false} />
                <YAxis type="number" dataKey="y" name="Mill kWh/t" tick={tick(t)} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} />
                <Tooltip {...tt} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={data.grind} fill={t['app-series-1']} fillOpacity={0.65} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>
        </>}
      </PageState>
    </div>
  );
}
