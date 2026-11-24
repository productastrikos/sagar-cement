// Connectivity & data health — the meeting's immediate priority: stabilise data
// receipt and handling. Hosts the "broken pipe" live moment.
import React, { useState } from 'react';
import { Download, FileWarning, HardDrive, ShieldOff, Unplug, CheckCircle2, Trash2 } from 'lucide-react';
import { usePoll, useLive } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useToast } from '../lib/toast';
import { post } from '../lib/api';
import { PLANT_NAME, PLANT_OPTIONS, fmtTime, fmtAgo, num } from '../lib/format';
import { kpisSection, tableSection, plantFilter } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip } from '../components/Advisory';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, StatusChip, DownloadIcon, Callout, Empty, usePlantParam } from '../components/ui';

const STATE_TONE = { online: 'success', buffering: 'warning', backfilling: 'warning', stale: 'warning', offline: 'danger' };
const CLS = { lab: 'Lab', dcs: 'DCS', field: 'Field', power: 'Power', camera: 'Camera', erp: 'ERP' };

export default function Connectivity() {
  const studio = useStudio();
  const toast = useToast();
  const { refresh } = useLive();
  const [plant, setPlant] = usePlantParam();
  const [target, setTarget] = useState('MTP');
  const [cls, setCls] = useState('');
  const { data, error, reload } = usePoll('/connectivity', { plant });

  const simulate = async (action) => {
    const p = plant || target;
    try {
      const r = await post('/connectivity/simulate', { action, plant: p });
      toast(action === 'wan' ? 'warning' : 'info',
        action === 'wan' ? `WAN cut at ${PLANT_NAME[p]} for 60 s` : action === 'malformed' ? 'Malformed XRF row injected' : 'DCOM patch failure simulated',
        action === 'wan' ? 'Watch the gateway buffer climb, then replay in order on reconnect — nothing is lost.' : action === 'malformed' ? `${r.record?.id} held in the dead-letter queue; the models never saw it.` : 'The XRF OPC DA link drops and the calorimeter log freezes — data health catches it in minutes.');
      reload(); refresh();
    } catch (e) { toast('danger', 'Simulation failed', e.message); }
  };
  const resolve = async (q, action) => {
    try {
      await post(`/connectivity/quarantine/${q.id}`, { action });
      toast('success', action === 'release' ? 'Record released' : 'Record discarded', `${q.id} — logged to the audit trail.`);
      reload(); refresh();
    } catch (e) { toast('danger', 'Could not update record', e.message); }
  };

  const connectors = (data?.connectors || []).filter((c) => !cls || c.cls === cls);
  const connTable = () => tableSection('connectors', 'Connectors', ['Connector', 'Plant', 'Type', 'Protocol', 'Path', 'State', { h: 'Latency s', num: true }, { h: 'Complete %', num: true }, { h: 'Last good (min)', num: true }],
    connectors.map((c) => [c.id, c.plantName, CLS[c.cls], c.protocol, c.adapter, c.state, c.latencyS, c.completeness, c.lastGoodMin]));
  const download = () => studio.open({
    title: 'Connectivity & data health', subtitle: 'Edge gateways, connectors, validation and the dead-letter queue', filters: plantFilter(plant, PLANT_NAME[plant]),
    sections: [
      kpisSection(data.cards),
      tableSection('gateways', 'Edge gateways', ['Plant', 'Uplink', { h: 'Buffered', num: true }, { h: 'Replayed today', num: true }, { h: 'Lost', num: true }, 'Online'],
        data.gateways.map((g) => [g.plantName, g.uplink, g.buffer, g.replayedTotal, g.lostTotal, `${g.online}/${g.connectors}`])),
      connTable(),
      tableSection('dlq', 'Dead-letter queue', ['ID', 'Plant', 'Rule', 'Reason', 'Status'], data.quarantine.map((q) => [q.id, q.plantName, q.rule, q.reason, q.status])),
      tableSection('audit', 'Week-1 instrument protocol audit', ['Instrument', 'Protocol', 'Path to edge', 'Tier'], data.audit.map((a) => [a.instrument, a.protocol, a.path, a.tier])),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Connectivity & data health" subtitle="Stabilise data receipt first — the immediate priority from the 6 November meeting"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="connectivity" match={(a) => a.domain === 'data'} />
      <FilterBar showReset={!!plant} onReset={() => setPlant('')}><PlantSelect value={plant} onChange={setPlant} /></FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards.slice(0, 4)} cols={4} />
          <KpiRow cards={data.cards.slice(4)} cols={4} />

          <Panel eyebrow="Live test" title="The broken-pipe test — try to lose data">
            <div className="row wrap gap-12">
              {!plant && (
                <label className="row small muted">Plant
                  <select className="app-select select-sm" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Plant to test">
                    {PLANT_OPTIONS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </select>
                </label>
              )}
              <button type="button" className="app-control-btn btn-md" onClick={() => simulate('wan')}><Unplug size={14} /> Cut the WAN for 60 s</button>
              <button type="button" className="app-control-btn btn-md" onClick={() => simulate('malformed')}><FileWarning size={14} /> Inject a malformed XRF row</button>
              <button type="button" className="app-control-btn btn-md" onClick={() => simulate('dcom')}><ShieldOff size={14} /> Simulate a DCOM patch failure</button>
            </div>
            <p className="faint small" style={{ margin: '10px 0 0', maxWidth: 'none' }}>
              The earlier integration stalled because raw data reached a server with nothing in between. Here every record passes an edge gateway with disk-backed
              store-and-forward, validation and a dead-letter queue before anything downstream sees it.
            </p>
          </Panel>

          <Panel eyebrow="Ingestion pipeline · today" title="From instrument to model, with nothing silently dropped">
            <div className="pipe">
              <div className="pipe-step"><div className="n">1 · Connect</div><div className="t">{num(data.connectors.length)} connectors</div><div className="d">{data.connectors.filter((c) => c.state === 'online').length} online · read-only at the OT boundary</div></div>
              <div className="pipe-step"><div className="n">2 · Buffer</div><div className="t">{num(data.gateways.reduce((s, g) => s + g.buffer, 0))} queued</div><div className="d">Disk-backed store-and-forward at each plant edge</div></div>
              <div className="pipe-step"><div className="n">3 · Validate</div><div className="t">{num(data.counters.quarantinedToday + data.quarantine.length)} held</div><div className="d">Closure, barcode, plausibility, basis and clock rules</div></div>
              <div className="pipe-step"><div className="n">4 · Normalise</div><div className="t">{num(data.counters.normalisedToday)} fixed</div><div className="d">cm²/g → m²/kg · J/g → kcal/kg · kg/cm² → MPa</div></div>
              <div className="pipe-step"><div className="n">5 · Ingest</div><div className="t">{num(data.counters.ingestedToday)} records</div><div className="d">{num(data.counters.replayed)} replayed after outages</div></div>
              <div className="pipe-step"><div className="n">6 · Lost</div><div className="t tone-success">{data.counters.lost}</div><div className="d">Records lost today across all plants</div></div>
            </div>
          </Panel>

          {data.s7.length > 0 && (
            <Callout tone="danger" title={`Pipeline stall caught at ${data.s7.map((p) => PLANT_NAME[p]).join(', ')}`}>
              The XRF OPC DA link failed after a Windows DCOM patch and the calorimeter log is frozen. The edge keeps buffering locally, and the free-lime soft sensor
              is paused until completeness recovers. See the AI advisory for the fix.
            </Callout>
          )}

          <Panel title="Edge gateways" eyebrow="One per plant · click to filter">
            <div className="gw-grid">
              {data.gateways.map((g) => (
                <button key={g.plant} type="button" className={`gw-tile ${g.uplink === 'down' ? 'is-down' : g.uplink === 'backfilling' ? 'is-backfilling' : ''} ${plant === g.plant ? 'is-selected' : ''}`} onClick={() => setPlant(plant === g.plant ? '' : g.plant)}>
                  <div className="row between"><span className="gw-name">{g.plantName}</span><StatusChip tone={g.uplink === 'up' ? 'success' : g.uplink === 'down' ? 'danger' : 'warning'}>{g.uplink === 'up' ? 'Uplink up' : g.uplink === 'down' ? `Down · ${g.downForS}s` : 'Replaying'}</StatusChip></div>
                  <div className="row between small"><span className="muted"><HardDrive size={12} /> {num(g.buffer)} buffered</span><span className="faint">{g.diskFreeGb} GB free</span></div>
                  <div className="buffer-bar"><div className="buffer-fill" style={{ width: `${Math.min(100, (g.buffer / 400) * 100)}%` }} /></div>
                  <div className="gw-meta">{g.online}/{g.connectors} connectors online · CPU {g.cpu}% · {num(g.replayedTotal)} replayed · {g.lostTotal} lost</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel flush title="Connectors" eyebrow={`${connectors.length} shown`}
            actions={<>
              <select className="app-select select-sm" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Connector type">
                <option value="">All types</option>{Object.entries(CLS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <DownloadIcon label="Download connectors" onClick={() => studio.open({ title: 'Connectors', filters: plantFilter(plant, PLANT_NAME[plant]), sections: [connTable()] })} />
            </>}>
            <div className="table-wrap tall">
              <table className="app-table compact">
                <thead><tr><th>Connector</th><th>Type</th><th>Protocol</th><th>Path to edge</th><th>State</th><th className="numeric">Latency s</th><th className="numeric">Complete %</th><th className="numeric">Last good</th><th className="numeric">Records today</th></tr></thead>
                <tbody>
                  {connectors.map((c) => (
                    <tr key={c.id} className={c.state === 'offline' ? 'row-urgent' : ''}>
                      <td><span className="mono">{c.id}</span><div className="faint small">{c.name}</div></td>
                      <td>{CLS[c.cls]}</td><td>{c.protocol}</td><td>{c.adapter}</td>
                      <td><span className="row"><span className={`dot dot-${c.state}`} /><StatusChip tone={STATE_TONE[c.state]} title={c.error || ''}>{c.state}</StatusChip></span>{c.error && <div className="tone-danger small">{c.error}</div>}</td>
                      <td className="numeric">{c.latencyS}</td><td className="numeric">{c.completeness}</td><td className="numeric">{c.lastGoodMin < 1 ? 'now' : `${c.lastGoodMin} min`}</td><td className="numeric">{num(c.recordsToday)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="split-wide">
            <Panel flush title="Dead-letter queue" eyebrow="Held, never silently dropped"
              actions={<DownloadIcon label="Download dead-letter queue" onClick={() => studio.open({ title: 'Dead-letter queue', filters: plantFilter(plant, PLANT_NAME[plant]), sections: [tableSection('dlq', 'Held records', ['ID', 'Time', 'Plant', 'Rule', 'Reason', 'Raw', 'Status'], data.quarantine.map((q) => [q.id, fmtTime(new Date(q.at).toISOString()), q.plantName, q.rule, q.reason, q.raw, q.status]))] })} />}>
              {data.quarantine.length === 0 ? <Empty title="Nothing held" text="Every record passed validation." /> : (
                <div className="table-wrap tall">
                  <table className="app-table compact">
                    <thead><tr><th>Record</th><th>Rule</th><th>Reason</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {data.quarantine.map((q) => (
                        <tr key={q.id}>
                          <td><span className="mono">{q.id}</span><div className="faint small">{q.plantName} · {fmtAgo(new Date(q.at).toISOString())}</div></td>
                          <td>{q.rule}</td>
                          <td>{q.reason}<div className="mono faint" style={{ fontSize: 10 }}>{q.raw}</div></td>
                          <td><StatusChip tone={q.status === 'quarantined' ? 'warning' : q.status === 'released' ? 'success' : 'neutral'}>{q.status}</StatusChip></td>
                          <td>{q.status === 'quarantined' && <div className="row">
                            <button type="button" className="app-control-btn btn-sm" onClick={() => resolve(q, 'release')}><CheckCircle2 size={12} /> Release</button>
                            <button type="button" className="icon-btn sm" aria-label={`Discard ${q.id}`} onClick={() => resolve(q, 'discard')}><Trash2 size={12} /></button>
                          </div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="Units normalised automatically" eyebrow="Canonical units before storage">
              <ul className="timeline" style={{ padding: 0 }}>
                {data.normalised.map((n, i) => <li key={i}><span className="tl-dot" /><div><div className="tl-text">{n.text}</div><div className="tl-meta">{n.plantName} · {fmtAgo(new Date(n.at).toISOString())}</div></div></li>)}
              </ul>
              <div className="sub-h">Clock discipline</div>
              <p className="muted small">Every gateway, lab PC and DCS server is held under 1 s of skew by local NTP. Lab results are joined on <b>sampled</b> time, never analysed time.</p>
            </Panel>
          </div>

          <Panel flush title="Week-1 instrument protocol audit" eyebrow="How each instrument class reaches the edge"
            actions={<DownloadIcon label="Download protocol audit" onClick={() => studio.open({ title: 'Instrument protocol audit', sections: [tableSection('audit', 'Protocol audit', ['Instrument', 'Example', 'Protocol', 'Path', 'Tier', 'Plants'], data.audit.map((a) => [a.instrument, a.example, a.protocol, a.path, a.tier, a.plants.join(', ')]))] })} />}>
            <div className="table-wrap">
              <table className="app-table">
                <thead><tr><th>Instrument</th><th>Protocol</th><th>Path to edge</th><th>Tier</th><th>Plants</th></tr></thead>
                <tbody>{data.audit.map((a) => (
                  <tr key={a.instrument}><td><b>{a.instrument}</b><div className="faint small">{a.example}</div></td><td>{a.protocol}</td><td>{a.path}</td>
                    <td><StatusChip tone={a.tier.startsWith('Native') ? 'success' : a.tier.startsWith('Serial') ? 'info' : 'accent'}>{a.tier}</StatusChip></td><td>{a.plants.map((p) => PLANT_NAME[p]).join(', ')}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
        </>}
      </PageState>
    </div>
  );
}
