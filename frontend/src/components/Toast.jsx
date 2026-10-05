import { Component, createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => {
    setToasts((items) => items.filter((t) => t.id !== id));
  }, []);
  const push = useCallback((message, kind) => {
    const id = nextId++;
    setToasts((items) => [...items, { id, message, kind: kind || "info" }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((t) => t.id !== id));
    }, 4000);
  }, []);
  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`alert ${t.kind === "error" ? "alert-error" : "alert-success"}`}>
            <span>{t.message}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(t.id)}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { push: () => {}, dismiss: () => {} };
  return ctx;
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    return;
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="page">
          <div className="empty-state">
            <h3>Something went wrong</h3>
            <p className="muted">Reload the page to continue.</p>
            <div className="btn-row" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
