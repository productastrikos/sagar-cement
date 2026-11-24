// KPI drawer provider (§8.21): one drawer at a time, route change closes it,
// focus returns to the card that opened it.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import KpiDrawer from '../components/KpiDrawer';

const KpiCtx = createContext({ open: null, openKpi: () => {}, closeKpi: () => {}, syncKpi: () => {} });
export const useKpi = () => useContext(KpiCtx);

export function KpiDrawerProvider({ children }) {
  const [open, setOpen] = useState(null);
  const trigger = useRef(null);
  const loc = useLocation();
  useEffect(() => setOpen(null), [loc.pathname]);
  const openKpi = useCallback((k) => { trigger.current = document.activeElement; setOpen(k); }, []);
  const closeKpi = useCallback(() => {
    setOpen(null);
    setTimeout(() => trigger.current?.focus?.(), 0);
  }, []);
  // An open card pushes its live value into the drawer, so hero == card while both stay live.
  const syncKpi = useCallback((c) => setOpen((o) => (o && o.id === c.id && JSON.stringify(o.filters || {}) === JSON.stringify(c.filters || {}) && o.value !== c.value ? { ...o, ...c } : o)), []);
  const value = useMemo(() => ({ open, openKpi, closeKpi, syncKpi }), [open, openKpi, closeKpi, syncKpi]);
  return (
    <KpiCtx.Provider value={value}>
      {children}
      {open && <KpiDrawer key={open.id + JSON.stringify(open.filters || {})} k={open} onClose={closeKpi} />}
    </KpiCtx.Provider>
  );
}
