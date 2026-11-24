// Fleet overview — command-centre archetype (§17).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, Tooltip as LTooltip } from 'react-leaflet';
import L from 'leaflet';
import { ArrowRight, Download, Factory, X } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useTokens } from '../lib/tokens';
import { PLANT_NAME, fmtTime, num } from '../lib/format';
import { kpisSection, tableSection, trendSection, barSection, plantFilter } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { OverviewAdvisory } from '../components/Advisory';
import GlobalSearch from '../components/Search';
import { TrendChart, BreakdownChart, Legend, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, Segmented, StatusChip, DownloadIcon, KV, RAG_TONE, usePlantParam } from '../components/ui';

const MODES = [{ value: 'health', label: 'Health' }, { value: 'energy', label: 'Energy' }, { value: 'data', label: 'Data' }];
const markerRag = (p, mode) => {
  if (mode === 'energy') { const s = parseFloat(p.sec); return p.type === 'grinding' ? (s > 60 ? 'warning' : 'normal') : s > 75 ? 'critical' : s > 70 ? 'warning' : 'normal'; }
  if (mode === 'data') { const c = parseFloat(p.completeness); return c < 95 ? 'critical' : c < 99 ? 'warning' : 'normal'; }
  return p.health;
};

function PlantDrawer({ p, onClose, onFilter }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <>
      <div className="app-drawer-catcher" onClick={onClose} />
      <aside className="app-drawer" role="dialog" aria-modal="true" aria-labelledby="plant-drawer-title" tabIndex={-1} ref={ref}>
        <header className="app-drawer-head">
          <span className="kpi-icon tone-accent"><Factory size={16} /></span>
          <div className="app-drawer-titles">
            <h2 className="app-drawer-title" id="plant-drawer-title">{p.name}</h2>
            <div className="app-drawer-sub">{p.type === 'integrated' ? 'Integrated plant' : 'Grinding unit'} · {p.state}</div>
          </div>
          <button type="button" className="icon-btn sm" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="app-drawer-body">
          <div className="row"><StatusChip tone={RAG_TONE[p.health]}>{p.health}</StatusChip>{p.critical > 0 && <StatusChip tone="danger">{p.critical} critical advisory</StatusChip>}</div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            <div className="stat"><div className="stat-label">Cement output</div><div className="stat-value">{num(p.output)}</div><div className="stat-sub">TPD</div></div>
            <div className="stat"><div className="stat-label">Electrical SEC</div><div className="stat-value">{p.sec}</div><div className="stat-sub">kWh/t</div></div>
            <div className="stat"><div className="stat-label">Green power</div><div className="stat-value">{p.green}%</div><div className="stat-sub">WHRS + solar + hydro</div></div>
            <div className="stat"><div className="stat-label">Data completeness</div><div className="stat-value">{p.completeness}%</div><div className="stat-sub">all connectors</div></div>
          </div>
          <KV items={[
            ['Capacity', `${p.cementMtpa} MTPA cement${p.clinkerMtpa ? ` · ${p.clinkerMtpa} MTPA clinker` : ''}`],
            ['Grades', p.grades.join(', ')],
            ['Power assets', [p.power.cppMw ? `${p.power.cppMw} MW CPP${p.power.cppOnline ? '' : ' (non-operational)'}` : null, p.power.whrsMw ? `${p.power.whrsMw} MW WHRS` : null, p.power.solarMw ? `${p.power.solarMw} MW solar` : null, p.power.hydroMw ? `${p.power.hydroMw} MW wheeled hydro` : null].filter(Boolean).join(' · ') || 'Grid only'],
            ['Projected MD', `${p.md}% of ${num(p.power.cmdKva)} kVA`],
          ]} />
          <div><h3 className="kpi-sec-title" style={{ marginBottom: 6 }}>Highlights</h3><ul className="kpi-drivers">{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul></div>
          {p.issues.length > 0 && <div><h3 className="kpi-sec-title" style={{ marginBottom: 6 }}>Outside the normal band</h3><ul className="kpi-drivers">{p.issues.map((h) => <li key={h}>{h}</li>)}</ul></div>}
          {p.estimated?.length > 0 && <p className="kpi-note">Demo assumptions, not published figures: {p.estimated.join(', ')}.</p>}
        </div>
        <footer className="app-drawer-foot">
          <button type="button" className="app-primary-btn btn-md" onClick={() => onFilter(p.id)}>Filter dashboard to {p.name} <ArrowRight size={13} /></button>
        </footer>
      </aside>
    </>,
    document.body,
  );
}

