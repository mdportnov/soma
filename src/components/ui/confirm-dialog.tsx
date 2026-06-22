import { Dialog } from "./dialog";
import { Button } from "./button";

/**
 * A small yes/no confirmation built on {@link Dialog}. Use for the handful of
 * actions that warrant a deliberate pause — hiding a safety surface, resetting
 * preferences — rather than a full custom dialog.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      onSubmit={onConfirm}
    >
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
