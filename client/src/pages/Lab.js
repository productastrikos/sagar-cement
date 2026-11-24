// Lab integration — all seven instrument classes connected, with barcoded chain
// of custody, calibration drift and the cross-belt vs XRF cross-check.
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useTokens } from '../lib/tokens';
import { PLANT_NAME, fmtTime, fmtDateTime } from '../lib/format';
import { kpisSection, tableSection, barSection, plantFilter } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip } from '../components/Advisory';
import { BreakdownChart, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, SelectField, StatusChip, DownloadIcon, Progress, Modal, Callout, usePlantParam } from '../components/ui';

const STAGES = ['Limestone', 'Raw meal', 'Kiln feed', 'Hot meal', 'Clinker', 'Cement', 'Fuel', 'Slag'];
const show = (v) => (typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : v);

function SampleModal({ s, onClose }) {
  return (
    <Modal title={`Sample ${s.barcode}`} onClose={onClose} size="lg" footer={<button type="button" className="app-control-btn btn-md" onClick={onClose}>Close</button>}>
      <div className="row wrap mb-8"><StatusChip tone={s.qc === 'VALID' ? 'success' : 'warning'}>{s.qc}</StatusChip><span className="muted small">{s.spec.note}</span></div>
      <div className="sub-h">Chain of custody</div>
      <div className="wo-steps">
        <span className="done">Sampled {fmtTime(s.sampledAt)}</span><span className="done">Received {fmtTime(s.receivedAt)}</span><span className="done">Analysed {fmtTime(s.analyzedAt)}</span><span className="now">Ingested · TAT {s.tatMin} min</span>
      </div>
      <p className="faint small mt-8">Joined to the process on <b>sampled</b> time, then shifted by material residence time — never on analysed time.</p>
      <div className="sub-h">Results · {s.instrumentName} · {s.stage}{s.grade ? ` · ${s.grade}` : ''}</div>
      <div className="inst-params" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', fontSize: 12 }}>
        {Object.entries(s.params).map(([k, v]) => <React.Fragment key={k}><span>{k}</span><b>{show(v)}</b><span /></React.Fragment>)}
      </div>
    </Modal>
  );
}

