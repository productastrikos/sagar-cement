// Auth / login archetype (§17): identity left, quiet form right, theme toggle top-right.
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Moon, Sun, User } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { applyTheme, useTheme } from '../lib/theme';

const DEMO = [['admin', 'Group digital lead'], ['quality', 'Quality manager (lab)'], ['process', 'CCR process engineer'], ['energy', 'Energy & power automation']];

export default function Login() {
  const { login } = useAuth();
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userRef = useRef(null);
  const passRef = useRef(null);
  useEffect(() => userRef.current?.focus(), []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(username.trim(), password); } catch (err) { setError(err.message); setPassword(''); passRef.current?.focus(); setBusy(false); }
  };
  const fill = (u) => { setUsername(u); setPassword('Astrikos2026'); passRef.current?.focus(); };

  return (
    <div className="login-page">
      <button type="button" className="icon-btn login-theme" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <aside className="login-left astk-aurora" aria-label="S!aP ClinkerIQ for Sagar Cements">
        <div className="login-brand">
          <img src="/astrikos-mark.png" alt="Astrikos" />
          <div>
            <div className="login-client">Sagar Cements Ltd · proof of concept</div>
            <h1 className="login-title">S!aP ClinkerIQ</h1>
          </div>
        </div>
        <p className="login-lead">Lab-to-plant quality and energy intelligence</p>
        <p className="login-desc">
          One view of six plants: every lab instrument, DCS tag, meter and camera connected read-only, data receipt that survives outages,
          clinker-to-cement correlation that respects residence time, and power costs optimised against four state tariffs.
        </p>
        <div className="wo-steps" aria-label="How it works">
          <span className="done">Connect</span><span className="done">Stabilise</span><span className="done">Correlate</span><span className="now">Predict</span><span>Optimise</span>
        </div>
        <ul className="login-pillars">
          <li><b>6 plants</b>Mattampally, Dachepalli, Gudipadu, Jeerabad, Bayyavaram, Jajpur · 11.75 MTPA</li>
          <li><b>7 lab instrument classes</b>XRF, XRD, particle size, cross-belt, calorimeter, microscope, CTM</li>
          <li><b>4 state tariffs</b>TGERC, APERC, MPERC and OERC FY 2026–27 ToD rules</li>
          <li><b>Runs above what you have</b>DCS, QCX/RoboLab and SAP stay as they are — read-only at the OT boundary</li>
        </ul>
      </aside>
      <main className="login-right">
        <form className="login-panel" onSubmit={submit} noValidate>
          <div className="astk-eyebrow">S!aP ClinkerIQ</div>
          <h2 className="astk-h3" style={{ margin: 0 }}>Sign in</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Use one of the demo accounts below.</p>
          <label className="app-field" htmlFor="ciq-user">
            <span className="app-label">Username</span>
            <span className="row" style={{ position: 'relative' }}>
              <User size={15} className="faint" style={{ position: 'absolute', left: 10 }} />
              <input id="ciq-user" ref={userRef} className="app-input" style={{ paddingLeft: 32, height: 40 }} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="admin" />
            </span>
          </label>
          <label className="app-field" htmlFor="ciq-pass">
            <span className="app-label">Password</span>
            <span className="row" style={{ position: 'relative' }}>
              <Lock size={15} className="faint" style={{ position: 'absolute', left: 10 }} />
              <input id="ciq-pass" ref={passRef} className="app-input" style={{ paddingLeft: 32, paddingRight: 40, height: 40 }} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
              <button type="button" className="icon-btn sm" style={{ position: 'absolute', right: 6 }} onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            </span>
          </label>
          {error && <div className="callout callout-danger" role="alert" style={{ margin: 0 }}><AlertCircle size={15} className="callout-icon" /><div className="callout-body">{error}</div></div>}
          <button type="submit" className="app-primary-btn" style={{ height: 42 }} disabled={busy || !username || !password}>
            {busy ? <Loader2 size={16} className="spin" /> : null}{busy ? 'Signing in…' : 'Sign in'}{!busy && <ArrowRight size={16} />}
          </button>
          <div className="demo-cred">
            <div>
              Demo password <b>Astrikos2026</b>. Fill in as:{' '}
              {DEMO.map(([u, r], i) => <span key={u}>{i ? ' · ' : ''}<button type="button" className="cred-btn" onClick={() => fill(u)} title={r}>{u}</button></span>)}
            </div>
          </div>
        </form>
        <div className="powered-by inline"><span>Powered by</span><img src="/astrikos-logo.png" alt="Astrikos" /></div>
      </main>
    </div>
  );
}
