// Document Studio (§9): view → edit → download as PDF, Excel, CSV or PNG.
// The document is held as state (not scraped from the DOM), so every edit
// flows into every format. Paper is always BISG colours, whatever the theme.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, ArrowDown, ArrowUp, BarChart3, Check, Download, FileText, LayoutGrid, Pencil, Plus, RotateCcw, Sparkles, Table2, X } from 'lucide-react';
import { post } from '../lib/api';
import { PAPER } from '../lib/tokens';
import { useToast } from '../lib/toast';
import { PRODUCT, PRODUCT_SLUG, slug, fmtDate } from '../lib/format';
import { TrendChart, BreakdownChart, SeriesChart, fmtNum } from './charts';
import { Segmented } from './ui';

const PAGE_W = 794; const PAGE_H = 1123; const MAIN_H = PAGE_H - 118 - 60; const TITLE_H = 168; const CHART_W = PAGE_W - 112;
const TYPE_ICON = { kpis: LayoutGrid, chart: BarChart3, table: Table2, ai: Sparkles, text: AlignLeft, kv: AlignLeft };
const FORMAT_TEXT = {
  PDF: 'Branded A4 pages, exactly as previewed.',
  Excel: 'One sheet per table, chart and the summary. Numbers stay numbers.',
  CSV: 'The sheet on screen, UTF-8 with BOM, comma-separated, with a header row.',
  PNG: 'Each page as an image at 2× resolution.',
};

const est = (text, perLine, lh) => Math.max(1, Math.ceil(String(text || '').length / perLine)) * lh;
function sectionHeight(s, fudge = 1) {
  const head = 30 * fudge;
  switch (s.type) {
    case 'kpis': return head + Math.ceil(s.items.length / 4) * 74;
    case 'chart': return head + (s.chart.kind === 'bar' ? Math.max(130, s.chart.rows.length * 26 + 24) : 240) + 8;
    case 'ai': return head + (30 + est(s.body, 95, 19) + (s.bullets || []).reduce((a, b) => a + est(b, 100, 17), 0)) * fudge;
    case 'text': return head + (est(s.body, 105, 19) + 6) * fudge;
    case 'kv': return head + Math.ceil((s.items || []).length) * 22;
    default: return head + 26 + s.rows.length * 23;
  }
}

/** Flow sections onto A4 pages; tables split across pages repeat their header. */
function paginate(sections, fudge = 1) {
  const pages = [[]];
  let room = MAIN_H - TITLE_H;
  for (const s of sections) {
    if (s.type === 'table') {
      let rows = s.rows; let cont = false;
      while (rows.length) {
        const fit = Math.floor((room - 30 - 26 - 18) / 23);
        if (fit < 3 && pages[pages.length - 1].length) { pages.push([]); room = MAIN_H; continue; }
        const take = rows.slice(0, Math.max(3, fit));
        pages[pages.length - 1].push({ ...s, rows: take, continued: cont, key: `${s.id}-${rows.length}` });
        room -= 30 + 26 + take.length * 23 + 18;
        rows = rows.slice(take.length); cont = true;
        if (rows.length) { pages.push([]); room = MAIN_H; }
      }
      continue;
    }
    const h = sectionHeight(s, fudge) + 18;
    if (h > room && pages[pages.length - 1].length) { pages.push([]); room = MAIN_H; }
    pages[pages.length - 1].push({ ...s, key: s.id });
    room -= h;
  }
  return pages;
}

