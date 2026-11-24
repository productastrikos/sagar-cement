// KPI card (§7.7) — a button whose only behaviour is opening the KPI drawer.
import React, { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { useKpi } from '../lib/kpi';
import { KpiIcon } from '../lib/icons';
import { TrendBadge } from './ui';

export function KpiCard({ c, compact }) {
  const { open, openKpi, syncKpi } = useKpi();
  const isOpen = open?.id === c.id && JSON.stringify(open?.filters || {}) === JSON.stringify(c.filters || {});
  useEffect(() => { if (isOpen) syncKpi(c); }, [isOpen, c, syncKpi]);
  const unit = c.unit && c.unit !== '' ? ` ${c.unit}` : '';
  return (
    <button type="button" className={`kpi-card ${isOpen ? 'is-open' : ''}`} onClick={() => openKpi(c)}
      aria-haspopup="dialog" aria-expanded={isOpen} aria-label={`${c.label}: ${c.value}${unit}. Open details`}
      data-kpi data-kpi-trend={c.trend ? `${c.trend.change > 0 ? 'up' : 'down'} ${Math.abs(c.trend.change)}% ${c.trend.cap}` : undefined} data-kpi-note={c.foot}>
      <div className="kpi-top">
        <span className="kpi-label">{c.label}</span>
        <span className={`kpi-icon tone-${c.tone || 'accent'} ${c.ai ? 'is-ai' : ''}`}><KpiIcon name={c.icon} /></span>
      </div>
      {c.trend && !compact ? (
        <div className="kpi-value-row">
          <div className="kpi-value astk-numeric">{c.value}<span className="kpi-unit">{unit}</span></div>
          <TrendBadge change={c.trend.change} good={c.trend.good} />
        </div>
      ) : <div className="kpi-value astk-numeric">{c.value}<span className="kpi-unit">{unit}</span></div>}
      <div className="kpi-foot">
        <span className={`kpi-rag-dot rag-${c.rag}`} aria-hidden="true" />
        <span className="kpi-foot-text">{c.foot}</span>
        <span className="kpi-more">Details <ChevronRight size={12} /></span>
      </div>
    </button>
  );
}

export function KpiRow({ cards, cols }) {
  if (!cards) {
    return <div className={`kpi-row kpi-${cols || 5}`}>{Array.from({ length: cols || 5 }, (_, i) => <div key={i} className="app-skeleton" style={{ height: 118, borderRadius: 14 }} />)}</div>;
  }
  const n = cols || (cards.length % 5 === 0 ? 5 : cards.length % 4 === 0 ? 4 : cards.length % 6 === 0 ? 6 : Math.min(5, cards.length));
  return <div className={`kpi-row kpi-${n}`}>{cards.map((c) => <KpiCard key={c.id} c={c} compact={n === 6} />)}</div>;
}
