// Field & vision — field instruments, sensors and cameras connected with plant
// automation (read-only). Camera tiles show edge-AI scalar features, not video.
import React from 'react';
import { Download } from 'lucide-react';
import { usePoll } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useTokens } from '../lib/tokens';
import { PLANT_NAME, fmtTime } from '../lib/format';
import { kpisSection, tableSection, seriesSection } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { PageAdvisoryStrip } from '../components/Advisory';
import { SeriesChart, Legend, fmtNum } from '../components/charts';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, Segmented, StatusChip, DownloadIcon, RAG_TONE, usePlantParam } from '../components/ui';

function CamView({ c }) {
  const sev = Math.min(1, c.value / c.critHi);
  const hot = c.status === 'critical' ? 'var(--app-danger)' : c.status === 'warning' ? 'var(--app-warning)' : 'var(--app-accent)';
  if (c.key === 'shell') {
    return (
      <svg viewBox="0 0 240 118" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="240" height="118" fill="var(--app-surface-soft)" />
        <rect x="16" y="44" width="208" height="30" rx="10" fill="var(--app-surface-raised)" />
        {Array.from({ length: 13 }, (_, i) => <rect key={i} x={18 + i * 16} y="46" width="14" height="26" rx="3" fill={hot} opacity={0.15 + 0.7 * Math.exp(-(((i - 6.5) / (2.2 + 2 * (1 - sev))) ** 2)) * (0.4 + sev)} />)}
        <text x="16" y="96" className="sld-faint">feed end</text><text x="224" y="96" textAnchor="end" className="sld-faint">burner</text>
      </svg>
    );
  }
  if (c.key === 'flame') {
    const dx = (c.value - 0.15) * 160;
    return (
      <svg viewBox="0 0 240 118" aria-hidden="true">
        <rect width="240" height="118" fill="var(--app-surface-soft)" />
        <circle cx="120" cy="59" r="50" fill="none" stroke="var(--app-border-strong)" strokeDasharray="3 4" />
        <ellipse cx={120 + dx} cy="59" rx="46" ry="20" fill={hot} opacity="0.28" />
        <ellipse cx={116 + dx} cy="59" rx="26" ry="11" fill={hot} opacity="0.55" />
        <line x1="120" y1="20" x2="120" y2="98" stroke="var(--app-text-faint)" strokeDasharray="2 3" />
      </svg>
    );
  }
  if (c.key === 'cooler') {
    return (
      <svg viewBox="0 0 240 118" preserveAspectRatio="none" aria-hidden="true">
        <rect width="240" height="118" fill="var(--app-surface-soft)" />
        {Array.from({ length: 6 }, (_, r) => Array.from({ length: 12 }, (__, i) => {
          const streak = r === 2 || r === 3 ? sev : sev * 0.2;
          return <rect key={`${r}-${i}`} x={8 + i * 19} y={10 + r * 17} width="17" height="15" rx="3" fill={hot} opacity={Math.max(0.08, (1 - i / 12) * 0.5 + streak * 0.5 * (1 - i / 14))} />;
        }))}
      </svg>
    );
  }
  const off = (c.value - 6) * 1.5;
  return (
    <svg viewBox="0 0 240 118" aria-hidden="true">
      <rect width="240" height="118" fill="var(--app-surface-soft)" />
      <polygon points={`70,0 170,0 ${200 + off},118 ${40 + off},118`} fill="var(--app-surface-raised)" />
      {Array.from({ length: 7 }, (_, i) => <line key={i} x1={80 + i * 13} y1="0" x2={55 + off + i * 22} y2="118" stroke="var(--app-border-strong)" />)}
      <line x1="120" y1="0" x2={120 + off} y2="118" stroke={hot} strokeWidth="2" strokeDasharray="5 4" />
    </svg>
  );
}

