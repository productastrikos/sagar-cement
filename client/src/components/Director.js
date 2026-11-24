// Demo director (400px right drawer, §8.22 shell): fire scenarios and live
// moments during the Sagar demo, watch their level, reset everything.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard, Play, RotateCcw, Square, Unplug, FileWarning, Zap, ShieldOff, X } from 'lucide-react';
import { post } from '../lib/api';
import { usePoll, useLive } from '../lib/live';
import { useToast } from '../lib/toast';
import { PLANT_OPTIONS, INTEGRATED } from '../lib/format';
import { SEV_TONE, StatusChip } from './ui';

export default function DirectorDrawer({ onClose }) {
  const { data, reload } = usePoll('/scenarios', null, 3000);
  const { refresh } = useLive();
  const toast = useToast();
  const [plantFor, setPlantFor] = useState({});
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (fn, msg) => {
    try { await fn(); toast('info', msg); reload(); refresh(); } catch (e) { toast('danger', 'Action failed', e.message); }
  };

  const quick = [
    { icon: Unplug, label: 'Cut Mattampally WAN for 60 s', run: () => post('/connectivity/simulate', { action: 'wan', plant: 'MTP' }), msg: 'WAN outage started — watch Connectivity' },
    { icon: FileWarning, label: 'Inject a malformed XRF row', run: () => post('/connectivity/simulate', { action: 'malformed', plant: 'MTP' }), msg: 'Malformed row sent to the dead-letter queue' },
    { icon: ShieldOff, label: 'DCOM patch failure at Gudipadu', run: () => post('/connectivity/simulate', { action: 'dcom', plant: 'GDP' }), msg: 'S7 started at Gudipadu' },
    { icon: Zap, label: 'Peak-hour mill ramp at Dachepalli', run: () => post('/power/ramp', { plant: 'DCP' }), msg: 'MD ramp started — watch Power automation' },
  ];

  return createPortal(
    <>
      <div className="app-drawer-catcher" onClick={onClose} />
      <aside className="app-drawer" role="dialog" aria-modal="true" aria-labelledby="director-title" tabIndex={-1} ref={ref}>
        <header className="app-drawer-head">
          <span className="kpi-icon tone-accent"><Clapperboard size={16} /></span>
          <div className="app-drawer-titles">
            <h2 className="app-drawer-title" id="director-title">Demo director</h2>
            <div className="app-drawer-sub">Scenarios ramp in over about 40 s · presenter tool</div>
          </div>
          <button type="button" className="icon-btn sm" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="app-drawer-body">
          <div>
            <h3 className="kpi-sec-title" style={{ marginBottom: 8 }}>Live moments</h3>
            <div className="stack" style={{ gap: 6 }}>
              {quick.map((q) => (
                <button key={q.label} type="button" className="app-control-btn btn-md" style={{ justifyContent: 'flex-start' }} onClick={() => act(q.run, q.msg)}>
                  <q.icon size={14} /> {q.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="kpi-sec-title" style={{ marginBottom: 8 }}>Scenario library</h3>
            {!data ? <span className="app-spinner" /> : (
              <ul className="list-plain">
                {data.library.map((s) => {
                  const opts = PLANT_OPTIONS.filter(([id]) => (s.plantType === 'integrated' ? INTEGRATED.includes(id) : s.plantType === 'grinding' ? !INTEGRATED.includes(id) : true));
                  const pick = plantFor[s.key] || s.plant;
                  return (
                    <li key={s.key} style={{ padding: '10px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="mono faint">{s.key}</span>
                        <span style={{ fontWeight: 700, fontSize: 12.5, flex: 1 }}>{s.short}</span>
                        <StatusChip tone={SEV_TONE[s.severity]}>{s.severity}</StatusChip>
                      </div>
                      <div className="faint small" style={{ margin: '4px 0 6px' }}>{s.cause}</div>
                      <div className="btn-row">
                        <select className="app-select select-sm" value={pick} onChange={(e) => setPlantFor((p) => ({ ...p, [s.key]: e.target.value }))} aria-label={`Plant for ${s.short}`}>
                          {opts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                        <button type="button" className="app-control-btn btn-sm" onClick={() => act(() => post(`/scenarios/${s.key}/start`, { plant: pick }), `${s.key} started`)}><Play size={12} /> Start</button>
                        {s.active.map((a) => (
                          <button key={a.plant} type="button" className="app-ghost-btn btn-sm" onClick={() => act(() => post(`/scenarios/${s.key}/stop`, { plant: a.plant }), `${s.key} stopped at ${a.plant}`)}>
                            <Square size={11} /> {a.plant} · {a.level}% · {a.applied}/{a.of} applied
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <footer className="app-drawer-foot">
          <button type="button" className="app-ghost-btn btn-md" onClick={() => act(() => post('/director/reset'), 'Demo reset — all scenarios cleared')}><RotateCcw size={13} /> Reset demo</button>
        </footer>
      </aside>
    </>,
    document.body,
  );
}
