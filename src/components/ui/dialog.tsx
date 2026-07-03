import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "./button";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  /**
   * When true, a user-initiated close (backdrop click, Escape, the ✕) after any
   * field has been edited asks for confirmation first, so a stray click can't
   * silently discard a half-filled form. Programmatic close (open → false after
   * a successful save) is never guarded.
   */
  guardUnsaved?: boolean;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  onSubmit,
  submitDisabled,
  guardUnsaved,
}: DialogProps) {
  const { t } = useI18n();
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const dirtyRef = React.useRef(false);
  // Element focused before the dialog opened, restored on close.
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      dirtyRef.current = false;
      setConfirmDiscard(false);
    } else if (rendered) {
      setClosing(true);
    }
    // `rendered` is intentionally excluded: it is write-only here and including
    // it would cause a second exit-cycle after unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAnimationEnd = () => {
    if (closing) {
      setRendered(false);
      setClosing(false);
    }
  };

  // A user close attempt: confirm first if edits would be lost.
  const requestClose = React.useCallback(() => {
    if (guardUnsaved && dirtyRef.current) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [guardUnsaved, onClose]);

  React.useEffect(() => {
    if (!open || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmDiscard) setConfirmDiscard(false);
        else requestClose();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit && !submitDisabled) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closing, confirmDiscard, requestClose, onSubmit, submitDisabled]);

  // Focus management: remember the trigger, move focus into the dialog on open,
  // and restore it on close so keyboard users aren't dropped at the page top.
  React.useEffect(() => {
    if (!rendered || closing) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [rendered, closing]);

  // Trap Tab within the dialog.
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!rendered) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm",
          closing ? "animate-overlay-out" : "animate-overlay-in",
        )}
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onAnimationEnd={handleAnimationEnd}
        onKeyDown={onPanelKeyDown}
        // Track edits so the unsaved-changes guard knows when to intervene.
        // onInput covers text/textarea; onChange covers selects/checkboxes.
        onInput={() => {
          dirtyRef.current = true;
        }}
        onChange={() => {
          dirtyRef.current = true;
        }}
        className={cn(
          "relative z-10 max-h-[85vh] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-xl border bg-card p-5 shadow-xl",
          closing ? "animate-dialog-out" : "animate-dialog-in",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={requestClose}
            aria-label={t("common.close")}
          >
            <X />
          </Button>
        </div>
        {children}

        {confirmDiscard && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-card/90 p-6 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-lg border bg-card p-5 text-center shadow-lg">
              <p className="text-sm font-semibold">{t("dialog.discardTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("dialog.discardBody")}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>
                  {t("dialog.keepEditing")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setConfirmDiscard(false);
                    onClose();
                  }}
                >
                  {t("dialog.discard")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
