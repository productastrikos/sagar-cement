// Power automation — substation telemetry, the 15-minute MD predictor and
// power quality (energy demo, act 2: the peak-tariff alarm).
import React from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Zap } from 'lucide-react';
import { usePoll, useLive } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useToast } from '../lib/toast';
import { useTokens, tick, tooltipStyle } from '../lib/tokens';
import { post } from '../lib/api';
import { num } from '../lib/format';
import { kpisSection, tableSection, seriesSection } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip, AdvRow } from '../components/Advisory';
import { Legend } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, StatusChip, DownloadIcon, Callout, KV, usePlantParam } from '../components/ui';

function SLD({ sld, plantName }) {
  const W = 900; const busY = 190;
  const feeders = sld.feeders;
  const busA = feeders.filter((f) => f.bus === 'A'); const busB = feeders.filter((f) => f.bus === 'B');
  const place = (list, x0, x1) => list.map((f, i) => ({ ...f, x: x0 + ((x1 - x0) / list.length) * (i + 0.5) }));
  const fa = place(busA, 40, 430); const fb = place(busB, 470, 860);
  const src = sld.sources.filter((s) => s.key !== 'Grid' && s.status !== 'none');
  const srcPos = src.map((s, i) => ({ ...s, x: i < Math.ceil(src.length / 2) ? 70 + i * 130 : W - 70 - (i - Math.ceil(src.length / 2)) * 130 }));
  const inc = sld.incomer;
  const incCls = inc.pct >= 100 ? 'is-crit' : inc.pct >= 95 ? 'is-warn' : '';
  return (
    <svg className="sld" viewBox={`0 0 ${W} 330`} role="img" aria-label={`${plantName} single-line diagram: grid incomer ${num(inc.kva)} kVA, ${inc.pct}% of contract demand`}>
      <rect x={W / 2 - 80} y="6" width="160" height="50" rx="10" className={`sld-box ${incCls}`} />
      <text x={W / 2} y="26" textAnchor="middle" className="sld-label">{inc.kv} kV grid incomer</text>
      <text x={W / 2} y="45" textAnchor="middle" className="sld-value">{num(inc.kva)} kVA · {inc.pct}% CMD</text>
      <line x1={W / 2} y1="56" x2={W / 2} y2="84" className="sld-line" /><line x1={W / 2} y1="56" x2={W / 2} y2="84" className="sld-flow" />
      <circle cx={W / 2} cy="98" r="14" fill="none" className="sld-line" /><circle cx={W / 2} cy="116" r="14" fill="none" className="sld-line" />
      <text x={W / 2 + 24} y="104" className="sld-faint">{num(sld.transformer.ratingKva)} kVA · {sld.transformer.loadPct}% · {sld.transformer.temp} °C</text>
      <line x1={W / 2} y1="130" x2={W / 2} y2={busY} className="sld-line" /><line x1={W / 2} y1="130" x2={W / 2} y2={busY} className="sld-flow" />
      <line x1="30" y1={busY} x2="440" y2={busY} className="sld-bus" /><line x1="460" y1={busY} x2="870" y2={busY} className="sld-bus" />
      <rect x="436" y={busY - 7} width="28" height="14" rx="6" className="sld-box" /><text x={W / 2} y={busY - 12} textAnchor="middle" className="sld-faint">coupler</text>
      <text x="34" y={busY - 8} className="sld-faint">6.6 kV bus A</text><text x="866" y={busY - 8} textAnchor="end" className="sld-faint">6.6 kV bus B</text>
      {srcPos.map((s) => (
        <g key={s.key}>
          <rect x={s.x - 56} y="76" width="112" height="44" rx="10" className={`sld-box ${s.status !== 'online' ? 'is-off' : ''}`} />
          <text x={s.x} y="94" textAnchor="middle" className="sld-label">{s.key}{s.capacity ? ` · ${s.capacity} MW` : ''}</text>
          <text x={s.x} y="112" textAnchor="middle" className="sld-value">{s.status === 'online' ? `${s.mw} MW` : s.status}</text>
          <line x1={s.x} y1="120" x2={s.x} y2={busY} className="sld-line" />{s.status === 'online' && s.mw > 0.05 && <line x1={s.x} y1="120" x2={s.x} y2={busY} className="sld-flow" />}
        </g>
      ))}
      {[...fa, ...fb].map((f) => (
        <g key={f.key}>
          <line x1={f.x} y1={busY} x2={f.x} y2="236" className="sld-line" />{f.kw > 0 && <line x1={f.x} y1={busY} x2={f.x} y2="236" className="sld-flow" />}
          <rect x={f.x - 46} y="236" width="92" height="74" rx="10" className={`sld-box ${f.rescheduled ? 'is-off' : f.loadPct > 100 ? 'is-crit' : f.loadPct > 90 ? 'is-warn' : ''}`} />
          <text x={f.x} y="254" textAnchor="middle" className="sld-label">{f.name.length > 15 ? `${f.name.slice(0, 14)}…` : f.name}</text>
          <text x={f.x} y="273" textAnchor="middle" className="sld-value">{f.rescheduled ? 'off-peak' : `${num(f.kw)} kW`}</text>
          <text x={f.x} y="290" textAnchor="middle" className="sld-faint">PF {f.pf}{f.vfd ? ` · THD ${f.thd}%` : ''}</text>
          <text x={f.x} y="303" textAnchor="middle" className="sld-faint">{f.rescheduled ? 'rescheduled' : `${f.loadPct}% load`}</text>
        </g>
      ))}
    </svg>
  );
}

