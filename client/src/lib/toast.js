// Toasts (§7.19): aria-live polite; success/info 5 s, warning 8 s, danger manual.
import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, XOctagon, X } from 'lucide-react';

const ToastCtx = createContext(() => {});
const ICON = { success: CheckCircle2, info: Info, warning: AlertTriangle, danger: XOctagon };
const TTL = { success: 5000, info: 5000, warning: 8000, danger: 0 };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((tone, title, body) => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs.slice(-3), { id, tone, title, body }]);
    if (TTL[tone]) setTimeout(() => dismiss(id), TTL[tone]);
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => {
          const Icon = ICON[t.tone] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.tone}`} role="status">
              <Icon size={16} className={`tone-${t.tone}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="toast-title">{t.title}</div>
                {t.body && <div className="toast-body">{t.body}</div>}
              </div>
              <button type="button" className="icon-btn sm" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={12} /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
