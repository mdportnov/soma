import * as React from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n";
import { buildDeleteConfirm, type DeleteConfirmSpec } from "@/lib/delete-confirm";

export type ConfirmRequest = {
  title: string;
  description?: string;
  /** Bullet lines under the description: what else the action takes with it. */
  details?: string[];
  /** A verb, not "OK" — the button must say what pressing it does. */
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmContextValue = {
  /** Resolves true when the user confirms, false on cancel/Escape/backdrop. */
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  /**
   * Deletion shorthand: builds the wording from `confirm.*` keys (entity name,
   * cascade, reversibility) and asks. Prefer it over hand-written copy so every
   * delete prompt in the app names its target the same way.
   */
  confirmDelete: (spec: DeleteConfirmSpec) => Promise<boolean>;
};

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

type Pending = { resolve: (ok: boolean) => void };

/**
 * Hosts the single app-wide confirmation dialog and hands out a promise-based
 * `confirm()`. The promise API is the point: a delete handler stays one linear
 * function (`if (!(await confirm(...))) return;`) instead of splitting into an
 * "open the dialog" callback plus a "now actually do it" callback with the row
 * parked in component state.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = React.useState(false);
  // Kept after close so the wording stays put through the exit animation.
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);
  const pending = React.useRef<Pending | null>(null);

  const settle = React.useCallback((ok: boolean) => {
    const current = pending.current;
    pending.current = null;
    setOpen(false);
    current?.resolve(ok);
  }, []);

  // A provider unmount (app teardown) must not leave callers awaiting forever.
  React.useEffect(() => {
    const current = pending;
    return () => {
      current.current?.resolve(false);
      current.current = null;
    };
  }, []);

  const confirm = React.useCallback((next: ConfirmRequest) => {
    // Modal by construction, so a second request while one is open should not
    // happen; if it does, the older one is answered "no" rather than dropped.
    pending.current?.resolve(false);
    setRequest(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      pending.current = { resolve };
    });
  }, []);

  const value = React.useMemo<ConfirmContextValue>(
    () => ({
      confirm,
      confirmDelete: (spec) => confirm(buildDeleteConfirm(t, lang, spec)),
    }),
    [confirm, t, lang],
  );

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={open}
        title={request?.title ?? ""}
        description={request?.description}
        details={request?.details}
        confirmLabel={request?.confirmLabel ?? t("common.delete")}
        cancelLabel={request?.cancelLabel ?? t("common.cancel")}
        destructive={request?.destructive}
        onConfirm={() => settle(true)}
        onClose={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}
