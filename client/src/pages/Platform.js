// Platform & architecture — corporate demo: S!aP layers, the OT/DMZ/cloud
// architecture, connectors, models, guardrails, requirement coverage and
// plant-template cloning (domestic and offshore projects).
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Copy, Download, ShieldCheck } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useToast } from '../lib/toast';
import { post } from '../lib/api';
import { tableSection, textSection } from '../lib/doc';
import { PageHeader, Panel, PageState, StatusChip, DownloadIcon, Modal, Callout } from '../components/ui';

const ARCH = [
  { tag: 'Users', cls: '', items: ['CCR operators', 'Quality & lab', 'Energy & power automation', 'Plant heads', 'Group management', 'SAP S/4HANA (read)'] },
  { tag: 'S!aP core', cls: '', items: ['Connect', 'Collect', 'Historize', 'Analyze', 'Visualize', 'Advise'] },
  { tag: 'Industrial DMZ', cls: 'is-dmz', items: ['Read-only, outbound only', 'TLS · OPC UA 4840 / MQTT', 'IEC 62443 zones & conduits', 'RBAC + audit trail'] },
  { tag: 'Plant edge gateway', cls: '', items: ['Store-and-forward (disk)', 'Validation & dead-letter queue', 'Local OPC DA → UA wrapper', 'Serial-to-Ethernet adapters', 'File watchers', 'NTP < 1 s skew'] },
  { tag: 'Plant OT (unchanged)', cls: 'is-ot', items: ['Lab instruments (7 classes)', 'DCS / PLC', 'QCX / RoboLab · BlendExpert', 'Gas analysers & weighfeeders', 'IEC 61850 meters & relays', 'Shell scanner & cameras'] },
];

