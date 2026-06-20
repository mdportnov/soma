import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type RelatedItem = {
  /** Stable key within the block (entity id is fine). */
  id: string | number;
  icon: LucideIcon;
  label: string;
  /** Secondary line (date, dose, status…); optional. */
  sublabel?: string | null;
  /** In-app route. When absent the item renders as static text (no detail page). */
  to?: string;
};

/**
 * "Связано / Related" block: a labelled list of edges to other records, each an
 * icon + label (+ optional sublabel) that links to the target page. Shared by the
 * visit, diagnosis and medication views so the graph reads consistently.
 */
export function RelatedLinks({
  title,
  items,
  className,
}: {
  title: string;
  items: RelatedItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("mt-3 border-t pt-3", className)}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <RelatedRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RelatedRow({ item }: { item: RelatedItem }) {
  const Icon = item.icon;
  const body = (
    <>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{item.label}</span>
        {item.sublabel && <span className="ml-1 text-muted-foreground">· {item.sublabel}</span>}
      </span>
      {item.to && (
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
      )}
    </>
  );

  if (!item.to) {
    return <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs">{body}</div>;
  }

  return (
    <Link
      to={item.to}
      className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
    >
      {body}
    </Link>
  );
}
