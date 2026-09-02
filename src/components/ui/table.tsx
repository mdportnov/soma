import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Column conventions shared by every list table so columns line up the same
 * way everywhere:
 * - `numeric` — right-aligned tabular figures (counts, values, readings).
 * - `actions` — trailing icon-button column: shrinks to its content, right-
 *   aligned, tighter vertical padding so a row of `iconSm` buttons does not
 *   inflate the row. Use on both the head (empty) and the cell.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { ref?: React.Ref<HTMLTableRowElement> }) {
  return (
    <tr
      className={cn("border-b last:border-b-0 transition-colors hover:bg-muted/40", className)}
      {...props}
    />
  );
}

type ColumnKind = { numeric?: boolean; actions?: boolean };

export function TableHead({
  className,
  numeric,
  actions,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & ColumnKind) {
  return (
    <th
      className={cn(
        "h-9 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        numeric && "text-right",
        actions && "w-px whitespace-nowrap text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  actions,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & ColumnKind) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle",
        numeric && "text-right tabular-nums",
        actions && "w-px whitespace-nowrap py-1.5 text-right [&>*]:justify-end",
        className,
      )}
      {...props}
    />
  );
}
