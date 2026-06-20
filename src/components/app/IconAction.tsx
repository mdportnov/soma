import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Uniform square icon button for record-card actions (edit, stop, resume,
 * resolve, delete…). Label-free to keep rows compact and consistent; the label
 * shows on hover/focus via a tooltip and is the button's accessible name.
 * Outline is constant across actions — only the tint changes (e.g. destructive).
 */
export function IconAction({
  label,
  icon,
  onClick,
  destructive,
  disabled,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip content={label}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(destructive && "text-destructive hover:text-destructive", className)}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}
