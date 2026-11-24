// Floating S!a launcher, bottom-right: orb · "S!a" · live mic hint. Click (or say "Hey S!a") to open.
import React from 'react';
import { useCopilot } from '@astrikos/sia-copilot';

export default function SiaDock() {
  const c = useCopilot();
  if (!c?.enabled || c.open) return null;
  const st = c.mic?.state;
  const listening = c.mic?.supported && c.mic?.pref !== false && (st === 'listening' || st === 'hearing');
  const hint = listening ? 'Say “Hey S!a”' : c.mic?.supported && st !== 'denied' ? 'Tap to talk' : 'Ctrl+Shift+A';
  return (
    <button type="button" className={`sia-dock ${st === 'hearing' ? 'is-hearing' : ''} ${c.running ? 'is-running' : ''}`} onClick={c.toggleCopilot}
      aria-label={`Open S!a Copilot. ${hint}`} title="S!a Copilot · Ctrl+Shift+A">
      <span className="sia-dock-orb" aria-hidden="true" />
      <span className="sia-dock-text">
        <span className="sia-dock-name">S!a</span>
        <span className="sia-dock-hint"><i className={`sia-dock-dot ${listening ? 'is-on' : ''}`} />{hint}</span>
      </span>
    </button>
  );
}