function sheetsOf(doc) {
  const sheets = [];
  const kpis = doc.sections.filter((s) => s.include && s.type === 'kpis').flatMap((s) => s.items.map((i) => [i.label, i.value, i.sub || '']));
  sheets.push({ name: 'Summary', cols: ['Field', 'Value', 'Note'], rows: [['Title', doc.title, ''], ['Subtitle', doc.subtitle || '', ''], ['Prepared for', doc.preparedFor, ''], ['Prepared by', doc.preparedBy, ''], ['Date', doc.date, ''], ...doc.filters.map((f) => [f.k, f.v, 'filter']), ...kpis] });
  for (const s of doc.sections.filter((x) => x.include)) {
    if (s.type === 'table') sheets.push({ name: s.title, cols: s.cols.map((c) => c.h), rows: s.rows });
    if (s.type === 'chart' && s.chart.kind === 'trend') {
      const c = s.chart.series; const f = fmtNum(s.chart.dp);
      sheets.push({ name: `${s.title} data`, cols: ['Period', 'Actual', 'Forecast', '95% low', '95% high', 'Previous'], rows: c.labels.map((l, i) => [l, c.actual[i] == null ? '' : f(c.actual[i]), c.forecast[i] == null ? '' : f(c.forecast[i]), c.lower[i] == null ? '' : f(c.lower[i]), c.upper[i] == null ? '' : f(c.upper[i]), c.previous[i] == null ? '' : f(c.previous[i])]) });
    }
    if (s.type === 'chart' && s.chart.kind === 'bar') sheets.push({ name: `${s.title} data`, cols: ['Category', 'Actual', 'Forecast'], rows: s.chart.rows.map((r) => [r.label, r.value, r.forecast ?? '']) });
    if (s.type === 'chart' && s.chart.kind === 'series') sheets.push({ name: `${s.title} data`, cols: [s.chart.xKey, ...s.chart.series.map((x) => x.name)], rows: s.chart.data.map((d) => [d[s.chart.xKey], ...s.chart.series.map((x) => d[x.key] ?? '')]) });
  }
  return sheets.map((sh, i) => ({ ...sh, name: (sh.name || `Sheet ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) }));
}

const toNum = (v) => { if (typeof v === 'number') return v; const s = String(v).replace(/,/g, '').trim(); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : v; };
const fileName = (doc, ext, sheet) => `${PRODUCT_SLUG}_${slug(doc.title)}${sheet ? `_${slug(sheet)}` : ''}_${doc.date}.${ext}`;
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

/* ── Paper rendering ───────────────────────────────────────────────────── */
function Editable({ as: Tag = 'span', value, onChange, className, style }) {
  return <Tag className={className} style={style} contentEditable suppressContentEditableWarning onBlur={(e) => onChange(e.currentTarget.innerText)}>{value}</Tag>;
}

function PaperSection({ s, edit }) {
  const set = (patch) => edit(s.id, patch);
  return (
    <div className="doc-sec">
      <Editable as="h2" className="doc-h2" value={`${s.title}${s.continued ? ' (continued)' : ''}`} onChange={(v) => set({ title: v.replace(/ \(continued\)$/, '') })} />
      {s.type === 'kpis' && (
        <div className="doc-kpis">
          {s.items.map((it, i) => (
            <div key={i} className="doc-kpi">
              <Editable as="div" className="v" value={it.value} onChange={(v) => set({ items: s.items.map((x, j) => (j === i ? { ...x, value: v } : x)) })} />
              <Editable as="div" className="l" value={it.label} onChange={(v) => set({ items: s.items.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
              {it.sub && <Editable as="div" className="s" value={it.sub} onChange={(v) => set({ items: s.items.map((x, j) => (j === i ? { ...x, sub: v } : x)) })} />}
            </div>
          ))}
        </div>
      )}
      {s.type === 'chart' && s.chart.kind === 'trend' && <TrendChart s={s.chart.series} showF={s.chart.series.canForecast} showC fmt={fmtNum(s.chart.dp)} label={s.chart.label || s.title} t={PAPER} width={CHART_W} height={230} />}
      {s.type === 'chart' && s.chart.kind === 'bar' && <BreakdownChart rows={s.chart.rows} showF fmt={fmtNum(s.chart.dp)} t={PAPER} width={CHART_W} />}
      {s.type === 'chart' && s.chart.kind === 'series' && <SeriesChart data={s.chart.data} xKey={s.chart.xKey} series={s.chart.series} t={PAPER} fmt={fmtNum(s.chart.dp ?? 1)} width={CHART_W} height={230} stacked={s.chart.stacked} />}
      {s.type === 'table' && (
        <table className="doc-table">
          <thead><tr>{s.cols.map((c) => <th key={c.h} className={c.num ? 'num' : ''}>{c.h}</th>)}</tr></thead>
          <tbody>
            {s.rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => (
                <Editable key={j} as="td" className={s.cols[j]?.num ? 'num' : ''} value={String(cell)} onChange={(v) => set({ editCell: { row: r, col: j, value: v } })} />
              ))}</tr>
            ))}
          </tbody>
        </table>
      )}
      {s.type === 'ai' && (
        <div className="doc-ai">
          <Editable as="p" value={s.body} onChange={(v) => set({ body: v })} />
          <ul>{(s.bullets || []).map((b, i) => <Editable key={i} as="li" value={b} onChange={(v) => set({ bullets: s.bullets.map((x, j) => (j === i ? v : x)) })} />)}</ul>
          {s.engine && <p style={{ fontWeight: 400, fontSize: 10.5, color: '#565559', margin: '6px 0 0' }}>Engine: {s.engine}. A person decides the action.</p>}
        </div>
      )}
      {s.type === 'text' && <Editable as="p" className="doc-p" value={s.body} onChange={(v) => set({ body: v })} />}
      {s.type === 'kv' && (
        <table className="doc-table"><tbody>{s.items.map(([k, v]) => <tr key={k}><td style={{ fontWeight: 700 }}>{k}</td><td>{v}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}

function Page({ doc, items, n, total, edit, editMeta, pageRef }) {
  return (
    <div className="doc-page" ref={pageRef}>
      <div className="doc-head">
        <img src="/astrikos-mark.png" alt="Astrikos" style={{ width: 50, height: 58, objectFit: 'contain' }} />
        <div style={{ textAlign: 'right' }}>
          <div className="doc-brand">ASTRIKOS</div>
          <div className="doc-brand-sub">AI Private Limited</div>
        </div>
      </div>
      <div className="doc-rule" />
      <div className="doc-main">
        {n === 1 && (
          <div className="doc-titleblock">
            <div className="doc-eyebrow">{PRODUCT}</div>
            <Editable as="div" className="doc-title" value={doc.title} onChange={(v) => editMeta({ title: v })} />
            {doc.subtitle && <Editable as="div" className="doc-subtitle" value={doc.subtitle} onChange={(v) => editMeta({ subtitle: v })} />}
            <div className="doc-meta">
              <div><span>Date</span>{fmtDate(doc.date)}</div>
              <div><span>Prepared for</span>{doc.preparedFor}</div>
              <div><span>Prepared by</span>{doc.preparedBy}</div>
              <div><span>Classification</span>{doc.classification}</div>
            </div>
            {doc.filters.length > 0 && <div className="doc-filters">{doc.filters.map((f) => <span key={f.k}><b>{f.k}:</b> {f.v}</span>)}</div>}
          </div>
        )}
        {items.map((s) => <PaperSection key={s.key} s={s} edit={edit} />)}
      </div>
      <div className="doc-foot">
        <span>{PRODUCT} · {doc.title}</span><span>www.astrikos.ai · contact@astrikos.ai</span><span>Page {n} of {total}</span>
      </div>
    </div>
  );
}

function SheetGrid({ sheet, csv }) {
  if (csv) {
    const text = [sheet.cols, ...sheet.rows].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    return <pre className="sheet-csv">{text}</pre>;
  }
  return (
    <div className="sheet-grid">
      <table>
        <thead>
          <tr><th className="sheet-corner" />{sheet.cols.map((_, i) => <th key={i}>{String.fromCharCode(65 + (i % 26))}</th>)}</tr>
          <tr className="sheet-ink"><td className="sheet-rownum">1</td>{sheet.cols.map((c) => <td key={c}>{c}</td>)}</tr>
        </thead>
        <tbody>{sheet.rows.map((r, i) => <tr key={i}><td className="sheet-rownum">{i + 2}</td>{r.map((c, j) => <td key={j} className={typeof toNum(c) === 'number' ? 'num' : ''}>{String(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/* ── Studio ────────────────────────────────────────────────────────────── */
export default function DocStudio({ spec, onClose }) {
  const toast = useToast();
  const initial = useMemo(() => ({ ...spec, sections: spec.sections.map((s) => ({ ...s, include: s.include !== false })) }), [spec]);
  const [doc, setDoc] = useState(initial);
  const [view, setView] = useState('pages');
  const [format, setFormat] = useState('PDF');
  const [sheetIdx, setSheetIdx] = useState(0);
  const [csvText, setCsvText] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  const [logged, setLogged] = useState(false);
  const [scale, setScale] = useState(0.8);
  const previewRef = useRef(null);
  const exportRefs = useRef([]);
  const [exporting, setExporting] = useState(false);

  const finalDoc = useMemo(() => {
    const secs = doc.sections.filter((s) => s.include);
    return notes.trim() ? { ...doc, sections: [...secs, { id: 'notes', type: 'text', title: 'Analyst notes', body: notes.trim(), include: true }] } : { ...doc, sections: secs };
  }, [doc, notes]);
  const [fudge, setFudge] = useState(1);
  const pages = useMemo(() => paginate(finalDoc.sections, fudge), [finalDoc, fudge]);
  // Estimates can undershoot long text; if any page body overflows, loosen the estimate and re-flow.
  useEffect(() => {
    if (view !== 'pages') return;
    const over = [...(previewRef.current?.querySelectorAll('.doc-main') || [])].some((m) => m.scrollHeight > m.clientHeight + 2);
    if (over && fudge < 1.6) setFudge((f) => Math.round((f + 0.15) * 100) / 100);
  }, [pages, view, fudge]);
  const sheets = useMemo(() => sheetsOf({ ...finalDoc, sections: finalDoc.sections }), [finalDoc]);

  useLayoutEffect(() => {
    const fit = () => { const w = previewRef.current?.clientWidth || 900; setScale(Math.min(1, (w - 48) / PAGE_W)); };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); return; }
      const box = document.querySelector('.app-studio');
      if (e.key !== 'Tab' || !box) return;
      const f = [...box.querySelectorAll('button:not(:disabled), input, select, textarea, [contenteditable]')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => { if (format === 'CSV' || format === 'Excel') setView('sheets'); else setView('pages'); }, [format]);

  const edit = (id, patch) => {
    setEdited(true);
    if (id === 'notes') { if (patch.body != null) setNotes(patch.body); return; }
    setDoc((d) => ({ ...d, sections: d.sections.map((s) => {
      if (s.id !== id) return s;
      if (patch.editCell) { const { row, col, value } = patch.editCell; return { ...s, rows: s.rows.map((r) => (r === row ? r.map((c, j) => (j === col ? value : c)) : r)) }; }
      return { ...s, ...patch };
    }) }));
  };
  const editMeta = (patch) => { setEdited(true); setDoc((d) => ({ ...d, ...patch })); };
  const move = (i, dir) => setDoc((d) => { const s = [...d.sections]; const j = i + dir; if (j < 0 || j >= s.length) return d; [s[i], s[j]] = [s[j], s[i]]; setEdited(true); return { ...d, sections: s }; });
  const toggle = (i) => setDoc((d) => ({ ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, include: !s.include } : s)) }));
  const addText = () => { setEdited(true); setDoc((d) => ({ ...d, sections: [...d.sections, { id: `text-${Date.now()}`, type: 'text', title: 'Notes', body: 'Click to write.', include: true }] })); };

  const runDownload = async () => {
    setBusy(true);
    try {
      let name;
      if (format === 'CSV') {
        const sh = sheets[sheetIdx];
        const text = [sh.cols, ...sh.rows].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
        name = fileName(finalDoc, 'csv', sh.name);
        download(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), name);
      } else if (format === 'Excel') {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();
        sheets.forEach((sh) => {
          const ws = XLSX.utils.aoa_to_sheet([sh.cols, ...sh.rows.map((r) => r.map(toNum))]);
          ws['!cols'] = sh.cols.map((c, i) => ({ wch: Math.min(48, Math.max(10, String(c).length + 2, ...sh.rows.slice(0, 50).map((r) => String(r[i] ?? '').length + 2))) }));
          XLSX.utils.book_append_sheet(wb, ws, sh.name);
        });
        wb.Props = { Title: finalDoc.title, Author: 'Astrikos', Company: 'Astrikos AI Private Limited' };
        name = fileName(finalDoc, 'xlsx');
        XLSX.writeFile(wb, name);
      } else {
        exportRefs.current = [];
        setExporting(true);
        await new Promise((r) => setTimeout(r, 120));
        if (document.fonts?.ready) await document.fonts.ready;
        const html2canvas = (await import('html2canvas')).default;
        const canvases = [];
        for (const el of exportRefs.current.filter(Boolean)) canvases.push(await html2canvas(el, { scale: 2, backgroundColor: '#F7F7FA', useCORS: true, logging: false }));
        if (format === 'PDF') {
          const { jsPDF } = await import('jspdf');
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          canvases.forEach((c, i) => { if (i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 210, 297); });
          pdf.setProperties({ title: finalDoc.title, subject: finalDoc.subtitle || PRODUCT, author: 'Astrikos' });
          name = fileName(finalDoc, 'pdf');
          pdf.save(name);
        } else {
          const names = canvases.map((_, i) => fileName(finalDoc, 'png', canvases.length > 1 ? `page-${i + 1}` : null));
          canvases.forEach((c, i) => setTimeout(() => c.toBlob((b) => download(b, names[i]), 'image/png'), i * 400));
          name = names.join(', ');
        }
        setExporting(false);
      }
      post('/audit/export', { title: finalDoc.title, format, filename: name, filters: finalDoc.filters }).catch(() => {});
      setLogged(true);
      toast('success', 'Downloaded', name);
    } catch (e) {
      setExporting(false);
      toast('danger', 'Download failed', `${e.message}. Try again, or pick another format.`);
    } finally { setBusy(false); }
  };

  const step = busy ? 3 : edited ? 2 : 1;
  return createPortal(
    <>
      <div className="app-studio-catcher" />
      <div className="app-studio" role="dialog" aria-modal="true" aria-labelledby="studio-title">
        <div className="studio-bar">
          <span className="kpi-icon tone-accent"><FileText size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="studio-title" id="studio-title">Document studio</div>
            <div className="app-drawer-sub">Branded to the Astrikos BISG letter guide · {pages.length} page{pages.length > 1 ? 's' : ''} · {sheets.length} data sheet{sheets.length > 1 ? 's' : ''}</div>
          </div>
          <div className="studio-steps">
            <span className="on"><Check size={12} /> 1 · View</span><i className="sep" />
            <span className={step >= 2 ? 'on' : ''}><Pencil size={12} /> 2 · Edit</span><i className="sep" />
            <span className={step >= 3 ? 'on' : ''}><Download size={12} /> 3 · Download</span>
          </div>
          <div className="header-spacer" />
          <button type="button" className="icon-btn sm" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="studio-body">
          <div className="studio-preview" ref={previewRef}>
            <div className="studio-toolbar">
              <Segmented label="Preview" options={[{ value: 'pages', label: 'Pages' }, { value: 'sheets', label: 'Sheets' }]} value={view} onChange={setView} />
              <span className="studio-hint"><Pencil size={12} /> {view === 'pages' ? 'Click any heading, figure, table cell or paragraph to edit it.' : 'Sheets mirror the document; edit on the pages.'}</span>
              {view === 'sheets' && format === 'CSV' && <Segmented label="CSV view" options={[{ value: 'grid', label: 'Grid' }, { value: 'text', label: 'CSV text' }]} value={csvText ? 'text' : 'grid'} onChange={(v) => setCsvText(v === 'text')} />}
            </div>
            {view === 'pages' ? (
              <div className="studio-pages">
                {pages.map((items, i) => (
                  <div key={i} className="studio-page-slot" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
                    <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                      <Page doc={finalDoc} items={items} n={i + 1} total={pages.length} edit={edit} editMeta={editMeta} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="studio-sheets">
                <SheetGrid sheet={sheets[Math.min(sheetIdx, sheets.length - 1)]} csv={csvText && format === 'CSV'} />
                <div className="sheet-tabs">
                  {sheets.map((sh, i) => <button key={sh.name + i} type="button" className={`sheet-tab ${i === sheetIdx ? 'on' : ''}`} onClick={() => setSheetIdx(i)}>{sh.name}</button>)}
                </div>
              </div>
            )}
          </div>
          <aside className="studio-side">
            <div className="kpi-well-head"><h3 className="kpi-sec-title">Document</h3>
              <button type="button" className="app-ghost-btn btn-sm" onClick={() => { setDoc(initial); setNotes(''); setEdited(false); }}><RotateCcw size={11} /> Reset edits</button></div>
            {[['title', 'Title'], ['subtitle', 'Subtitle'], ['preparedFor', 'Prepared for'], ['preparedBy', 'Prepared by'], ['classification', 'Classification'], ['date', 'Date']].map(([k, l]) => (
              <label key={k} className="app-field"><span className="app-label">{l}</span>
                <input className="app-input" type={k === 'date' ? 'date' : 'text'} value={doc[k] || ''} onChange={(e) => editMeta({ [k]: e.target.value })} /></label>
            ))}
            <h3 className="kpi-sec-title" style={{ marginTop: 6 }}>Sections</h3>
            {doc.sections.map((s, i) => {
              const Icon = TYPE_ICON[s.type] || AlignLeft;
              return (
                <div key={s.id} className="studio-sec-row" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
                  <input type="checkbox" checked={s.include} onChange={() => toggle(i)} aria-label={`Include ${s.title}`} />
                  <Icon size={13} className="faint" />
                  <button type="button" className="studio-sec-name" title={s.title}>{s.title}</button>
                  <button type="button" className="studio-sec-mini" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></button>
                  <button type="button" className="studio-sec-mini" aria-label="Move down" disabled={i === doc.sections.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
                </div>
              );
            })}
            <button type="button" className="app-control-btn btn-sm" onClick={addText}><Plus size={13} /> Add text section</button>
            <label className="app-field"><span className="app-label">Analyst notes</span>
              <textarea className="app-textarea" value={notes} onChange={(e) => { setNotes(e.target.value); setEdited(true); }} placeholder="Notes become their own section at the end." /></label>
            <h3 className="kpi-sec-title" style={{ marginTop: 6 }}>Format</h3>
            <Segmented label="Format" options={['PDF', 'Excel', 'CSV', 'PNG'].map((f) => ({ value: f, label: f }))} value={format} onChange={setFormat} />
            <p className="app-help" style={{ margin: 0 }}>{FORMAT_TEXT[format]}{format === 'CSV' ? ` Current sheet: ${sheets[sheetIdx]?.name}.` : ''}</p>
            <button type="button" className="app-primary-btn btn-lg" style={{ width: '100%' }} disabled={busy} onClick={runDownload}>
              {busy ? <><span className="app-spinner" /> Preparing {format}…</> : <><Download size={15} /> Download {format}</>}
            </button>
            {logged && <p className="app-help" style={{ margin: 0 }}><Check size={11} /> Logged to the audit trail.</p>}
          </aside>
        </div>
      </div>
      {exporting && (
        <div className="studio-export-stage" aria-hidden="true">
          {pages.map((items, i) => <Page key={i} doc={finalDoc} items={items} n={i + 1} total={pages.length} edit={() => {}} editMeta={() => {}} pageRef={(el) => { exportRefs.current[i] = el; }} />)}
        </div>
      )}
    </>,
    document.body,
  );
}
