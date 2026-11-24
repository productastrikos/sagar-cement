// Shared primitives — composition only; colour, type and shape come from theme.css.
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Info, Inbox, RotateCcw, Sparkles, X, XOctagon } from 'lucide-react';
import { PLANT_OPTIONS } from '../lib/format';

export const PLANT_EVENT = 'clinkeriq:plant';

export const RAG_TONE = { normal: 'success', warning: 'warning', critical: 'danger' };
export const SEV_TONE = { critical: 'danger', high: 'warning', medium: 'info', low: 'neutral' };

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="page-header-block">
      <div style={{ minWidth: 0 }}>
        {breadcrumb && <div className="app-breadcrumb">{breadcrumb}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ eyebrow, title, actions, flush, className = '', children, style, bodyClass = '' }) {
  return (
    <section className={`astk-panel ${flush ? 'is-flush' : ''} ${className}`} style={style}>
      {(title || actions) && (
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="astk-eyebrow">{eyebrow}</div>}
            {title && <h2 className="panel-title">{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className={`panel-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function StatusChip({ tone = 'neutral', children, title }) {
  return <span className={`status-chip status-chip-${tone}`} title={title}>{children}</span>;
}

export function TrendBadge({ change, good, cap }) {
  if (change == null) return null;
  const flat = Math.abs(change) < 0.05;
  return (
    <span className={`trend-badge ${flat ? 'is-flat' : good ? 'is-good' : 'is-bad'}`}>
      {flat ? '' : change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%{cap && <span className="cap">&nbsp;{cap}</span>}
    </span>
  );
}

export const RagLabel = ({ rag, text }) => <span className={`rag-label rag-${rag}`}>{text || rag?.toUpperCase()}</span>;

const CALLOUT_ICON = { info: Info, warning: AlertTriangle, danger: XOctagon, success: CheckCircle2, advisory: Sparkles, teal: Info };
export function Callout({ tone = 'info', title, children, style }) {
  const Icon = CALLOUT_ICON[tone] || Info;
  return (
    <div className={`callout callout-${tone}`} style={style} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={15} className="callout-icon" />
      <div style={{ minWidth: 0 }}>
        {title && <div className="callout-title">{title}</div>}
        <div className="callout-body">{children}</div>
      </div>
    </div>
  );
}

export function Loading({ text = 'Loading live data…' }) {
  return <div className="app-loading"><div className="app-loading-orbit" /><div className="app-loading-text">{text}</div></div>;
}

export function Empty({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="app-empty">
      <Icon className="app-empty-icon" />
      <div className="app-empty-title">{title}</div>
      {text && <div className="app-empty-text">{text}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <Callout tone="danger" title="Couldn't load this view">
      {message || 'The API did not respond.'} Check that the ClinkerIQ server is running, then retry.{' '}
      {onRetry && <button type="button" className="app-control-btn btn-sm" onClick={onRetry} style={{ marginLeft: 6 }}>Retry</button>}
    </Callout>
  );
}

/** Page-level guard: error → callout, no data → loader. */
export function PageState({ data, error, reload, children }) {
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return children;
}

export function Segmented({ options, value, onChange, label, size }) {
  const ref = useRef(null);
  const onKey = (e) => {
    const i = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowRight') { onChange(options[(i + 1) % options.length].value); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { onChange(options[(i - 1 + options.length) % options.length].value); e.preventDefault(); }
  };
  return (
    <div className="app-timeframe-control" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey} style={size === 'sm' ? { padding: 2 } : undefined}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1}
          className={`app-timeframe-btn ${o.value === value ? 'is-active' : ''}`} onClick={() => onChange(o.value)} disabled={o.disabled}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`app-toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)} />;
}

/** The page's plant filter lives in the URL (?plant=) so it survives navigation and links. */
export function usePlantParam(fallback) {
  const [sp, setSp] = useSearchParams();
  const plant = sp.get('plant') || fallback || '';
  // Tell the shell which plant this page is really showing (for the header crumb).
  useEffect(() => { window.dispatchEvent(new CustomEvent(PLANT_EVENT, { detail: plant })); }, [plant]);
  const setPlant = (v) => {
    const next = new URLSearchParams(sp);
    if (v) next.set('plant', v); else next.delete('plant');
    setSp(next, { replace: true });
  };
  return [plant, setPlant, sp, setSp];
}

export function PlantSelect({ value, onChange, includeAll = true, only, label = 'Plant' }) {
  const opts = PLANT_OPTIONS.filter(([id]) => !only || only.includes(id));
  return (
    <label className="fb-field">
      <span className="app-label">{label}</span>
      <select className="app-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {includeAll && <option value="">All plants</option>}
        {opts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

export function SelectField({ label, value, onChange, options, allLabel }) {
  return (
    <label className="fb-field">
      <span className="app-label">{label}</span>
      <select className="app-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
    </label>
  );
}

export function FilterBar({ children, onReset, showReset, summary }) {
  return (
    <div className="astk-panel filter-bar is-compact">
      {children}
      {showReset && <button type="button" className="app-ghost-btn btn-sm fb-clear" onClick={onReset}><RotateCcw size={13} /> Reset</button>}
      {summary && <div className="fb-applied">{summary}</div>}
    </div>
  );
}

export const DownloadIcon = ({ onClick, label = 'Download', disabled }) => (
  <button type="button" className="icon-btn sm" aria-label={label} title={label} onClick={onClick} disabled={disabled}><Download size={13} /></button>
);

export const Stat = ({ label, value, sub, tone }) => (
  <div className="stat">
    <div className="stat-label">{label}</div>
    <div className={`stat-value astk-numeric ${tone ? `tone-${tone}` : ''}`}>{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export function Progress({ pct, goodUp }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const bad = goodUp ? 100 - p : p;
  const color = bad >= 90 ? 'var(--app-danger)' : bad >= 70 ? 'var(--app-warning)' : 'var(--app-success)';
  return <div className="progress-track"><div className="progress-fill" style={{ width: `${p}%`, background: color }} /></div>;
}

/** Modal (§7.17): portal, Esc, backdrop click, focus trap, focus return. */
export function Modal({ title, onClose, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    el?.querySelector('button, [href], input, select, textarea')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return createPortal(
    <div className="app-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`app-modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="app-modal-title" ref={ref}>
        <div className="app-modal-header">
          <div className="app-modal-title" id="app-modal-title">{title}</div>
          <button type="button" className="icon-btn sm" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="app-modal-body">{children}</div>
        {footer && <div className="app-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Small key-value list. */
export const KV = ({ items }) => (
  <dl className="kv">{items.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
);
