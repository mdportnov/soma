import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoTo } from "@/app/navigation";
import type { Crumb } from "@/app/nav";

const CRUMB_LINK_CLASS =
  "shrink-0 rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const goTo = useGoTo();
  return (
    <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <div key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />}
            {item.to && !isLast ? (
              // A crumb that points at an entry still behind us unwinds history
              // rather than pushing a duplicate: clicking "Labs" three levels
              // deep should shorten the stack, not stack a fourth entry on it.
              typeof item.delta === "number" ? (
                <button type="button" onClick={() => goTo(item)} className={CRUMB_LINK_CLASS}>
                  {item.label}
                </button>
              ) : (
                <Link to={item.to} className={CRUMB_LINK_CLASS}>
                  {item.label}
                </Link>
              )
            ) : (
              <span
                className={cn(
                  "max-w-[20rem] truncate text-foreground",
                  item.selectable && "selectable",
                )}
              >
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
