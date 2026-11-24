// Energy scorecard — energy management and process efficiency vs Sagar's FY27 /
// FY30 targets and CII benchmarks (energy demo, act 1).
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useTokens } from '../lib/tokens';
import { PLANT_NAME } from '../lib/format';
import { kpisSection, tableSection, seriesSection, trendSection, plantFilter } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip } from '../components/Advisory';
import { SeriesChart, TrendChart, Legend, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, DownloadIcon, Progress, usePlantParam } from '../components/ui';

const MIX = [['Grid', 'app-series-1'], ['CPP', 'app-info'], ['WHRS', 'app-teal'], ['Solar', 'app-warning'], ['Hydro', 'app-success']];

export default function Energy() {
  const t = useTokens();
  const navigate = useNavigate();
  const studio = useStudio();
  const [plant, setPlant] = usePlantParam();
  const { data, error, reload } = usePoll('/energy', { plant }, 8000);
  const mix = (data?.plants || []).map((p) => ({ plant: p.name, ...p.mix }));
  const mixSeries = MIX.map(([k, c]) => ({ key: k, name: k, type: 'bar', colorKey: c }));

  const progressOf = (x) => {
    const tgt = x.fy27 ?? x.fy30;
    if (!tgt || x.current == null) return 0;
    return x.goodUp ? (x.current / tgt) * 100 : (tgt / x.current) * 100;
  };
  const download = () => studio.open({
    title: 'Energy scorecard', subtitle: 'Six plants vs FY27 / FY30 targets and CII benchmarks', filters: plantFilter(plant, PLANT_NAME[plant]),
    sections: [
      kpisSection(data.cards),
      tableSection('targets', 'Progress to targets', ['Metric', { h: 'Current', num: true }, { h: 'FY27', num: true }, { h: 'FY30', num: true }, 'Unit'], data.targets.map((x) => [x.label, x.current, x.fy27 ?? '—', x.fy30 ?? '—', x.unit])),
      tableSection('plants', 'Plant comparison', ['Plant', { h: 'SEC kWh/t', num: true }, { h: 'SHC kcal/kg', num: true }, { h: 'Green %', num: true }, { h: '₹/kWh', num: true }, { h: 'P&F ₹/t', num: true }, { h: 'CO₂ kg/t', num: true }],
        data.plants.map((p) => [p.name, p.sec, p.shc ?? '—', p.green, p.powerCost, p.pfCost, p.co2])),
      seriesSection('mix', 'Live supply mix by plant (MW)', mix, 'plant', mixSeries, 1, true),
      trendSection('sec', 'Electrical SEC — 1 year', data.trend.sec, 1),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Energy scorecard" subtitle="Energy management and process efficiency across six plants — against FY27 / FY30 targets and CII v7.0 benchmarks"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="energy" match={(a) => a.domain === 'energy'} />
      <FilterBar showReset={!!plant} onReset={() => setPlant('')}><PlantSelect value={plant} onChange={setPlant} /></FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards.slice(0, 5)} cols={5} />
          <KpiRow cards={data.cards.slice(5)} cols={5} />
          <div className="split-wide">
            <Panel flush title="Plant comparison" eyebrow="Live · click a plant to filter"
              actions={<DownloadIcon label="Download plant comparison" onClick={() => studio.open({ title: 'Energy plant comparison', sections: [tableSection('plants', 'Plants', ['Plant', { h: 'Load MW', num: true }, { h: 'SEC', num: true }, { h: 'SHC', num: true }, { h: 'Green %', num: true }, { h: '₹/kWh', num: true }, 'ToD slot'], data.plants.map((p) => [p.name, p.loadMw, p.sec, p.shc ?? '—', p.green, p.powerCost, `${p.slot} ₹${p.rate}/${p.unit}`]))] })} />}>
              <div className="table-wrap">
                <table className="app-table">
                  <thead><tr><th>Plant</th><th className="numeric">Load MW</th><th className="numeric">SEC kWh/t</th><th className="numeric">SHC kcal/kg</th><th className="numeric">Green %</th><th className="numeric">₹/kWh</th><th className="numeric">P&amp;F ₹/t</th><th>ToD slot now</th></tr></thead>
                  <tbody>{data.plants.map((p) => (
                    <tr key={p.id} className={`is-clickable ${plant === p.id ? 'is-selected' : ''}`} tabIndex={0} onClick={() => setPlant(plant === p.id ? '' : p.id)} onKeyDown={(e) => e.key === 'Enter' && setPlant(p.id)}>
                      <td><b>{p.name}</b><div className="faint small">{p.state} · {p.type}</div></td><td className="numeric">{p.loadMw}</td>
                      <td className={`numeric ${p.sec > 75 ? 'tone-danger' : p.sec > 70 ? 'tone-warning' : ''}`}>{p.sec}</td><td className="numeric">{p.shc ?? '—'}</td>
                      <td className="numeric">{p.green}</td><td className="numeric">{p.powerCost}</td><td className="numeric">{p.pfCost.toLocaleString('en-IN')}</td>
                      <td><span className={`slot slot-${p.slot.toLowerCase().replace('-', '')}`}>{p.slot}</span> <span className="faint small">₹{p.rate}/{p.unit}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Progress to targets" eyebrow={plant ? PLANT_NAME[plant] : 'Fleet'}>
              <div className="stack" style={{ gap: 12 }}>
                {data.targets.map((x) => (
                  <div key={x.label}>
                    <div className="row between small"><b>{x.label}</b><span className="muted">{x.current} {x.unit} · {x.fy27 != null ? `FY27 ${x.fy27}` : ''}{x.fy27 != null && x.fy30 != null ? ' · ' : ''}{x.fy30 != null ? `FY30 ${x.fy30}` : ''}</span></div>
                    <Progress pct={progressOf(x)} goodUp />
                  </div>
                ))}
              </div>
              <p className="faint small mt-12">Targets from Sagar's FY26 integrated report and ESG roadmap. TSR is far behind its 15% FY27 target — AFR and syngas need real-time burnability correlation before they scale.</p>
            </Panel>
          </div>
          <div className="grid-2">
            <Panel title="Live supply mix" eyebrow="MW by source, this hour" actions={<Legend items={MIX.map(([k, c]) => ({ kind: 'dot', color: t[c], label: k }))} />}>
              <SeriesChart data={mix} xKey="plant" series={mixSeries} t={t} fmt={fmtNum(1)} height={250} stacked />
            </Panel>
            <Panel title="Electrical SEC — 1 year" eyebrow={plant ? PLANT_NAME[plant] : 'Fleet'} actions={<button type="button" className="app-ghost-btn btn-sm" onClick={() => navigate(`/efficiency${plant ? `?plant=${plant}` : ''}`)}>Sectional view</button>}>
              <TrendChart s={data.trend.sec} showF showC={false} fmt={fmtNum(1)} label="Electrical SEC" t={t} height={250} refLines={[{ y: 70, label: 'FY27 70', tone: 'success' }, { y: 65, label: 'FY30 65', tone: 'info' }]} />
            </Panel>
          </div>
          <div className="split-wide">
            <Panel title="Green power share — 30 days" eyebrow="WHRS + captive solar + wheeled hydro">
              <TrendChart s={data.trend.green} showF showC fmt={fmtNum(1)} label="Green power share" t={t} height={220} refLines={[{ y: 24, label: 'FY27 24%', tone: 'success' }]} />
            </Panel>
            <Panel title="Compliance &amp; certification">
              <dl className="kv">{data.compliance.map((c) => <React.Fragment key={c.label}><dt>{c.label}</dt><dd>{c.text}</dd></React.Fragment>)}</dl>
            </Panel>
          </div>
        </>}
      </PageState>
    </div>
  );
}