function MdChart({ md, t }) {
  const rows = [
    ...md.samples.map((v, i) => ({ l: i === md.samples.length - 1 ? 'now' : `−${((md.samples.length - 1 - i) * 30 / 60).toFixed(1)}m`, actual: v })),
    ...md.forecast.map((v, i) => ({ l: `+${(((i + 1) * 30) / 60).toFixed(1)}m`, forecast: v })),
  ];
  rows[md.samples.length - 1].forecast = md.samples[md.samples.length - 1];
  const tt = tooltipStyle(t);
  return (
    <div role="img" aria-label={`15-minute MD: live ${md.live}%, projected ${md.projected}% of contract demand`}>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={rows} margin={{ top: 12, right: 10, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={t['app-chart-grid']} />
          <XAxis dataKey="l" tick={tick(t)} axisLine={{ stroke: t['app-border'] }} tickLine={false} minTickGap={20} />
          <YAxis tick={tick(t)} axisLine={false} tickLine={false} width={44} domain={[40, (dataMax) => Math.max(130, Math.ceil(dataMax + 5))]} tickFormatter={(v) => `${v}%`} />
          <Tooltip {...tt} formatter={(v) => `${v}% CMD`} />
          <ReferenceLine y={95} stroke={t['app-warning']} strokeDasharray="4 3" strokeWidth={1.25} label={{ value: '95% warn', position: 'insideTopRight', fill: t['app-warning'], fontSize: 9, fontFamily: 'Lato', fontWeight: 700 }} />
          <ReferenceLine y={100} stroke={t['app-danger']} strokeDasharray="4 3" strokeWidth={1.25} label={{ value: '100% CMD', position: 'insideTopRight', fill: t['app-danger'], fontSize: 9, fontFamily: 'Lato', fontWeight: 700 }} />
          <ReferenceLine y={120} stroke={t['app-danger']} strokeDasharray="2 3" label={{ value: '120% surcharge', position: 'insideTopRight', fill: t['app-danger'], fontSize: 9, fontFamily: 'Lato', fontWeight: 700 }} />
          <Area dataKey="actual" stroke={t['app-series-1']} strokeWidth={2} fill={t['app-series-1-fill']} isAnimationActive={false} />
          <Line dataKey="forecast" stroke={t['app-forecast']} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
          <ReferenceLine x="now" stroke={t['app-text-faint']} strokeDasharray="2 3" label={{ value: 'NOW', position: 'insideTopLeft', fill: t['app-text-faint'], fontSize: 9, fontWeight: 700, fontFamily: 'Lato' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Power() {
  const t = useTokens();
  const studio = useStudio();
  const toast = useToast();
  const { live, refresh } = useLive();
  const [plant, setPlant] = usePlantParam('DCP');
  const { data, error, reload } = usePoll('/power', { plant });
  const e1Adv = (live?.advisory?.top || []).find((a) => a.key === 'E1' && a.plant === plant);

  const ramp = async () => {
    try { await post('/power/ramp', { plant }); toast('warning', 'Mills ramping inside the peak window', 'Watch the 15-minute predictor climb past 95% of contract demand.'); reload(); refresh(); }
    catch (e) { toast('danger', 'Could not start the ramp', e.message); }
  };
  const feederTable = () => tableSection('feeders', 'Feeders', ['Feeder', 'Bus', { h: 'kW', num: true }, { h: 'PF', num: true }, { h: 'THD %', num: true }, 'VFD', 'Shiftable', 'Status'],
    data.sld.feeders.map((f) => [f.name, f.bus, f.kw, f.pf, f.thd, f.vfd ? 'Yes' : 'No', f.shiftable ? 'Yes' : 'No', f.rescheduled ? 'Rescheduled to off-peak' : `${f.loadPct}% load`]));
  const download = () => studio.open({
    title: `Power automation · ${data.plantName}`, subtitle: `${data.regulator} · ${data.category}`, filters: [{ k: 'Plant', v: data.plantName }, { k: 'ToD slot', v: `${data.tariff.slot} ₹${data.tariff.rate}/${data.tariff.unit}` }],
    sections: [
      kpisSection(data.cards),
      seriesSection('md', `15-minute MD — projected ${data.md.projected}% of ${num(data.md.cmdKva)} kVA`, [...data.md.samples.map((v, i) => ({ s: `−${data.md.samples.length - 1 - i}`, live: v })), ...data.md.forecast.map((v, i) => ({ s: `+${i + 1}`, forecast: v }))], 's', [{ key: 'live', name: 'MD % CMD', colorKey: 'app-series-1' }, { key: 'forecast', name: 'Forecast', colorKey: 'app-forecast', dash: '5 4' }], 1),
      feederTable(),
      tableSection('rules', 'Tariff rules', ['Rule', 'Detail'], [['MD', data.tariff.mdRule], ['Power factor', data.tariff.pfRule], ['Demand charge', `₹${data.tariff.demandPerKva}/kVA`], ['Exposure now', data.md.exposure.text], ['kVAh loss', `₹${data.kvahLossLakh} lakh/month`]]),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Power automation" subtitle="Substation telemetry, the 15-minute MD predictor and power quality — read-only from IEC 61850 / Modbus meters"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="power" match={(a) => ['E1', 'PF'].includes(a.key)} />
      <FilterBar><PlantSelect value={plant} onChange={setPlant} includeAll={false} /></FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} cols={6} />
          <Panel eyebrow={`Live test · ${data.regulator}`} title="The peak-tariff alarm">
            <div className="row wrap gap-12">
              <button type="button" className="app-control-btn btn-md" onClick={ramp} disabled={data.e1.active}><Zap size={14} /> {data.e1.active ? 'Ramp in progress' : 'Ramp the mills inside the peak window'}</button>
              <span className="row small"><span className={`slot slot-${data.tariff.slot.toLowerCase().replace('-', '')}`}>{data.tariff.slot}</span> ₹{data.tariff.rate}/{data.tariff.unit} now · next: {data.tariff.nextSlot}</span>
              {data.e1.active && <StatusChip tone="warning">E1 live · {data.e1.applied}/{data.e1.of} actions applied</StatusChip>}
            </div>
            <p className="faint small" style={{ margin: '10px 0 0', maxWidth: 'none' }}>
              Kilns must run 24×7, but cement and raw mills sit between silos. When they ramp together in a peak slot, the 15-minute window heads for the contract demand.
              {plant === 'DCP' ? ' At Dachepalli the 30 MW CPP is non-operational, so every extra megawatt lands on the grid.' : ''}
            </p>
          </Panel>
          {e1Adv && <ul className="adv-list"><AdvRow a={e1Adv} rank={1} onApplied={() => { reload(); refresh(); }} /></ul>}
          <div className="split-wide">
            <Panel title="15-minute maximum demand" eyebrow={`Projected ${data.md.projected}% of ${num(data.md.cmdKva)} kVA contract demand`}
              actions={<Legend items={[{ kind: 'dot', color: t['app-series-1'], label: 'Live' }, { kind: 'line', dash: 'dashed', color: t['app-forecast'], label: 'Projection' }]} />}>
              <MdChart md={data.md} t={t} />
              {data.md.projected > 100 ? (
                <Callout tone="danger" title={`Exposure ≈ ₹${(data.md.exposure.rs / 1e5).toFixed(1)} lakh this billing month`}>{data.md.exposure.text}.</Callout>
              ) : data.md.projected > 95 ? (
                <Callout tone="warning" title="Approaching contract demand">Projected {data.md.projected}% — shed a shiftable mill now to stay under 100%.</Callout>
              ) : <p className="faint small">{data.md.note}</p>}
            </Panel>
            <Panel title="Tariff & power quality" eyebrow={`${data.regulator} · ${data.state}`}>
              <KV items={[
                ['MD rule', data.tariff.mdRule], ['PF rule', data.tariff.pfRule], ['Demand charge', `₹${data.tariff.demandPerKva}/kVA`],
                ['Incomer PF', `${data.sld.incomer.pf}`], ['THD-V', `${data.sld.incomer.thd}% (IEEE 519 HV limit 3%)`],
                ['kVAh loss', data.kvahLossLakh ? `≈ ₹${data.kvahLossLakh} lakh/month vs unity PF` : 'MP bills kWh with a PF rebate'],
              ]} />
            </Panel>
          </div>
          <Panel title={`Single-line diagram · ${data.plantName}`} eyebrow="Live from IEC 61850 / Modbus meters · dashed boxes are offline, planned or rescheduled">
            <SLD sld={data.sld} plantName={data.plantName} />
          </Panel>
          <Panel flush title="Feeders" eyebrow="Load, power factor and harmonics"
            actions={<DownloadIcon label="Download feeders" onClick={() => studio.open({ title: `Feeders · ${data.plantName}`, sections: [feederTable()] })} />}>
            <div className="table-wrap">
              <table className="app-table compact">
                <thead><tr><th>Feeder</th><th>Bus</th><th className="numeric">kW</th><th className="numeric">Load %</th><th className="numeric">PF</th><th className="numeric">THD %</th><th>Drive</th><th>Shiftable</th><th>Status</th></tr></thead>
                <tbody>{data.sld.feeders.map((f) => (
                  <tr key={f.key}><td><b>{f.name}</b></td><td>{f.bus}</td><td className="numeric">{num(f.kw)}</td><td className="numeric">{f.loadPct}</td><td className="numeric">{f.pf}</td>
                    <td className={`numeric ${f.thd > 8 ? 'tone-warning' : ''}`}>{f.thd}</td><td>{f.vfd ? 'VFD' : 'DOL / soft start'}</td><td>{f.shiftable ? 'Yes' : 'No'}</td>
                    <td><StatusChip tone={f.rescheduled ? 'info' : f.loadPct > 100 ? 'danger' : 'success'}>{f.rescheduled ? 'Off-peak' : f.loadPct > 100 ? 'Overloaded' : 'Running'}</StatusChip></td></tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
        </>}
      </PageState>
    </div>
  );
}
