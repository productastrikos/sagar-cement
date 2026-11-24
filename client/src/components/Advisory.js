// AI advisory surfaces (§10): header popover, overview panel, page strip and the
// ranked advisory row. One content model; engine always named; a person decides.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Info, Sparkles, XOctagon } from 'lucide-react';
import { post } from '../lib/api';
import { useLive } from '../lib/live';
import { useToast } from '../lib/toast';
import { fmtTime } from '../lib/format';
import { SEV_TONE, StatusChip } from './ui';

const NOTE_ICON = { danger: XOctagon, warning: AlertTriangle, info: Info };
export const SUPERVISOR_LINE = 'Ranked from lab, process, energy and data-health signals. A plant engineer decides the action; nothing writes back to the DCS.';

export function useApplyAdvisory(onDone) {
  const toast = useToast();
  const { refresh } = useLive();
  return async (a, act) => {
    try {
      await post(`/advisories/${a.id}/apply`, { idx: act.idx });
      toast('success', 'Recommendation applied', `${act.text} — logged to the audit trail.`);
      refresh(); onDone && onDone();
    } catch (e) { toast('danger', 'Could not apply', e.message); }
  };
}

/** Ranked, expandable advisory row (§10.1 anatomy). */
export function AdvRow({ a, rank, compact, onApplied, onNavigate, onDismiss }) {
  const [open, setOpen] = useState(rank === 1 && !compact);
  const navigate = useNavigate();
  const apply = useApplyAdvisory(onApplied);
  const go = () => { onNavigate && onNavigate(); navigate(`${a.route}?plant=${a.plant}`); };
  return (
    <li className={`adv-row ${open ? 'is-open' : ''}`}>
      <div className="adv-head">
        <span className="adv-rank">{rank}</span>
        <button type="button" className="adv-main" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="adv-title">{a.title}</span>
          <span className="adv-sub">{a.plantName} · {a.domain} · {a.confidence}% confidence{a.impactLakh ? ` · ₹${a.impactLakh} lakh/mo` : ''}</span>
        </button>
        <StatusChip tone={a.status === 'applied' ? 'success' : SEV_TONE[a.severity]}>{a.status === 'applied' ? 'Applied' : a.severity}</StatusChip>
        {open ? <ChevronDown size={14} className="faint" /> : <ChevronRight size={14} className="faint" />}
      </div>
      {open && (
        <div className="adv-body">
          {!compact && a.cause && <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{a.cause}</p>}
          <div className="adv-why">Evidence</div>
          <ul className="evidence-list">
            {a.evidence.map((e, i) => <li key={i}><span className={`kind kind-${e.kind}`}>{e.kind}</span><span>{e.text}</span></li>)}
          </ul>
          <div className="adv-why">Why this ranks here</div>
          <ul className="adv-reasons">{a.why.map((w) => <li key={w}>{w}</li>)}</ul>
          {!compact && (
            <>
              <div className="adv-why">Recommended actions</div>
              <ul className="kpi-recs" style={{ marginBottom: 8 }}>
                {a.actions.map((act) => (
                  <li key={act.id} className="kpi-rec">
                    <span className="kpi-rec-text"><b>{act.role}:</b> {act.text}</span>
                    {act.applied ? <StatusChip tone="success"><CheckCircle2 size={10} /> Applied</StatusChip>
                      : <button type="button" className="app-ai-btn" onClick={() => apply(a, act)}>Apply <ArrowRight size={11} /></button>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="btn-row">
            <button type="button" className="app-primary-btn btn-sm" onClick={go}>Open {a.route === '/' ? 'overview' : a.route.slice(1)} <ArrowRight size={12} /></button>
            {onDismiss && a.status === 'open' && <button type="button" className="app-ghost-btn btn-sm" onClick={() => onDismiss(a)}>Dismiss</button>}
            <span className="status-chip status-chip-neutral" title="Engine">{a.engine}</span>
            <span className="mono faint" style={{ marginLeft: 'auto' }}>{a.id}</span>
          </div>
        </div>
      )}
    </li>
  );
}

/** Header popover (§10.1). */
export function AdvisoryPopover({ onClose }) {
  const { live } = useLive();
  const navigate = useNavigate();
  const adv = live?.advisory;
  return (
    <div className="adv-pop" role="dialog" aria-label="AI advisory">
      <div className="adv-pop-head">
        <div>
          <div className="adv-panel-title" style={{ fontFamily: 'Lexend Deca', fontWeight: 700, fontSize: 13 }}><Sparkles size={14} /> AI Advisory</div>
          <div className="faint small">Updated {adv ? fmtTime(adv.updatedAt) : '—'}</div>
        </div>
        <button type="button" className="app-ghost-btn btn-sm" onClick={() => { onClose(); navigate('/advisory'); }}>Full advisory <ArrowRight size={12} /></button>
      </div>
      {!adv ? <div className="app-spinner" /> : (
        <>
          <ul className="adv-summary">{adv.summary.map((s) => <li key={s}>{s}</li>)}</ul>
          <div className="adv-section-label">Deal with first</div>
          <ul className="adv-list">{adv.top.map((a, i) => <AdvRow key={a.id} a={a} rank={i + 1} compact onNavigate={onClose} />)}</ul>
          {adv.ops.length > 0 && <>
            <div className="adv-section-label">Operations</div>
            <div className="stack" style={{ gap: 6 }}>
              {adv.ops.map((o) => {
                const I = NOTE_ICON[o.tone] || Info;
                return <button key={o.text} type="button" className={`adv-note tone-${o.tone}`} onClick={() => { onClose(); navigate(o.route); }}><I size={14} /><span>{o.text}</span><ArrowRight size={13} /></button>;
              })}
            </div>
          </>}
          <div className="adv-foot"><span className="status-chip status-chip-neutral">S!aP advisory engine · rules + models</span><span>{SUPERVISOR_LINE}</span></div>
        </>
      )}
    </div>
  );
}

/** Overview advisory panel (§10.2). */
export function OverviewAdvisory() {
  const { live } = useLive();
  const navigate = useNavigate();
  const adv = live?.advisory;
  return (
    <section className="astk-panel is-flush overview-advisory">
      <div className="panel-head">
        <div>
          <div className="astk-eyebrow">What needs attention across the six plants, what to deal with first, and why</div>
          <h2 className="panel-title adv-panel-title"><Sparkles size={14} /> AI Advisory</h2>
        </div>
        <div className="panel-actions"><button type="button" className="app-ghost-btn btn-sm" onClick={() => navigate('/advisory')}>Full advisory <ArrowRight size={12} /></button></div>
      </div>
      {!adv ? <div className="panel-pad"><span className="app-spinner" /></div> : (
        <>
          <ul className="adv-summary" style={{ padding: '0 18px 12px 36px', margin: 0 }}>{adv.summary.map((s) => <li key={s}>{s}</li>)}</ul>
          <div className="adv-strip">
            {adv.top.slice(0, 4).map((a) => (
              <button key={a.id} type="button" className="adv-card" onClick={() => navigate(`${a.route}?plant=${a.plant}`)}>
                <div className="top"><span className="t">{a.short || a.title}</span><StatusChip tone={SEV_TONE[a.severity]}>{a.severity}</StatusChip></div>
                <div className="h">{a.plantName} · {a.evidence[0]?.text}</div>
                <div className="faint small">{a.engine}</div>
              </button>
            ))}
          </div>
          {adv.ops.slice(0, 2).length > 0 && (
            <div className="stack" style={{ gap: 6, padding: '0 14px 14px' }}>
              {adv.ops.slice(0, 2).map((o) => { const I = NOTE_ICON[o.tone] || Info; return <button key={o.text} type="button" className={`adv-note tone-${o.tone}`} onClick={() => navigate(o.route)}><I size={14} /><span>{o.text}</span><ArrowRight size={13} /></button>; })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Page advisory strip (§10.3) — collapsed by default; open state per page in localStorage. */
export function PageAdvisoryStrip({ pageId, match }) {
  const { live } = useLive();
  const navigate = useNavigate();
  const key = `ax-adv-open:${pageId}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const items = (live?.advisory?.open || live?.advisory?.top || []).filter(match);
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(key, v ? '1' : '0'); } catch {} };
  if (!live) return null;
  const level = items.some((a) => a.severity === 'critical') ? 'danger' : items.some((a) => a.severity === 'high') ? 'warning' : items.length ? 'advisory' : 'success';
  const word = { danger: 'Critical', warning: 'High', advisory: 'Advisory', success: 'Clear' }[level];
  return (
    <div className={`ax-strip axt-${level}`}>
      <div className="ax-strip-head">
        <span className="ax-strip-brand"><Sparkles size={13} /> AI advisory</span>
        <StatusChip tone={level === 'advisory' ? 'ai' : level}>{word}</StatusChip>
        {items[0] ? (
          <button type="button" className="ax-strip-text link-plain" onClick={() => navigate('/advisory')}>{items[0].title} — {items[0].plantName}</button>
        ) : <span className="ax-strip-text muted">No advisories for this view right now. The engine keeps watching.</span>}
        {items.length > 0 && <button type="button" className="ax-strip-btn" onClick={toggle} aria-expanded={open}>{open ? 'Hide' : `Show ${items.length}`}</button>}
      </div>
      {open && items.length > 0 && (
        <ol className="ax-strip-list">
          {items.map((a, i) => (
            <li key={a.id} className="is-link" onClick={() => navigate('/advisory')} onKeyDown={(e) => e.key === 'Enter' && navigate('/advisory')} tabIndex={0}>
              <span className="ai-num">{i + 1}</span>
              <span style={{ flex: 1 }}>{a.title} <span className="faint">· {a.plantName} · {a.engine}</span></span>
              <StatusChip tone={SEV_TONE[a.severity]}>{a.severity}</StatusChip><ArrowRight size={13} className="faint" />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
