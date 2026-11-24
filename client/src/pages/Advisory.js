// AI advisory page (§10.4).
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Download, Sparkles } from 'lucide-react';
import { usePoll, useLive } from '../lib/live';
import { useStudio } from '../lib/studio';
import { useToast } from '../lib/toast';
import { post } from '../lib/api';
import { PLANT_NAME, fmtDateTime } from '../lib/format';
import { kpisSection, tableSection, aiSection, plantFilter } from '../lib/doc';
import { KpiRow } from '../components/Kpi';
import { AdvRow, SUPERVISOR_LINE, useApplyAdvisory } from '../components/Advisory';
import { PageHeader, Panel, PageState, FilterBar, PlantSelect, SelectField, StatusChip, SEV_TONE, Empty, DownloadIcon, usePlantParam } from '../components/ui';

const SEV_COLOR = { critical: 'var(--app-danger)', high: 'var(--app-warning)', medium: 'var(--app-info)', low: 'var(--app-text-faint)' };
const DOMAIN_COLOR = { quality: 'var(--app-series-1)', process: 'var(--app-teal)', energy: 'var(--app-info)', data: 'var(--app-warning)' };

export default function Advisory() {
  const navigate = useNavigate();
  const studio = useStudio();
  const toast = useToast();
  const { refresh } = useLive();
  const [plant, setPlant] = usePlantParam();
  const [domain, setDomain] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const { data, error, reload } = usePoll('/advisories', { plant, domain });
  const audit = usePoll('/audit', null, 8000);
  const apply = useApplyAdvisory(reload);

  const open = data?.list.filter((a) => a.status === 'open') || [];
  const closed = data?.list.filter((a) => a.status !== 'open') || [];
  const max = Math.max(1, ...(data?.stages || []).map((s) => s.n), ...(data?.bySeverity || []).map((s) => s.n));
  const dismiss = async (a) => { await post(`/advisories/${a.id}/dismiss`); toast('info', 'Advisory dismissed', `${a.short || a.title} — logged to the audit trail.`); reload(); refresh(); };

  const download = () => studio.open({
    title: 'AI advisory', subtitle: 'Ranked advisories with evidence, actions and impact', filters: [...plantFilter(plant, PLANT_NAME[plant]), ...(domain ? [{ k: 'Domain', v: domain }] : [])],
    sections: [
      kpisSection(data.cards),
      tableSection('list', 'Open advisories', ['#', 'Advisory', 'Plant', 'Severity', { h: 'Confidence', num: true }, { h: '₹ lakh/mo', num: true }, 'Engine'],
        open.map((a, i) => [i + 1, a.title, a.plantName, a.severity, `${a.confidence}%`, a.impactLakh || '—', a.engine])),
      ...open.slice(0, 4).map((a, i) => aiSection(`ai-${i}`, `${i + 1}. ${a.short || a.title} — ${a.plantName}`, a.cause || a.title,
        [...a.evidence.map((e) => `${e.kind}: ${e.text}`), ...a.actions.map((x) => `Recommendation (${x.role}): ${x.text}${x.applied ? ' (Applied)' : ''}`)], a.engine)),
    ],
  });

  return (
    <div className="page">
      <PageHeader title="AI advisory" subtitle={<><Sparkles size={12} /> Rules, soft sensors and forecasters ranked into one list. {SUPERVISOR_LINE}</>}
        actions={data && <button type="button" className="app-control-btn btn-md" onClick={download}><Download size={14} /> Download</button>} />
      <FilterBar showReset={!!(plant || domain)} onReset={() => { setPlant(''); setDomain(''); }}>
        <PlantSelect value={plant} onChange={setPlant} />
        <SelectField label="Domain" value={domain} onChange={setDomain} allLabel="All domains" options={[['quality', 'Quality'], ['process', 'Process'], ['energy', 'Energy'], ['data', 'Data']]} />
      </FilterBar>
      <PageState data={data} error={error} reload={reload}>
        {data && <>
          <KpiRow cards={data.cards} cols={6} />
          <div className="split-wide">
            <Panel flush title="Deal with these first" eyebrow="Ranked by severity × confidence × impact">
              {open.length === 0 ? <Empty icon={Sparkles} title="Nothing open" text="Every advisory for these filters has been applied or dismissed. The engine keeps watching." /> : (
                <ul className="ai-actions">
                  {open.slice(0, 6).map((a, i) => {
                    const next = a.actions.find((x) => !x.applied);
                    return (
                      <li key={a.id} className={`ai-action tone-${SEV_TONE[a.severity] === 'danger' ? 'danger' : SEV_TONE[a.severity] === 'warning' ? 'warning' : 'info'}`}>
                        <span className="ai-num">{i + 1}</span>
                        <div className="grow">
                          <div className="ai-title">{a.title}</div>
                          <div className="ai-detail">{a.plantName} · {a.evidence[0]?.text}</div>
                        </div>
                        {next && <button type="button" className="app-ai-btn" onClick={() => apply(a, next)} title={next.text}>Apply next <ArrowRight size={11} /></button>}
                        <button type="button" className="app-ghost-btn btn-sm" onClick={() => navigate(`${a.route}?plant=${a.plant}`)}>Open</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
            <Panel title="Where the advisories are" eyebrow="Open items by domain and severity">
              <div className="stack" style={{ gap: 8 }}>
                {data.stages.map((s) => (
                  <div key={s.key} className="stage-row"><span>{s.label}</span><span className="stage-bar"><span className="stage-fill" style={{ width: `${(s.n / max) * 100}%`, background: DOMAIN_COLOR[s.key] }} /></span><span className="stage-n">{s.n}</span></div>
                ))}
                <div className="sub-h">By severity</div>
                {data.bySeverity.map((s) => (
                  <div key={s.key} className="stage-row"><span style={{ textTransform: 'capitalize' }}>{s.key}</span><span className="stage-bar"><span className="stage-fill" style={{ width: `${(s.n / max) * 100}%`, background: SEV_COLOR[s.key] }} /></span><span className="stage-n">{s.n}</span></div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel title="All advisories" eyebrow="Expand for evidence, ranking reasons and actions"
            actions={<><label className="row small muted"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show applied &amp; dismissed ({closed.length})</label>
              <DownloadIcon label="Download all advisories" onClick={download} /></>}>
            <ul className="adv-list">
              {(showClosed ? data.list : open).map((a, i) => <AdvRow key={a.id} a={a} rank={i + 1} onApplied={reload} onDismiss={dismiss} />)}
            </ul>
          </Panel>
          <Panel flush title="Decision audit trail" eyebrow="Every apply, dismiss, download and demo action">
            <div className="table-wrap tall">
              <table className="app-table compact">
                <thead><tr><th>ID</th><th>Time</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
                <tbody>
                  {(audit.data?.audit || []).slice(0, 60).map((x) => (
                    <tr key={x.id}><td className="mono">{x.id}</td><td>{fmtDateTime(x.ts)}</td><td>{x.user}<div className="faint small">{x.role}</div></td><td>{x.action}</td><td>{x.target}</td></tr>
                  ))}
                  {!audit.data?.audit?.length && <tr><td colSpan={5}><div className="app-empty"><div className="app-empty-title">No decisions yet</div><div className="app-empty-text">Apply or dismiss an advisory and it is logged here.</div></div></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="faint small">{SUPERVISOR_LINE} <StatusChip tone="neutral">S!aP advisory engine · rules + models</StatusChip></p>
        </>}
      </PageState>
    </div>
  );
}