export default function Platform() {
  const navigate = useNavigate();
  const studio = useStudio();
  const toast = useToast();
  const { data, error, reload } = usePoll('/platform', null, 0);
  const [template, setTemplate] = useState('integrated');
  const [name, setName] = useState('New EPC site');
  const [clone, setClone] = useState(null);

  const doClone = async () => {
    try { const r = await post('/platform/template', { template, name }); setClone(r); toast('success', 'Template cloned', `${r.connectors.length} connectors and ${r.kpis.length} KPIs pre-configured for ${r.name}.`); }
    catch (e) { toast('danger', 'Could not clone template', e.message); }
  };
  const download = () => studio.open({
    title: 'Platform & architecture', subtitle: 'How S!aP ClinkerIQ meets the requirements from the 6 November meeting',
    sections: [
      tableSection('coverage', 'Requirement coverage', ['Meeting point', 'Where in the POC', 'How'], data.coverage.map((c) => [c.point, c.screens.join(', '), c.how])),
      tableSection('layers', 'S!aP layers', ['Layer', 'What it does'], data.layers.map((l) => [l.name, l.text])),
      tableSection('models', 'Models in this POC', ['Model', 'Kind', 'Use'], data.models.map((m) => [m.name, m.kind, m.use])),
      tableSection('families', 'Connector protocol families in this POC', ['Family', { h: 'Connectors', num: true }], data.families.map((f) => [f.family, f.count])),
      textSection('guardrails', 'Guardrails', data.guardrails.join('\n')),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Platform & architecture" subtitle="How S!aP sits above the existing DCS, QCX/RoboLab and SAP — and how each meeting requirement is met"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <Panel flush title="Requirement coverage" eyebrow="From the 6 November 2026 discovery meeting"
            actions={<DownloadIcon label="Download requirement coverage" onClick={() => studio.open({ title: 'Requirement coverage', sections: [tableSection('coverage', 'Coverage', ['Meeting point', 'Screens', 'How'], data.coverage.map((c) => [c.point, c.screens.join(', '), c.how]))] })} />}>
            <div className="table-wrap">
              <table className="app-table">
                <thead><tr><th>Meeting point</th><th>Where in the POC</th><th>How</th><th>Status</th></tr></thead>
                <tbody>{data.coverage.map((c) => (
                  <tr key={c.point} className="is-clickable" tabIndex={0} onClick={() => navigate(c.route)} onKeyDown={(e) => e.key === 'Enter' && navigate(c.route)}>
                    <td><b>{c.point}</b></td><td>{c.screens.join(' · ')}</td><td className="muted">{c.how}</td>
                    <td><StatusChip tone="success"><CheckCircle2 size={10} /> Live in POC</StatusChip></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
          <Panel title="S!aP — six layers" eyebrow="Connect → Collect → Historize → Analyze → Visualize → Advise">
            <div className="pipe">
              {data.layers.map((l, i) => <div key={l.key} className="pipe-step"><div className="n">{i + 1} · {l.name}</div><div className="d">{l.text}</div></div>)}
            </div>
          </Panel>
          <div className="split-wide">
            <Panel title="Architecture" eyebrow="Purdue / IEC 62443 segmented · read-only at the OT boundary">
              <div className="arch">
                {ARCH.map((r) => (
                  <div key={r.tag} className={`arch-row ${r.cls}`}>
                    <div className="arch-tag">{r.tag}</div>
                    <div className="arch-items">{r.items.map((it) => <span key={it} className="arch-chip">{it}</span>)}</div>
                  </div>
                ))}
              </div>
            </Panel>
            <div className="stack">
              <Panel title="Guardrails" eyebrow="What S!aP will not do">
                <ul className="check-list">{data.guardrails.map((g) => <li key={g} className="pass"><ShieldCheck size={15} className="tone-success" /><span>{g}</span></li>)}</ul>
              </Panel>
              <Panel title="Deployment" eyebrow="Same product, three footprints">
                <div className="row wrap">{data.deployment.map((d) => <StatusChip key={d} tone="accent">{d}</StatusChip>)}</div>
                <p className="faint small mt-8">ISO/IEC 27001 and ISO/IEC 21823-1 (IoT interoperability) certified.</p>
              </Panel>
            </div>
          </div>
          <div className="grid-2">
            <Panel flush title="Connectors in this POC" eyebrow={`${data.connectorsInPoc} configured across six plants · drawn from the S!aP library of 300+`}>
              <div className="table-wrap">
                <table className="app-table compact">
                  <thead><tr><th>Protocol family</th><th className="numeric">Connectors</th></tr></thead>
                  <tbody>{data.families.map((f) => <tr key={f.family}><td>{f.family}</td><td className="numeric">{f.count}</td></tr>)}</tbody>
                </table>
              </div>
            </Panel>
            <Panel flush title="Models in this POC" eyebrow="Adapted to cement · the S!aP library has 25 pre-built models">
              <div className="table-wrap">
                <table className="app-table compact">
                  <thead><tr><th>Model</th><th>Use</th></tr></thead>
                  <tbody>{data.models.map((m) => (
                    <tr key={m.name} className="is-clickable" tabIndex={0} onClick={() => navigate(m.page)} onKeyDown={(e) => e.key === 'Enter' && navigate(m.page)}>
                      <td><b>{m.name}</b><div className="faint small">{m.kind}</div></td><td className="muted">{m.use}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Panel>
          </div>
          <Panel title="Clone a plant template" eyebrow="For new domestic or offshore turnkey projects — one configured plant becomes the starting point for the next">
            <div className="row wrap gap-12">
              <label className="app-field" style={{ minWidth: 220 }}><span className="app-label">Template</span>
                <select className="app-select" value={template} onChange={(e) => setTemplate(e.target.value)}>{data.templates.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
              <label className="app-field" style={{ minWidth: 260 }}><span className="app-label">New site name</span>
                <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <button type="button" className="app-primary-btn btn-md" style={{ alignSelf: 'flex-end' }} onClick={doClone} disabled={!name.trim()}><Copy size={14} /> Clone template</button>
            </div>
            <p className="faint small mt-8">{data.templates.find((x) => x.key === template)?.text}</p>
            <Callout tone="info" title="Honest scope" style={{ marginTop: 8, marginBottom: 0 }}>A template pre-configures connectors, KPIs and screens. Each real site still starts with a week-1 instrument protocol audit on site.</Callout>
          </Panel>
        </>}
      </PageState>
      {clone && (
        <Modal title={`Template ready · ${clone.name}`} size="lg" onClose={() => setClone(null)}
          footer={<><button type="button" className="app-control-btn btn-md" onClick={() => setClone(null)}>Close</button>
            <button type="button" className="app-primary-btn btn-md" onClick={() => { setClone(null); navigate('/connectivity'); }}>Open connectivity <ArrowRight size={13} /></button></>}>
          <p className="muted">{clone.connectors.length} connectors, {clone.kpis.length} KPIs and {clone.screens} screens pre-configured from the {clone.template === 'grinding' ? 'grinding unit' : 'integrated plant'} template.</p>
          <div className="sub-h">Onboarding plan</div>
          <div className="wo-steps">{clone.steps.map((s, i) => <span key={s} className={i === 0 ? 'now' : ''}>{s}</span>)}</div>
          <div className="sub-h">Connectors</div>
          <div className="table-wrap" style={{ maxHeight: 260 }}>
            <table className="app-table compact"><thead><tr><th>ID</th><th>Connector</th><th>Protocol</th><th>Path</th></tr></thead>
              <tbody>{clone.connectors.map((c) => <tr key={c.id}><td className="mono">{c.id}</td><td>{c.name}</td><td>{c.protocol}</td><td>{c.adapter}</td></tr>)}</tbody></table>
          </div>
        </Modal>
      )}
    </div>
  );
}
