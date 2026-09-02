import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { useGoTo, usePageNav, type PageNav } from "@/app/navigation";

export function PageHeader({
  title,
  description,
  actions,
  nav,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * Present on sub- and detail pages: the header then derives its own trail and
   * back target from the session journal. Top-level sections pass nothing and
   * get neither — a back chevron on a sidebar destination is noise.
   */
  nav?: PageNav;
}) {
  return (
    <div className="mb-6">
      {nav ? (
        <NavHeader nav={nav} title={title} description={description} actions={actions} />
      ) : (
        <HeaderRow title={title} description={description} actions={actions} />
      )}
    </div>
  );
}

/**
 * Split out so the journal hooks only run for pages that asked for navigation
 * chrome — `PageHeader` itself stays usable in any tree, and pages can keep
 * their early `return <Loading />` guards without breaking the rules of hooks.
 */
function NavHeader({
  nav,
  title,
  description,
  actions,
}: {
  nav: PageNav;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  const goTo = useGoTo();
  const { breadcrumbs, back } = usePageNav(nav);

  return (
    <>
      {/* A one-item trail is just the page title repeated in smaller type —
          only render once there is an ancestor to orient against. */}
      {breadcrumbs.length > 1 && <Breadcrumbs items={breadcrumbs} />}
      <HeaderRow
        title={title}
        description={description}
        actions={actions}
        back={
          back && (
            // A button, not a <Link>: back must *unwind* history when the real
            // previous screen is behind us. A link would push a new entry, so
            // the stack would grow with every press and the shell's scroll
            // restoration (which only fires on POP) would never run.
            <button
              type="button"
              onClick={() => goTo(back)}
              aria-label={t("breadcrumb.back")}
              title={t("breadcrumb.back")}
              className="press mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ArrowLeft className="size-4" />
            </button>
          )
        }
      />
    </>
  );
}

function HeaderRow({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {back}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