export default function Field() {
  const t = useTokens();
  const studio = useStudio();
  const [plant, setPlant, sp, setSp] = usePlantParam('MTP');
  const line = sp.get('line') || '';
  const setLine = (v) => { const n = new URLSearchParams(sp); n.set('line', v); setSp(n, { replace: true }); };
  const { data, error, reload } = usePoll('/field', { plant, line });

  const sensor = (data?.softSensor?.est || []).map((p) => ({ t: fmtTime(new Date(p.t).toISOString()), est: p.v }));
  const download = () => studio.open({
    title: 'Field & vision', subtitle: `${data.plantName}${data.line ? ` · ${data.lines.find((l) => l.id === data.line)?.name}` : ''} · live tags and camera features`,
    filters: [{ k: 'Plant', v: data.plantName }],
    sections: [
      kpisSection(data.cards),
      ...(data.cameras.length ? [tableSection('cams', 'Camera features', ['Camera', 'Feature', { h: 'Value', num: true }, 'Unit', 'Status'], data.cameras.map((c) => [c.name, c.feature, c.value, c.unit, c.status]))] : []),
      ...(data.shell.length ? [seriesSection('shell', 'Kiln shell temperature profile', data.shell, 'pos', [{ key: 'temp', name: 'Shell °C', colorKey: 'app-series-1' }, { key: 'baseline', name: 'Baseline °C', colorKey: 'app-chart-ref', dash: '2 3' }], 0)] : []),
      ...data.sections.map((s, i) => tableSection(`sec-${i}`, s.name, ['Tag', 'Signal', { h: 'Value', num: true }, 'Unit', 'Normal range', 'Status'], s.tags.map((g) => [g.code, g.label, g.value, g.unit, `${g.lo} – ${g.hi}`, g.status]))),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="Field & vision" subtitle="Field instruments, sensors and cameras connected with plant automation — read-only, nothing writes back"
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download page</button>} />
      <PageAdvisoryStrip pageId="field" match={(a) => ['S3', 'S4', 'S2'].includes(a.key) || a.domain === 'process'} />
      <FilterBar>
        <PlantSelect value={plant} onChange={(v) => { setPlant(v); }} includeAll={false} />
        {data?.lines?.length > 1 && (
          <label className="fb-field fb-range"><span className="app-label">Kiln line</span>
            <Segmented label="Kiln line" options={data.lines.map((l) => ({ value: l.id, label: `${l.name} · ${l.tpd.toLocaleString('en-IN')} TPD` }))} value={data.line} onChange={setLine} /></label>
        )}
      </FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} cols={data.cards.length === 6 ? 6 : 4} />
          {data.cameras.length > 0 && (
            <Panel title="Cameras" eyebrow="Edge-AI features streamed as tags · stylised views, not video">
              <div className="cam-grid">
                {data.cameras.map((c) => (
                  <div key={c.key} className="cam-tile">
                    <div className="cam-view"><CamView c={c} /><span className="cam-badge"><span className={`dot dot-${c.status}`} /> {c.status}</span></div>
                    <div className="cam-body">
                      <div className="row between"><b style={{ fontSize: 12.5 }}>{c.name}</b><StatusChip tone={RAG_TONE[c.status]}>{c.value} {c.unit}</StatusChip></div>
                      <div className="faint small">{c.feature} · normal ≤ {c.normalHi}, critical &gt; {c.critHi}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {data.shell.length > 0 && (
            <div className="grid-2">
              <Panel title="Kiln shell temperature" eyebrow="Scanner profile along the kiln (m from feed end)"
                actions={<><Legend items={[{ kind: 'line', color: t['app-series-1'], label: 'Shell' }, { kind: 'line', dash: 'dotted', color: t['app-chart-ref'], label: 'Baseline' }]} />
                  <DownloadIcon label="Download shell profile" onClick={() => studio.open({ title: 'Kiln shell temperature profile', filters: [{ k: 'Plant', v: data.plantName }], sections: [seriesSection('shell', 'Shell profile', data.shell, 'pos', [{ key: 'temp', name: 'Shell °C', colorKey: 'app-series-1' }, { key: 'baseline', name: 'Baseline °C', colorKey: 'app-chart-ref', dash: '2 3' }], 0)] })} /></>}>
                <SeriesChart data={data.shell} xKey="pos" series={[{ key: 'temp', name: 'Shell °C', colorKey: 'app-series-1' }, { key: 'baseline', name: 'Baseline °C', colorKey: 'app-chart-ref', dash: '2 3', width: 1.5 }]} t={t} fmt={fmtNum(0)} height={240} />
              </Panel>
              <Panel title="Free-lime soft sensor" eyebrow={`1-minute estimate · last 90 minutes${data.softSensor?.paused ? ' · PAUSED by data health' : ''}`}>
                <SeriesChart data={sensor} xKey="t" series={[{ key: 'est', name: 'f-CaO %', colorKey: 'app-series-1' }]} t={t} fmt={fmtNum(2)} height={240} />
                <p className="faint small">Band 0.5–1.5%. Lab XRD confirms hourly; see Predict &amp; optimise for the 45-minute forecast.</p>
              </Panel>
            </div>
          )}
          <div className="tag-grid">
            {data.sections.map((s) => (
              <Panel key={s.name} title={s.name} eyebrow={`${s.tags.length} tags`}>
                {s.tags.map((g) => (
                  <div key={g.code} className="tag-row">
                    <span>{g.label}<div className="code">{g.code}</div></span>
                    <span><div className={`v ${g.status === 'warning' ? 'is-warning' : ''}`}>{g.value} <span className="faint small">{g.unit}</span></div><div className="rng">normal {g.lo}–{g.hi}</div></span>
                  </div>
                ))}
              </Panel>
            ))}
          </div>
          <p className="faint small">Tags arrive through the plant DCS via a local OPC DA→UA wrapper; values are read-only. {PLANT_NAME[plant]} DCS vendor names are not published and are not shown.</p>
        </>}
      </PageState>
    </div>
  );
}
