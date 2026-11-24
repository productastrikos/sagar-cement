// Global search in the page area (§7.5): results after 2 characters, grouped by
// type; ↑/↓ move, Enter opens, Esc or outside click closes.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { get } from '../lib/api';

export default function GlobalSearch({ placeholder = 'Search plant, connector, batch, sample barcode, advisory…' }) {
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const flat = groups.flatMap((g) => g.items.map((it) => ({ ...it, type: g.type })));
  useEffect(() => {
    if (q.trim().length < 2) { setGroups([]); return undefined; }
    let alive = true;
    const t = setTimeout(() => get('/search', { q }).then((r) => { if (alive) { setGroups(r.groups); setHi(0); setOpen(true); } }).catch(() => {}), 160);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const go = (it) => { setOpen(false); setQ(''); navigate(it.href); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { setHi((h) => Math.min(flat.length - 1, h + 1)); e.preventDefault(); }
    if (e.key === 'ArrowUp') { setHi((h) => Math.max(0, h - 1)); e.preventDefault(); }
    if (e.key === 'Enter' && flat[hi]) go(flat[hi]);
    if (e.key === 'Escape') setOpen(false);
  };
  let idx = -1;
  return (
    <div className="global-search" ref={ref}>
      <SearchIcon size={14} className="gs-icon" />
      <input className="app-input" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => groups.length && setOpen(true)} onKeyDown={onKey}
        placeholder={placeholder} aria-label="Search" role="combobox" aria-expanded={open} aria-controls="gs-results" />
      {open && q.trim().length >= 2 && (
        <div className="gs-results" id="gs-results" role="listbox">
          {flat.length === 0 && <div className="search-dropdown-empty">Nothing matches “{q}”. Try a plant name, barcode or connector ID.</div>}
          {groups.map((g) => (
            <div key={g.type}>
              <div className="adv-section-label" style={{ margin: '8px 12px 4px' }}>{g.type}</div>
              {g.items.map((it) => { idx += 1; const me = idx; return (
                <button key={it.label + it.href} type="button" role="option" aria-selected={me === hi} className={`gs-item ${me === hi ? 'is-hi' : ''}`} onMouseEnter={() => setHi(me)} onClick={() => go(it)}>
                  {it.label}<span>{it.desc}</span>
                </button>
              ); })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
