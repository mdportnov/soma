import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Styled native select — dependency-free, accessible, fine for desktop. */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-8 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