export default function Overview() {
  const t = useTokens();
  const navigate = useNavigate();
  const studio = useStudio();
  const [plant, setPlant] = usePlantParam();
  const [mode, setMode] = useState('health');
  const [preview, setPreview] = useState(null);
  const { data, error, reload } = usePoll('/overview', { plant });

  const download = () => studio.open({
    title: 'Fleet overview', subtitle: 'Sagar Cements · six plants · live operating picture', filters: plantFilter(plant, PLANT_NAME[plant]),
    sections: [
      kpisSection(data.cards),
      tableSection('plants', 'Plant status', ['Plant', 'Type', 'Health', { h: 'Output TPD', num: true }, { h: 'SEC kWh/t', num: true }, { h: 'Green %', num: true }, { h: 'Advisories', num: true }],
        data.plants.map((p) => [p.name, p.type, p.health, num(p.output), p.sec, p.green, p.advisories])),
      trendSection('sec', 'Electrical SEC — 30 days', data.trend.sec, 1),
      barSection('dist', 'Cement output by plant (TPD)', data.distribution.map((d) => ({ key: d.key, label: d.label, value: d.output })), 0),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Fleet overview" actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <OverviewAdvisory />
      <div className="page-search"><GlobalSearch /></div>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards.slice(0, 5)} cols={5} />
          <KpiRow cards={data.cards.slice(5)} cols={5} />

          <section className="astk-panel is-flush">
            <div className="map-wrap map-panel">
              <div className="map-shell">
                <MapContainer center={[19.2, 80.2]} zoom={5} minZoom={4} maxZoom={9} scrollWheelZoom={false} style={{ height: '100%' }} attributionControl>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                  <Marker position={[data.hq.lat, data.hq.lng]} icon={L.divIcon({ className: '', html: '<div class="hq-marker"></div>', iconSize: [12, 12] })}>
                    <LTooltip direction="top" offset={[0, -6]}>{data.hq.name}</LTooltip>
                  </Marker>
                  {data.plants.map((p) => (
                    <Marker key={p.id} position={[p.lat, p.lng]} eventHandlers={{ click: () => setPreview(p) }}
                      icon={L.divIcon({ className: '', html: `<div class="plant-marker h-${markerRag(p, mode)} ${p.type === 'grinding' ? 'is-grinding' : ''}"></div>`, iconSize: [18, 18] })}>
                      <LTooltip direction="top" offset={[0, -8]}>{p.name} · {p.type === 'integrated' ? 'integrated' : 'grinding'} · {mode === 'energy' ? `${p.sec} kWh/t` : mode === 'data' ? `${p.completeness}% complete` : p.health}</LTooltip>
                    </Marker>
                  ))}
                </MapContainer>
                <div className="map-title"><div className="map-title-name">Six plants across four states</div><div className="faint small">Click a plant for its live picture</div></div>
                <div className="map-controls"><Segmented label="Map mode" options={MODES} value={mode} onChange={setMode} /></div>
                <div className="map-float map-legend">
                  <div className="lg-sub">{mode === 'health' ? 'Worst KPI band' : mode === 'energy' ? 'Electrical SEC' : 'Data completeness'}</div>
                  <div className="lg-row"><i className="lg-dot" style={{ background: t['app-success'] }} /> Normal</div>
                  <div className="lg-row"><i className="lg-dot" style={{ background: t['app-warning'] }} /> Warning</div>
                  <div className="lg-row"><i className="lg-dot" style={{ background: t['app-danger'] }} /> Critical</div>
                  <div className="lg-sub">Shape</div>
                  <div className="lg-row"><i className="lg-dot" style={{ background: t['app-text-faint'] }} /> Integrated plant</div>
                  <div className="lg-row"><i className="lg-dot" style={{ background: t['app-text-faint'], borderRadius: 3 }} /> Grinding unit · ▪ HQ Hyderabad</div>
                </div>
              </div>
            </div>
            <div className="map-legend-strip"><span className="faint small">Colour shows the worst band among 28-day pass rate, SEC, data completeness, MD and free lime ({mode} mode). Basemap © OpenStreetMap.</span></div>
          </section>

          <div className="split-wide">
            <Panel flush title="Plants needing attention" eyebrow="Worst first">
              <ul className="list-plain">
                {data.attention.length === 0 && <li className="panel-pad muted">All six plants are inside their normal bands.</li>}
                {data.attention.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="row-btn" onClick={() => setPreview(p)}>
                      <span className={`dot dot-${p.health}`} />
                      <span className="grow"><span className="t">{p.name}</span><span className="m" style={{ display: 'block' }}>{p.issues.join(' · ') || `${p.advisories} open advisories`}</span></span>
                      <StatusChip tone={RAG_TONE[p.health]}>{p.health}</StatusChip>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel flush title="Latest lab results" eyebrow="Fleet sample stream" actions={<button type="button" className="app-ghost-btn btn-sm" onClick={() => navigate('/lab')}>Open lab <ArrowRight size={12} /></button>}>
              <div className="table-wrap">
                <table className="app-table compact">
                  <thead><tr><th>Barcode</th><th>Plant</th><th>Instrument</th><th>Time</th><th>QC</th></tr></thead>
                  <tbody>{data.latest.map((s) => (
                    <tr key={s.id} className="is-clickable" tabIndex={0} onClick={() => navigate('/lab')} onKeyDown={(e) => e.key === 'Enter' && navigate('/lab')}>
                      <td className="mono">{s.id}</td><td>{s.plant}</td><td>{s.instrument} · {s.stage}</td><td>{fmtTime(s.at)}</td>
                      <td><StatusChip tone={s.qc === 'VALID' ? 'success' : 'warning'} title={s.note}>{s.qc}</StatusChip></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="grid-2">
            <Panel title="Electrical SEC — 30 days" eyebrow={plant ? PLANT_NAME[plant] : 'Fleet, capacity-weighted'}
              actions={<><Legend items={[{ kind: 'dot', color: t['app-series-1'], label: 'Actual' }, { kind: 'line', dash: 'dotted', color: t['app-chart-ref'], label: 'Previous' }, { kind: 'line', dash: 'dashed', color: t['app-forecast'], label: 'Forecast' }]} />
                <DownloadIcon label="Download SEC trend" onClick={() => studio.open({ title: 'Electrical SEC — 30 days', filters: plantFilter(plant, PLANT_NAME[plant]), sections: [trendSection('sec', 'Electrical SEC', data.trend.sec, 1)] })} /></>}>
              <TrendChart s={data.trend.sec} showF showC fmt={fmtNum(1)} label="Electrical SEC" t={t} height={240} refLines={[{ y: 70, label: 'FY27 target 70', tone: 'success' }]} />
            </Panel>
            <Panel title="Cement output by plant" eyebrow="TPD now · click a bar to filter"
              actions={<DownloadIcon label="Download output by plant" onClick={() => studio.open({ title: 'Cement output by plant', sections: [barSection('dist', 'Cement output (TPD)', data.distribution.map((d) => ({ key: d.key, label: d.label, value: d.output })), 0)] })} />}>
              <BreakdownChart rows={data.distribution.map((d) => ({ key: d.key, label: d.label, value: d.output }))} fmt={fmtNum(0)} t={t} onPick={(r) => setPlant(r.key)} />
            </Panel>
          </div>
        </>}
      </PageState>
      {preview && <PlantDrawer p={preview} onClose={() => setPreview(null)} onFilter={(id) => { setPreview(null); setPlant(id); }} />}
    </div>
  );
}
