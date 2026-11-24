// Document Studio provider: one openStudio(spec) service used by every Download (§18).
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import DocStudio from '../components/DocStudio';
import { useAuth } from './auth';
import { today } from './format';

const StudioCtx = createContext({ open: () => {}, isOpen: false });
export const useStudio = () => useContext(StudioCtx);

export function StudioProvider({ children }) {
  const { user } = useAuth();
  const [spec, setSpec] = useState(null);
  const trigger = useRef(null);
  const open = useCallback((s) => {
    trigger.current = document.activeElement;
    setSpec({
      preparedFor: 'Sagar Cements Ltd', preparedBy: user ? `${user.fullName} · ${user.roleLabel}` : 'Astrikos', classification: 'Internal · demo data',
      date: today(), filters: [], ...s,
    });
  }, [user]);
  const close = useCallback(() => { setSpec(null); setTimeout(() => trigger.current?.focus?.(), 0); }, []);
  const value = useMemo(() => ({ open, isOpen: !!spec }), [open, spec]);
  return (
    <StudioCtx.Provider value={value}>
      {children}
      {spec && <DocStudio spec={spec} onClose={close} />}
    </StudioCtx.Provider>
  );
}