export default function Lab() {
  const t = useTokens();
  const studio = useStudio();
  const [plant, setPlant] = usePlantParam();
  const [inst, setInst] = useState('');
  const [stage, setStage] = useState('');
  const [sel, setSel] = useState(null);
  const { data, error, reload } = usePoll('/lab', { plant });

  const samples = (data?.samples || []).filter((s) => (!inst || s.instrument === inst) && (!stage || s.stage === stage));
  const crmRows = (data?.crm || []).filter((c) => !inst || data.instruments.find((i) => i.id === inst)?.short === c.instrument)
    .sort((a, b) => b.value - a.value).slice(0, 8)
    .map((c) => ({ key: c.key, label: `${PLANT_NAME[c.plant]} · ${c.instrument}`, value: c.value, tone: c.value > 80 ? 'danger' : c.value > 50 ? 'warning' : undefined }));
  const sampleTable = () => tableSection('samples', 'Sample stream', ['Barcode', 'Instrument', 'Stage', 'Sampled', 'Analysed', { h: 'TAT min', num: true }, 'QC', 'Note'],
    samples.slice(0, 80).map((s) => [s.barcode, s.instrumentName, s.stage, fmtDateTime(s.sampledAt), fmtDateTime(s.analyzedAt), s.tatMin, s.qc, s.spec.note]));
  const download = () => studio.open({
    title: 'Lab integration', subtitle: 'Seven instrument classes · chain of custody · calibration drift', filters: plantFilter(plant, PLANT_NAME[plant]),
    sections: [
      kpisSection(data.cards),
      tableSection('inst', 'Instruments', ['Instrument', 'Protocol', 'Path', 'State', { h: 'Samples', num: true }, { h: 'CRM drift %', num: true }], data.instruments.map((i) => [i.name, i.protocol, i.adapter, i.state, i.count, i.crm])),
      tableSection('cross', 'Cross-belt vs XRF raw-meal CaO', ['Plant', { h: 'Cross-belt %', num: true }, { h: 'XRF %', num: true }, { h: 'Residual', num: true }, 'Flag'], data.cross.map((c) => [c.plantName, c.crossBelt, c.xrf, c.residual, c.flag ? 'Above 0.40%' : 'OK'])),
      barSection('crm', 'Calibration drift (% of ASTM C114 tolerance)', crmRows, 0),
      sampleTable(),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Lab integration" subtitle="XRF, XRD, particle size, cross-belt, calorimeter, microscope and strength testers — connected to plant data"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="lab" match={(a) => ['S1', 'S3', 'S6', 'S7', 'DLQ'].includes(a.key)} />
      <FilterBar showReset={!!(plant || inst || stage)} onReset={() => { setPlant(''); setInst(''); setStage(''); }}>
        <PlantSelect value={plant} onChange={setPlant} />
        <SelectField label="Instrument" value={inst} onChange={setInst} allLabel="All instruments" options={(data?.instruments || []).map((i) => [i.id, i.short])} />
        <SelectField label="Material stage" value={stage} onChange={setStage} allLabel="All stages" options={STAGES} />
      </FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} cols={6} />
          <Panel title="Instruments" eyebrow="Latest result from each class">
            <div className="inst-grid">
              {data.instruments.map((i) => (
                <div key={i.id} className="inst-tile">
                  <div className="row between"><h3>{i.name}</h3><span className="row small"><span className={`dot dot-${i.state === 'n/a' ? 'none' : i.state}`} />{i.state}</span></div>
                  <div className="faint small">{i.protocol} · {i.adapter}</div>
                  {i.latest ? (
                    <>
                      <div className="row between small"><span className="mono" style={{ color: 'var(--app-accent)' }}>{i.latest.barcode}</span><span className="faint">{fmtTime(i.latest.analyzedAt)}</span></div>
                      <div className="inst-params">{Object.entries(i.latest.params).slice(0, 8).map(([k, v]) => <React.Fragment key={k}><span>{k}</span><b>{show(v)}</b></React.Fragment>)}</div>
                      {i.latest.qc !== 'VALID' && <StatusChip tone="warning">{i.latest.spec.note}</StatusChip>}
                    </>
                  ) : <div className="faint small">Not installed at this plant</div>}
                  <div className="row between small mt-8"><span className="faint">Calibration drift</span><b>{i.crm || 0}% of limit</b></div>
                  <Progress pct={i.crm} />
                </div>
              ))}
            </div>
          </Panel>
          <div className="split-wide">
            <Panel flush title="Cross-belt vs lab XRF" eyebrow="Raw-meal CaO · catches XRF calibration drift">
              <div className="table-wrap">
                <table className="app-table">
                  <thead><tr><th>Plant</th><th className="numeric">Cross-belt predicted %</th><th className="numeric">Lab XRF %</th><th className="numeric">Residual</th><th>Status</th></tr></thead>
                  <tbody>{data.cross.map((c) => (
                    <tr key={c.plant} className={c.flag ? 'row-urgent' : ''}><td>{c.plantName}</td><td className="numeric">{c.crossBelt ?? '—'}</td><td className="numeric">{c.xrf ?? '—'}</td>
                      <td className="numeric">{c.residual != null ? `${c.residual > 0 ? '+' : ''}${c.residual}` : '—'}</td>
                      <td><StatusChip tone={c.flag ? 'danger' : 'success'}>{c.flag ? 'Drift suspected' : 'Agrees'}</StatusChip></td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="panel-pad"><Callout tone="advisory" title="Why this matters">A sustained residual above +0.40% means the lab XRF reads CaO low while the true mix is over-limed — the raw-mix controller will chase a phantom. It is the first signal in research scenario 1.</Callout></div>
            </Panel>
            <Panel title="Calibration drift" eyebrow="Worst instruments · % of ASTM C114 tolerance"
              actions={<DownloadIcon label="Download calibration drift" onClick={() => studio.open({ title: 'Calibration drift', filters: plantFilter(plant, PLANT_NAME[plant]), sections: [barSection('crm', 'Calibration drift', crmRows, 0)] })} />}>
              <BreakdownChart rows={crmRows} fmt={fmtNum(0)} t={t} catWidth={170} />
              <p className="faint small">Bars turn amber above 50% and red above 80% (recalibrate).</p>
            </Panel>
          </div>
          <Panel flush title="Sample stream" eyebrow={`${samples.length} latest results · click a row for chain of custody`}
            actions={<DownloadIcon label="Download sample stream" onClick={() => studio.open({ title: 'Lab sample stream', filters: plantFilter(plant, PLANT_NAME[plant]), sections: [sampleTable()] })} />}>
            <div className="table-wrap tall">
              <table className="app-table compact">
                <thead><tr><th>Barcode</th><th>Instrument</th><th>Stage</th><th>Sampled</th><th>Analysed</th><th className="numeric">TAT min</th><th>QC</th><th>Note</th></tr></thead>
                <tbody>{samples.slice(0, 120).map((s) => (
                  <tr key={s.id} className="is-clickable" tabIndex={0} onClick={() => setSel(s)} onKeyDown={(e) => e.key === 'Enter' && setSel(s)}>
                    <td className="mono">{s.barcode}</td><td>{s.instrumentName}</td><td>{s.stage}</td><td>{fmtTime(s.sampledAt)}</td><td>{fmtTime(s.analyzedAt)}</td>
                    <td className="numeric">{s.tatMin}</td><td><StatusChip tone={s.qc === 'VALID' ? 'success' : 'warning'}>{s.qc}</StatusChip></td><td className="muted">{s.spec.note}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
        </>}
      </PageState>
      {sel && <SampleModal s={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
