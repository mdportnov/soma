import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { UNDO_TOAST_DURATION } from "@/lib/undo-scope";

type Toast = {
  id: number;
  message: string;
  /** Second line under the message: what the action will NOT do. */
  caveat?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
  variant?: "default" | "error" | "warning";
  /** Playing its exit; removed from the list when the animation ends. */
  closing?: boolean;
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
  /**
   * Undo toast after a delete. Lives longer than a plain action toast and pauses
   * while hovered — it is the only way back for a record once it is gone. A
   * `caveat` names what Undo will not restore (the erased source file, the
   * cascaded log) and switches the toast to warning styling, so a partial Undo
   * never looks like a full one.
   */
  showUndo: (
    message: string,
    onUndo: () => void,
    opts?: { caveat?: string; duration?: number },
  ) => void;
  /** Failure notification: destructive styling, assertive, longer-lived. */
  error: (message: string, opts?: { duration?: number }) => void;
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
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const durations = React.useRef(new Map<number, number>());

  const remove = React.useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  // Dismissal is two-step: the toast plays its exit first and is dropped from
  // the list when that ends, so a notice sinks back into the corner instead
  // of blinking out. The timer is a backstop for the case where no
  // animationend ever arrives (the element was hidden, the tab throttled).
  const dismiss = React.useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
      durations.current.delete(id);
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, closing: true } : t)));
      timers.current.set(
        id,
        setTimeout(() => remove(id), 400),
      );
    },
    [remove],
  );

  const arm = React.useCallback(
    (id: number) => {
      const duration = durations.current.get(id);
      if (!duration) return;
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  // Hovering or tabbing into a toast holds it open: a user reading an Undo
  // caveat must not lose the button mid-sentence. Leaving restarts the full
  // countdown rather than resuming a remainder — simpler, and errs long.
  const hold = React.useCallback((id: number) => {
    // A toast already on its way out keeps its removal backstop.
    if (!durations.current.has(id)) return;
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { ...toast, id }]);
      if (toast.duration > 0) {
        durations.current.set(id, toast.duration);
        arm(id);
      }
    },
    [arm],
  );

  const { t } = useI18n();

  // Clear any pending auto-dismiss timers if the provider ever unmounts.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      show: (message, opts) => push({ message, duration: opts?.duration ?? 4000 }),
      showAction: (message, actionLabel, onAction, opts) =>
        push({ message, actionLabel, onAction, duration: opts?.duration ?? 6000 }),
      showUndo: (message, onUndo, opts) =>
        push({
          message,
          caveat: opts?.caveat,
          actionLabel: t("common.undo"),
          onAction: onUndo,
          duration: opts?.duration ?? UNDO_TOAST_DURATION,
          variant: opts?.caveat ? "warning" : "default",
        }),
      error: (message, opts) =>
        push({ message, duration: opts?.duration ?? 7000, variant: "error" }),
    }),
    [push, t],
  );

  // Safety net for fire-and-forget mutations: most write handlers are
  // `await mutate(); void reload();` with no try/catch, so a rejected write
  // (DB locked, disk full, a guard throwing) would otherwise leave the UI
  // stale with no signal. Caught errors never reach here; genuinely unhandled
  // ones surface a generic error toast (details still go to the log file).
  // User-initiated aborts (AI request cancel/timeout) are intentionally quiet.
  React.useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { name?: string } | undefined;
      if (reason?.name === "AbortError") return;
      value.error(t("errors.actionFailed"));
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, [value, t]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.variant === "error" ? "alert" : "status"}
              aria-live={t.variant === "error" ? "assertive" : "polite"}
              onMouseEnter={() => hold(t.id)}
              onMouseLeave={() => arm(t.id)}
              onAnimationEnd={() => {
                if (t.closing) remove(t.id);
              }}
              onFocus={() => hold(t.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) arm(t.id);
              }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl",
                t.variant === "error"
                  ? "border-destructive/40 bg-destructive/10 text-foreground"
                  : t.variant === "warning"
                    ? "border-warning/40 bg-popover text-popover-foreground"
                    : "border-border bg-popover text-popover-foreground",
                t.closing ? "animate-toast-out" : "animate-toast-in",
              )}
            >
              {t.variant === "warning" && (
                <AlertTriangle className="size-4 shrink-0 text-warning-strong" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block">{t.message}</span>
                {t.caveat && (
                  <span className="mt-0.5 block text-xs leading-snug text-warning-strong">
                    {t.caveat}
                  </span>
                )}
              </span>
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
