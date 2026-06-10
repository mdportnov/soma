import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
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
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  onSubmit,
  submitDisabled,
}: DialogProps) {
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
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

  React.useEffect(() => {
    if (!open || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit && !submitDisabled) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closing, onClose, onSubmit, submitDisabled]);

  if (!rendered) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm",
          closing ? "animate-overlay-out" : "animate-overlay-in",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onAnimationEnd={handleAnimationEnd}
        className={cn(
          "relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border bg-card p-5 shadow-xl",
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
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
