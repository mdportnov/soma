import * as React from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";

/**
 * A small yes/no confirmation built on {@link Dialog}. Use for the handful of
 * actions that warrant a deliberate pause — hiding a safety surface, resetting
 * preferences, deleting a record — rather than a full custom dialog.
 *
 * Most callers should reach for `useConfirm()` (src/components/app/Confirm.tsx)
 * instead of mounting this directly: it wraps the same dialog in a promise so a
 * handler reads top-to-bottom without a pile of open/pending state.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  details,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** Bullet lines under the description: what else the action takes with it. */
  details?: string[];
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  // Land the caret on the safe button. Dialog focuses its own first focusable
  // element (the ✕) on open; this effect belongs to the parent, so it runs
  // after that one and wins. It matters for destructive prompts in particular:
  // with Cancel focused, a reflexive Enter aborts instead of deleting.
  React.useEffect(() => {
    if (!open || !destructive) return;
    cancelRef.current?.focus();
  }, [open, destructive]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      // Destructive prompts get no ⌘/Ctrl+Enter shortcut on purpose: the only
      // way to delete is to aim at the button that says so.
      onSubmit={destructive ? undefined : onConfirm}
    >
      {details && details.length > 0 && (
        <ul className="mb-4 list-disc space-y-1 pl-5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex justify-end gap-2">
        <Button ref={cancelRef} variant="outline" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          onClick={onConfirm}
          autoFocus={!destructive}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
