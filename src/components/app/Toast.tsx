import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
};

type ToastContextValue = {
  /** Plain notification. */
  show: (message: string, opts?: { duration?: number }) => void;
  /** Notification with a single action (e.g. Undo). */
  showAction: (
    message: string,
    actionLabel: string,
    onAction: () => void,
    opts?: { duration?: number },
  ) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { ...toast, id }]);
      if (toast.duration > 0) {
        setTimeout(() => dismiss(id), toast.duration);
      }
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      show: (message, opts) => push({ message, duration: opts?.duration ?? 4000 }),
      showAction: (message, actionLabel, onAction, opts) =>
        push({ message, actionLabel, onAction, duration: opts?.duration ?? 6000 }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-xl animate-combobox-in"
            >
              <span className="min-w-0 flex-1">{t.message}</span>
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  className="shrink-0 font-medium text-primary hover:underline"
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => dismiss(t.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
