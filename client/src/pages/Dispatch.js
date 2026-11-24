// ToD & dispatch — 24-hour merit-order dispatch and the grinding-shift what-if
// against FY 2026–27 state ToD tariffs (energy demo, act 3).
import React, { useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Download } from 'lucide-react';
import { usePoll, useLive } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useToast } from '../lib/toast';
import { useTokens, tick, tooltipStyle } from '../lib/tokens';
import { post } from '../lib/api';
import { kpisSection, tableSection, seriesSection } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip } from '../components/Advisory';
import { SeriesChart, Legend, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, Segmented, StatusChip, DownloadIcon, Stat, usePlantParam } from '../components/ui';

const SOURCES = [['WHRS', 'app-teal'], ['Solar', 'app-warning'], ['Hydro', 'app-success'], ['CPP', 'app-info'], ['Grid', 'app-series-1']];
const STATE_COLOR = { TG: 'app-series-1', AP: 'app-teal', MP: 'app-info', OD: 'app-warning' };

export default function Dispatch() {
  const t = useTokens();
  const studio = useStudio();
  const toast = useToast();
  const { refresh } = useLive();
  const [plant, setPlant, sp, setSp] = usePlantParam('DCP');
  const shift = Number(sp.get('shift') ?? 4);
  const setShift = (v) => { const n = new URLSearchParams(sp); n.set('shift', v); setSp(n, { replace: true }); };
  const [view, setView] = useState('opt');
  const { data, error, reload } = usePoll('/dispatch', { plant, shift }, 10000);
  const d = data?.dispatch;
  const rows = (d?.rows || []).map((r) => ({ h: `${String(r.hour).padStart(2, '0')}:00`, rate: r.rate, slot: r.slotLabel, baseLoad: r.base.load, ...Object.fromEntries(SOURCES.map(([k]) => [k, r[view][k]])) }));
  const curves = data ? Array.from({ length: 24 }, (_, h) => ({ h: `${String(h).padStart(2, '0')}`, ...Object.fromEntries(data.tariffs.map((x) => [x.state, x.curve[h].rate])) })) : [];
  const tt = tooltipStyle(t);

  const adopt = async () => {
    try { await post('/dispatch/adopt', { plant }); toast('success', 'ToD schedule adopted', `${data.plantName} grinding plan updated — logged to the audit trail.`); reload(); refresh(); }
    catch (e) { toast('danger', 'Could not adopt schedule', e.message); }
  };
  const download = () => studio.open({
    title: `ToD & dispatch · ${data.plantName}`, subtitle: `${data.regulator} tariff · shifting ${shift} mill-hours out of peak`, filters: [{ k: 'Plant', v: data.plantName }, { k: 'Shift', v: `${shift} h` }],
    sections: [
      kpisSection(data.cards),
      { id: 'sum', type: 'kpis', title: 'Optimisation result', items: [
        { label: 'Baseline cost', value: `₹${d.baseCostLakh} lakh/day` }, { label: 'Optimised cost', value: `₹${d.optCostLakh} lakh/day` },
        { label: 'Savings', value: `₹${d.savingsLakhDay} lakh/day`, sub: `≈ ₹${d.savingsCrYear} crore/year` }, { label: 'Peak-slot grid share', value: `${d.peakShareBase}% → ${d.peakShareOpt}%` },
      ] },
      seriesSection('stack', `24-hour supply (${view === 'opt' ? 'optimised' : 'baseline'}, MW)`, rows, 'h', SOURCES.map(([k, c]) => ({ key: k, name: k, type: 'area', colorKey: c })), 1, true),
      tableSection('hours', 'Hourly plan', ['Hour', 'Slot', { h: '₹/unit', num: true }, { h: 'Base grid MW', num: true }, { h: 'Opt grid MW', num: true }, { h: 'Base ₹', num: true }, { h: 'Opt ₹', num: true }],
        d.rows.map((r) => [`${String(r.hour).padStart(2, '0')}:00`, r.slotLabel, r.rate, r.base.Grid, r.opt.Grid, Math.round(r.base.costRs), Math.round(r.opt.costRs)])),
      seriesSection('curves', 'ToD tariff curves by state (₹/unit)', curves, 'h', data.tariffs.map((x) => ({ key: x.state, name: `${x.state} (${x.regulator})`, colorKey: STATE_COLOR[x.state] })), 2),
      tableSection('fleet', 'Fleet opportunity (4 h shift)', ['Plant', { h: '₹ lakh/day', num: true }, { h: '₹ crore/year', num: true }, { h: 'Peak share %', num: true }, 'Adopted'], data.fleet.map((f) => [f.name, f.savingsLakhDay, f.savingsCrYear, f.peakShare, f.adopted ? 'Yes' : 'No'])),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="ToD & dispatch" subtitle="Merit-order supply and grinding schedules against FY 2026–27 TGERC, APERC, MPERC and OERC time-of-day tariffs"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="dispatch" match={(a) => ['TOD', 'PR'].includes(a.key)} />
      <FilterBar>
        <PlantSelect value={plant} onChange={setPlant} includeAll={false} />
        <label className="fb-field fb-range"><span className="app-label">Mill-hours moved out of peak</span>
          <Segmented label="Shift hours" options={[0, 1, 2, 3, 4].map((h) => ({ value: h, label: `${h} h` }))} value={shift} onChange={setShift} /></label>
        <label className="fb-field fb-range"><span className="app-label">Chart</span>
          <Segmented label="Schedule" options={[{ value: 'base', label: 'Baseline' }, { value: 'opt', label: 'Optimised' }]} value={view} onChange={setView} /></label>
      </FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} />
          <Panel title={`24-hour supply plan · ${data.plantName}`} eyebrow={`${view === 'opt' ? 'Optimised' : 'Baseline'} · MW by source, cheapest first · dashed line = grid rate (₹ per billing unit)`}
            actions={<><Legend items={[...SOURCES.map(([k, c]) => ({ kind: 'dot', color: t[c], label: k })), ...(view === 'opt' ? [{ kind: 'line', dash: 'dotted', color: t['app-chart-ref'], label: 'Baseline load' }] : []), { kind: 'line', dash: 'dashed', color: t['app-danger'], label: 'Grid ₹/unit' }]} />
              <DownloadIcon label="Download supply plan" onClick={download} /></>}>
            <div role="img" aria-label={`24-hour ${view} supply plan for ${data.plantName}`}>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={rows} margin={{ top: 10, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={t['app-chart-grid']} />
                  <XAxis dataKey="h" tick={tick(t)} axisLine={{ stroke: t['app-border'] }} tickLine={false} interval={2} />
                  <YAxis yAxisId="mw" tick={tick(t)} axisLine={false} tickLine={false} width={40} />
                  <YAxis yAxisId="rate" orientation="right" tick={tick(t)} axisLine={false} tickLine={false} width={40} domain={[3, 'auto']} />
                  <Tooltip {...tt} formatter={(v, n) => (n === 'Grid rate' ? `₹${v}` : `${Number(v).toFixed(2)} MW`)} />
                  {SOURCES.map(([k, c]) => <Area key={k} yAxisId="mw" type="stepAfter" dataKey={k} stackId="s" stroke={t[c]} fill={t[c]} fillOpacity={0.3} strokeWidth={1.2} isAnimationActive={false} />)}
                  {view === 'opt' && <Line yAxisId="mw" type="stepAfter" dataKey="baseLoad" name="Baseline load" stroke={t['app-chart-ref']} strokeDasharray="2 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                  <Line yAxisId="rate" type="stepAfter" dataKey="rate" name="Grid rate" stroke={t['app-danger']} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="stat-grid mt-12">
              <Stat label="Baseline cost" value={`₹${d.baseCostLakh}L`} sub="per day" />
              <Stat label="Optimised cost" value={`₹${d.optCostLakh}L`} sub="per day" />
              <Stat label="Savings" value={`₹${d.savingsLakhDay}L`} sub={`per day · ≈ ₹${d.savingsCrYear} crore/year`} tone="success" />
              <Stat label="Peak-slot grid share" value={`${d.peakShareBase}% → ${d.peakShareOpt}%`} sub={`${d.movedMwh} MWh moved · ${d.co2AvoidedT} t CO₂ indirect`} />
            </div>
            <div className="row wrap mt-12">
              {data.adopted ? <StatusChip tone="success"><CheckCircle2 size={10} /> Schedule adopted at {data.plantName}</StatusChip>
                : <button type="button" className="app-primary-btn btn-md" onClick={adopt} disabled={shift === 0}>Adopt this schedule for {data.plantName}</button>}
              <span className="faint small">{d.constraint} {data.note}</span>
            </div>
          </Panel>
          <div className="split-wide">
            <Panel title="Time-of-day tariffs across Sagar's four states" eyebrow="₹ per billing unit · 132 kV unless the plant is on 33 kV"
              actions={<Legend items={data.tariffs.map((x) => ({ kind: 'line', color: t[STATE_COLOR[x.state]], label: `${x.state} · ${x.unit}` }))} />}>
              <SeriesChart data={curves} xKey="h" series={data.tariffs.map((x) => ({ key: x.state, name: x.state, colorKey: STATE_COLOR[x.state] }))} t={t} fmt={fmtNum(2)} height={230} />
              <p className="faint small">TG, AP and OD bill on kVAh; MP bills kWh with a PF rebate. Peak-to-cheap spread is widest in MP (≈ ₹2.5) and narrowest in Odisha (≈ ₹0.95).</p>
            </Panel>
            <Panel flush title="Fleet opportunity" eyebrow="4 mill-hours a day moved out of peak">
              <div className="table-wrap">
                <table className="app-table compact">
                  <thead><tr><th>Plant</th><th className="numeric">₹ lakh/day</th><th className="numeric">₹ crore/yr</th><th className="numeric">Peak share</th><th /></tr></thead>
                  <tbody>{data.fleet.map((f) => (
                    <tr key={f.id} className={`is-clickable ${f.id === plant ? 'is-selected' : ''}`} tabIndex={0} onClick={() => setPlant(f.id)} onKeyDown={(e) => e.key === 'Enter' && setPlant(f.id)}>
                      <td>{f.name}<div className="faint small">{f.state}</div></td><td className="numeric">{f.savingsLakhDay}</td><td className="numeric">{f.savingsCrYear}</td><td className="numeric">{f.peakShare}%</td>
                      <td>{f.adopted && <StatusChip tone="success">Adopted</StatusChip>}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="panel-pad faint small">Merit order: WHRS ₹{data.sourceCost.WHRS} → solar ₹{data.sourceCost.Solar} → wheeled hydro ₹{data.sourceCost.Hydro} → CPP ₹{data.sourceCost.CPP} → grid by ToD slot. Estimates; a real POC reconciles against six months of DISCOM invoices.</div>
            </Panel>
          </div>
        </>}
      </PageState>
    </div>
  );
}
