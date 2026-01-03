import React, { createContext, useContext, useCallback, useState } from "react";
import "../components/Toast.css";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(({ type = "info", text = "", ttl = 4500 }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setToasts(t => [...t, { id, type, text }]);
    if (ttl > 0) {
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl);
    }
  }, []);

  const removeToast = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-wrapper" aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status">
            <div className="toast-body">{t.text}</div>
            <button className="toast-close" onClick={() => removeToast(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    showToast: ({ text }) => {
      try {
        alert(text);
      } catch (_) {}
    },
  };
}
