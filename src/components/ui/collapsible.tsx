import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Collapsible({
  title,
  description,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  icon,
  children,
  className,
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const contentId = React.useId();

  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-start gap-3 p-5 text-left"
      >
        {icon && <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none tracking-tight">{title}</p>
          {description && (
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        id={contentId}
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={cn("transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
