// App shell (§7.1–§7.3, §7.16): header in fixed order, sidebar with the 3px
// active rule, notifications, profile menu, mobile nav, demo director.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell, Bolt, Cable, Clapperboard, Cpu, Dna, FlaskConical, Gauge, GitBranch, LayoutDashboard, LineChart, LogOut, Menu, Moon, Network,
  Radar, RefreshCw, Sparkles, Sun, UserRound, Wand2, X, Zap,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/live';
import { applyTheme, useTheme } from '../lib/theme';
import { post } from '../lib/api';
import { fmtAgo, PLANT_NAME } from '../lib/format';
import { AdvisoryPopover } from './Advisory';
import DirectorDrawer from './Director';
import { PLANT_EVENT } from './ui';
import { useCopilot } from '@astrikos/sia-copilot';

export const NAV = [
  { section: 'Command centre', items: [
    { to: '/', label: 'Fleet overview', icon: LayoutDashboard, end: true },
    { to: '/advisory', label: 'AI advisory', icon: Sparkles, count: 'advisory' },
  ] },
  { section: 'Data foundation', items: [
    { to: '/connectivity', label: 'Connectivity & data health', icon: Cable, count: 'dlq' },
    { to: '/lab', label: 'Lab integration', icon: FlaskConical },
    { to: '/field', label: 'Field & vision', icon: Radar },
    { to: '/genealogy', label: 'Material genealogy', icon: GitBranch },
  ] },
  { section: 'Quality intelligence', items: [
    { to: '/quality', label: 'Quality workbench', icon: Dna },
    { to: '/prediction', label: 'Predict & optimise', icon: Wand2 },
  ] },
  { section: 'Energy & power', items: [
    { to: '/energy', label: 'Energy scorecard', icon: Zap },
    { to: '/power', label: 'Power automation', icon: Bolt },
    { to: '/dispatch', label: 'ToD & dispatch', icon: LineChart },
    { to: '/efficiency', label: 'Process efficiency', icon: Gauge },
  ] },
  { section: 'Platform', items: [
    { to: '/platform', label: 'Platform & architecture', icon: Network },
  ] },
];

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return [open, setOpen, ref];
}

