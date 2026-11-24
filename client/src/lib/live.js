// Live data: the shell polls /live (advisories, notifications, sync state);
// pages use usePoll for their own endpoint. The simulation ticks every 5 s.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { get } from './api';

const LiveCtx = createContext(null);
export const POLL_MS = 5000;

export function LiveProvider({ children }) {
  const [live, setLive] = useState(null);
  const [status, setStatus] = useState('connecting');
  const fails = useRef(0);
  const refresh = useCallback(async () => {
    try {
      const r = await get('/live');
      setLive(r); fails.current = 0; setStatus('live');
    } catch {
      fails.current += 1;
      setStatus(fails.current > 2 ? 'offline' : 'reconnecting');
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);
  return <LiveCtx.Provider value={{ live, status, refresh }}>{children}</LiveCtx.Provider>;
}

export const useLive = () => useContext(LiveCtx);

/** Poll an endpoint; discards stale responses; keeps the last good data on error. */
export function usePoll(path, params, interval = POLL_MS) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const gen = useRef(0);
  const key = JSON.stringify(params || {});
  const load = useCallback(async () => {
    const g = ++gen.current;
    try {
      const r = await get(path, params);
      if (g === gen.current) { setData(r); setError(null); }
    } catch (e) {
      if (g === gen.current) setError(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  useEffect(() => {
    setData(null);
    load();
    if (!interval) return undefined;
    const t = setInterval(load, interval);
    return () => clearInterval(t);
  }, [load, interval]);
  return { data, error, reload: load };
}
