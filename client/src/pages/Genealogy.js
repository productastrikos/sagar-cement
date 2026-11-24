// Material genealogy — raw material, process, operational and field data joined
// into one lineage, from limestone pile to dispatched cement.
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { fmtDay, fmtDateTime } from '../lib/format';
import { kpisSection, tableSection } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, StatusChip, DownloadIcon, KV, Empty, usePlantParam } from '../components/ui';

export default function Genealogy() {
  const studio = useStudio();
  const [plant, , sp, setSp] = usePlantParam('MTP');
  const batch = sp.get('batch') || '';
  const setBatch = (id) => { const n = new URLSearchParams(sp); n.set('batch', id); setSp(n, { replace: true }); };
  const [node, setNode] = useState('clinker');
  const { data, error, reload } = usePoll('/genealogy', { plant, batch }, 15000);
  const L = data?.lineage;
  const lot = L?.lots[0];
  const b = L?.batch;

  const nodes = L ? [
    { key: 'pile', stage: 'Limestone pile', id: lot.pile.id, kv: [`CaO ${lot.pile.cao}% · MgO ${lot.pile.mgo}%`, `${lot.pile.days}-day build`], lag: L.residence[0].lag },
    { key: 'rm', stage: 'Raw meal', id: lot.rm.id, kv: [`LSF ${lot.rm.lsf}`, `R90 ${lot.rm.r90}%`], lag: L.residence[1].lag },
    { key: 'kf', stage: 'Kiln feed', id: lot.kf.id, kv: [`LSF ${lot.kf.lsf} · SM ${lot.kf.sm} · AM ${lot.kf.am}`, `Homogenisation ×${lot.kf.h}`], lag: L.residence[2].lag },
    { key: 'clinker', stage: 'Clinker', id: lot.clinker.id, kv: [`f-CaO ${lot.clinker.fcao}% · C₃S ${lot.clinker.c3s}%`, `Litre wt ${lot.clinker.litre} g/L`], lag: L.residence[3].lag, bad: lot.clinker.fcao > 1.5 },
    { key: 'cement', stage: 'Cement batch', id: b.id, kv: [`${b.grade} · Blaine ${b.blaine} m²/kg`, `SO₃ ${b.so3}% · ${b.tonnes.toLocaleString('en-IN')} t`], lag: L.residence[4].lag },
    { key: 'result', stage: '28-day result', id: b.s28 != null ? `${b.s28} MPa measured` : `${b.p28} MPa forecast`, kv: [b.s28 != null ? (b.bisPass ? 'Passed BIS' : 'Failed BIS') : 'Result pending', `Giveaway ${b.giveaway > 0 ? '+' : ''}${b.giveaway} MPa`], lag: 'Anchored on grinding date', bad: !b.bisPass },
  ] : [];
  const details = {
    pile: [['Lot', lot?.pile.id], ['CaO (cross-belt)', `${lot?.pile.cao}%`], ['MgO', `${lot?.pile.mgo}%`], ['Pre-blend build', `${lot?.pile.days} days`], ['Source', 'Captive quarry, cross-belt PGNAA']],
    rm: [['Lot', lot?.rm.id], ['LSF (XRF)', lot?.rm.lsf], ['Residue R90', `${lot?.rm.r90}%`], ['Alignment', L?.residence[0].method]],
    kf: [['Lot', lot?.kf.id], ['LSF / SM / AM', `${lot?.kf.lsf} / ${lot?.kf.sm} / ${lot?.kf.am}`], ['Homogenisation factor', `×${lot?.kf.h}`], ['Alignment', L?.residence[1].method]],
    clinker: [['Lot', lot?.clinker.id], ['Kiln window', `${L ? fmtDateTime(lot.kilnWindow.from) : ''} · lag ${lot?.kilnWindow.lagMin} min`], ['Burning zone', `${lot?.kilnWindow.bzt} °C`], ['Secondary air', `${lot?.kilnWindow.sat} °C`], ['Cooler quench', `${lot?.kilnWindow.quench} °C/min`], ['Fuel', `${lot?.fuel.type} · NCV ${lot?.fuel.ncv} kcal/kg · S ${lot?.fuel.s}%`]],
    cement: [['Batch', b?.id], ['Grade', b?.grade], ['Mill', b?.mill], ['Blaine / SO₃', `${b?.blaine} m²/kg / ${b?.so3}%`], ['SCM', L?.scm ? `${L.scm.kind} ${L.scm.pct}% · ${L.scm.quality}` : 'None (OPC)'], ['Clinker from', L?.src.name]],
    result: [['3-day', b?.s3 != null ? `${b.s3} MPa` : 'pending'], ['7-day', b?.s7 != null ? `${b.s7} MPa` : 'pending'], ['28-day', b?.s28 != null ? `${b.s28} MPa` : `${b?.p28} MPa forecast`], ['BIS check', b?.bisPass ? 'Pass' : 'Fail / at risk']],
  };

  const download = () => studio.open({
    title: `Genealogy · ${b.id}`, subtitle: `${b.grade} · ground ${fmtDay(b.date)} · clinker from ${L.src.name}`, filters: [{ k: 'Plant', v: L.src.name }, { k: 'Batch', v: b.id }],
    sections: [
      kpisSection(data.cards),
      tableSection('chain', 'Lineage', ['Stage', 'Lot / result', 'Key figures', 'Residence to next'], nodes.map((n) => [n.stage, n.id, n.kv.join(' · '), n.lag])),
      tableSection('lots', 'Clinker lots in this batch', ['Lot', { h: 'Weight', num: true }, { h: 'f-CaO %', num: true }, { h: 'C₃S %', num: true }, { h: 'Litre g/L', num: true }, { h: 'Kiln lag min', num: true }], L.lots.map((l) => [l.id, l.w, l.clinker.fcao, l.clinker.c3s, l.clinker.litre, l.kilnWindow.lagMin])),
      tableSection('res', 'Residence-time alignment', ['From', 'To', 'Lag', 'Method'], L.residence.map((r) => [r.from, r.to, r.lag, r.method])),
      tableSection('model', 'Unified data model', ['Table', 'Grain', 'Keys'], data.model.map((m) => [m.table, m.grain, m.keys])),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Material genealogy" subtitle="Raw material, process, operational and field data in one lineage — limestone pile to dispatched cement"
        actions={L && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <FilterBar><PlantSelect value={plant} onChange={(v) => { const n = new URLSearchParams(sp); n.set('plant', v); n.delete('batch'); setSp(n, { replace: true }); }} includeAll={false} /></FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} cols={4} />
          <div className="detail-grid">
            <div className="stack">
              {!L ? <Empty title="No batch selected" text="Pick a cement batch on the right." /> : <>
                <Panel title={`Lineage of ${b.id}`} eyebrow={`${b.grade} · ground ${fmtDay(b.date)} · clinker from ${L.src.name}`}
                  actions={<StatusChip tone={b.s28 == null ? (b.atRisk ? 'warning' : 'info') : b.bisPass ? 'success' : 'danger'}>{b.s28 == null ? (b.atRisk ? 'At risk' : 'Forecast') : b.bisPass ? 'BIS pass' : 'BIS fail'}</StatusChip>}>
                  <div className="gen-chain">
                    {nodes.map((n) => (
                      <button key={n.key} type="button" className={`gen-node ${node === n.key ? 'is-selected' : ''} ${n.bad ? 'is-bad' : ''}`} onClick={() => setNode(n.key)} aria-pressed={node === n.key}>
                        <span className="gen-stage">{n.stage}</span><span className="gen-id" title={n.id}>{n.id}</span>
                        {n.kv.map((k) => <span key={k} className="gen-kv">{k}</span>)}
                        <span className="gen-lag">→ {n.lag}</span>
                      </button>
                    ))}
                  </div>
                </Panel>
                <div className="grid-2">
                  <Panel title={nodes.find((n) => n.key === node)?.stage} eyebrow="Selected stage"><KV items={details[node].filter(([, v]) => v != null)} /></Panel>
                  <Panel flush title="Clinker lots in this batch" eyebrow="Mass-weighted genealogy">
                    <div className="table-wrap">
                      <table className="app-table compact">
                        <thead><tr><th>Lot</th><th className="numeric">Weight</th><th className="numeric">f-CaO %</th><th className="numeric">C₃S %</th><th className="numeric">Lag min</th></tr></thead>
                        <tbody>{L.lots.map((l) => <tr key={l.id}><td className="mono">{l.id}</td><td className="numeric">{Math.round(l.w * 100)}%</td><td className={`numeric ${l.clinker.fcao > 1.5 ? 'tone-danger' : ''}`}>{l.clinker.fcao}</td><td className="numeric">{l.clinker.c3s}</td><td className="numeric">{l.kilnWindow.lagMin}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </Panel>
                </div>
                <Panel flush title="Residence-time alignment" eyebrow="How each lab result finds the process window that made the material">
                  <div className="table-wrap">
                    <table className="app-table">
                      <thead><tr><th>From</th><th>To</th><th>Lag</th><th>Method</th></tr></thead>
                      <tbody>{L.residence.map((r) => <tr key={r.from}><td>{r.from}</td><td>{r.to}</td><td>{r.lag}</td><td>{r.method}</td></tr>)}</tbody>
                    </table>
                  </div>
                </Panel>
              </>}
              <Panel flush title="Unified data model" eyebrow="Seven ISA-95 tables behind every screen"
                actions={<DownloadIcon label="Download data model" onClick={() => studio.open({ title: 'Unified data model', sections: [tableSection('model', 'Tables', ['Table', 'Grain', 'Keys'], data.model.map((m) => [m.table, m.grain, m.keys]))] })} />}>
                <div className="table-wrap">
                  <table className="app-table compact">
                    <thead><tr><th>Table</th><th>Grain</th><th>Keys and timestamps</th></tr></thead>
                    <tbody>{data.model.map((m) => <tr key={m.table}><td className="mono">{m.table}</td><td>{m.grain}</td><td className="muted">{m.keys}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
            </div>
            <Panel flush title="Cement batches" eyebrow="Last 40 days · newest first">
              <ul className="list-plain" style={{ maxHeight: 820, overflowY: 'auto' }}>
                {data.batches.map((x) => (
                  <li key={x.id}>
                    <button type="button" className={`row-btn ${x.id === data.selected ? 'is-active' : ''}`} onClick={() => setBatch(x.id)}>
                      <span className="grow"><span className="t mono" style={{ fontSize: 11 }}>{x.id}</span><span className="m" style={{ display: 'block' }}>{x.grade} · {fmtDay(x.date)} · {x.s28 != null ? `${x.s28} MPa` : `${x.p28} MPa forecast`}</span></span>
                      <StatusChip tone={x.s28 == null ? (x.atRisk ? 'warning' : 'info') : x.bisPass ? 'success' : 'danger'}>{x.s28 == null ? (x.atRisk ? 'risk' : 'open') : x.bisPass ? 'pass' : 'fail'}</StatusChip>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>}
      </PageState>
    </div>
  );
}