function Notifications() {
  const { live, refresh } = useLive();
  const navigate = useNavigate();
  const [open, setOpen, ref] = usePopover();
  const unread = live?.unread || 0;
  const markAll = async () => { await post('/notifications/read', {}); refresh(); };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="icon-btn" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell size={16} />{unread > 0 && <span className="notif-dot">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="profile-menu notif-menu">
          <div className="profile-menu-header">
            <div><div className="name">Notifications</div><div className="notif-sub">{unread} unread</div></div>
            <button type="button" className="app-ghost-btn btn-sm" onClick={markAll} disabled={!unread}>Mark all read</button>
          </div>
          <div className="notif-feed">
            {(live?.notifications || []).length === 0 && <div className="search-dropdown-empty">No notifications yet. Alerts from the plants land here.</div>}
            {(live?.notifications || []).map((n) => (
              <button key={n.id} type="button" className={`profile-menu-item ${n.read ? '' : 'is-unread'}`} style={{ alignItems: 'flex-start' }}
                onClick={async () => { await post('/notifications/read', { id: n.id }); refresh(); setOpen(false); navigate(`${n.route || '/'}${n.plant ? `?plant=${n.plant}` : ''}`); }}>
                <span className="feed-dot" data-kind={n.kind} />
                <span style={{ minWidth: 0 }}><span className="feed-text"><b>{n.title}</b> — {n.body}</span><span className="feed-time" style={{ display: 'block' }}>{fmtAgo(n.at)}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Profile({ onDirector }) {
  const { user, logout } = useAuth();
  const copilot = useCopilot();
  const [open, setOpen, ref] = usePopover();
  const initials = (user?.fullName || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="profile-trigger" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{initials}</button>
      {open && (
        <div className="profile-menu">
          <div className="profile-menu-header">
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="avatar">{initials}</span>
              <div><div className="name">{user?.fullName}</div><div className="faint small">{user?.roleLabel}</div><div className="status"><span className="status-dot" /> Signed in</div></div>
            </div>
          </div>
          <div className="profile-menu-section">
            <button type="button" className="profile-menu-item" onClick={() => setOpen(false)}><UserRound /> My account &amp; password</button>
            <button type="button" className="profile-menu-item" onClick={() => { setOpen(false); copilot?.play?.('full'); }}><Sparkles /> Guided demo by S!a</button>
            <button type="button" className="profile-menu-item" onClick={() => { setOpen(false); onDirector(); }}><Clapperboard /> Demo director</button>
          </div>
          <div className="profile-menu-section">
            <button type="button" className="profile-menu-item danger" onClick={logout}><LogOut /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }) {
  const theme = useTheme();
  const { live, status, refresh } = useLive();
  const loc = useLocation();
  const [sp, setSp] = useSearchParams();
  const [navOpen, setNavOpen] = useState(false);
  const [advOpen, setAdvOpen, advRef] = usePopover();
  const [director, setDirector] = useState(() => sp.get('director') === '1');
  const mainRef = useRef(null);
  useEffect(() => { setNavOpen(false); mainRef.current?.scrollTo(0, 0); }, [loc.pathname]);
  const closeDirector = () => { setDirector(false); if (sp.get('director')) { const n = new URLSearchParams(sp); n.delete('director'); setSp(n, { replace: true }); } };
  const counts = {
    advisory: live?.advisory?.counts?.open || 0,
    urgentAdvisory: (live?.advisory?.counts?.critical || 0) > 0,
    dlq: (live?.advisory?.ops || []).find((o) => o.text.includes('dead-letter')) ? Number((live.advisory.ops.find((o) => o.text.includes('dead-letter')).text.match(/\d+/) || [0])[0]) : 0,
  };
  const [pagePlant, setPagePlant] = useState(null);
  // Layout effect runs before the new page's passive effects report their plant.
  useLayoutEffect(() => setPagePlant(null), [loc.pathname]);
  useEffect(() => {
    const on = (e) => setPagePlant(e.detail || '');
    window.addEventListener(PLANT_EVENT, on);
    return () => window.removeEventListener(PLANT_EVENT, on);
  }, []);
  const plant = sp.get('plant');
  const crumbPlant = pagePlant ?? plant;
  const crit = (live?.advisory?.counts?.critical || 0) + (live?.advisory?.counts?.high || 0);

  return (
    <div className="app-shell">
      <header className="app-header">
        <button type="button" className="icon-btn only-mobile" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu size={16} /></button>
        <NavLink to="/" className="brand-link" aria-label="S!aP ClinkerIQ — fleet overview">
          <span className="astk-lockup">
            <img src="/astrikos-mark.png" alt="" className="lockup-mark" />
            <span className="astk-lockup-rule" />
            <span className="astk-lockup-text">
              <span className="astk-lockup-name">ASTRIKOS</span>
              <span className="astk-lockup-product">S!aP ClinkerIQ</span>
              <span className="astk-lockup-descriptor">Sagar Cements · lab-to-plant intelligence</span>
            </span>
          </span>
        </NavLink>
        <div className="geo-crumb hide-mobile">India <span>›</span> Sagar Cements Ltd <span>›</span> <strong>{crumbPlant ? PLANT_NAME[crumbPlant] : 'All six plants'}</strong></div>
        <div className="header-spacer" />
        <div ref={advRef} style={{ position: 'relative' }}>
          <button type="button" className={`app-advisory-btn ${advOpen ? 'is-on' : ''}`} aria-expanded={advOpen} onClick={() => setAdvOpen((v) => !v)}>
            <Sparkles size={15} /><span>AI Advisory</span>{crit > 0 && <span className="ai-top-count">{crit}</span>}
          </button>
          {advOpen && <AdvisoryPopover onClose={() => setAdvOpen(false)} />}
        </div>
        <button type="button" className={`sync-pill ${status === 'live' ? '' : 'is-bad'}`} onClick={refresh} title="Refresh now">
          {status === 'live' ? <><span className="status-dot is-live" /> Live</> : status === 'offline' ? <><RefreshCw size={12} /> Offline</> : <><RefreshCw size={12} className="spin" /> Reconnecting…</>}
        </button>
        <Notifications />
        <button type="button" className="icon-btn" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <Profile onDirector={() => setDirector(true)} />
      </header>
      <div className="app-body">
        {navOpen && <div className="drawer-backdrop" onClick={() => setNavOpen(false)} />}
        <nav className={`app-sidebar ${navOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          {navOpen && <button type="button" className="icon-btn sm drawer-close only-mobile" aria-label="Close navigation" onClick={() => setNavOpen(false)}><X size={14} /></button>}
          {NAV.map((g) => (
            <div key={g.section}>
              <div className="nav-section-label">{g.section}</div>
              <div className="nav-list">
                {g.items.map((it) => {
                  const n = it.count ? counts[it.count] : 0;
                  return (
                    <NavLink key={it.to} to={{ pathname: it.to, search: plant ? `?plant=${plant}` : '' }} end={it.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                      <it.icon size={16} strokeWidth={1.75} /><span>{it.label}</span>
                      {n > 0 && <span className={`nav-count ${it.count === 'advisory' && counts.urgentAdvisory ? 'is-urgent' : ''}`}>{n}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="powered-by">
            <span>Powered by</span>
            <img src="/astrikos-logo.png" alt="Astrikos" />
            <span style={{ letterSpacing: '.04em', textTransform: 'none' }}>S!aP · <Cpu size={9} style={{ verticalAlign: '-1px' }} /> demo data</span>
          </div>
        </nav>
        <main className="app-main" ref={mainRef}>{children}</main>
      </div>
      {director && <DirectorDrawer onClose={closeDirector} />}
    </div>
  );
}
