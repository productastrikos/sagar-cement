// Theme switching exactly as specified in §5.7, plus a tiny subscription so
// charts can re-read tokens when the theme changes (§5.9).
import { useEffect, useState } from 'react';

const KEY = 'astrikos-theme';
const listeners = new Set();

export function applyTheme(mode /* 'dark' | 'light' */) {
  document.body.setAttribute('data-theme', mode);
  try { localStorage.setItem(KEY, mode); } catch {}
  listeners.forEach((fn) => fn(mode));
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.body.getAttribute('data-theme') || 'dark');
  useEffect(() => {
    listeners.add(setTheme);
    return () => listeners.delete(setTheme);
  }, []);
  return theme;
}
