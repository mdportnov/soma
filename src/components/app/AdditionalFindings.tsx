import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronDown, Search, X } from "lucide-react";
import type { FindingWithPanel } from "@/db/repos";
import { drillState } from "@/app/nav-journal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const columns = "grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]";
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

function FindingReading({ finding, name }: { finding: FindingWithPanel; name: string }) {
  const { t } = useI18n();
  return (
    <>
      <div className="min-w-0 space-y-1.5 [overflow-wrap:anywhere]">
        <p className="text-xs text-muted-foreground md:hidden">
          {t("labPanelDetail.tableColumns.value")}
        </p>
        <p className="text-sm font-medium text-foreground">
          {finding.valueText}
          {finding.unit ? ` ${finding.unit}` : ""}
        </p>
        {finding.refRangeText && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium">{t("labPanelDetail.tableColumns.reference")}:</span>{" "}
            {finding.refRangeText}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-1.5 [overflow-wrap:anywhere]">
        <Link
          to={`/labs/${finding.panelId}?highlight=${finding.id}&section=findings`}
          state={drillState}
          aria-label={t("labs.findingsOpenReport", { name, date: formatDate(finding.date) })}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {formatDate(finding.date)} <ArrowUpRight className="size-3.5 shrink-0" />
        </Link>
        {finding.labName && (
          <p className="text-xs leading-relaxed text-muted-foreground">{finding.labName}</p>
        )}
      </div>
    </>
  );
}

export function AdditionalFindings({ findings }: { findings: FindingWithPanel[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const groups = useMemo(() => {
    const byName = new Map<string, FindingWithPanel[]>();
    for (const finding of findings) {
      const key = normalize(finding.nameEn?.trim() || finding.rawLabel);
      const group = byName.get(key) ?? [];
      group.push(finding);
      byName.set(key, group);
    }
    return [...byName.entries()].map(([key, items]) => {
      items.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      return { key, name: items[0].nameEn?.trim() || items[0].rawLabel, items };
    });
  }, [findings]);
  const shown = groups
    .filter(
      (group) =>
        !query.trim() ||
        group.items.some((finding) =>
          normalize(`${finding.nameEn ?? ""} ${finding.rawLabel}`).includes(normalize(query)),
        ),
    )
    .sort((a, b) =>
      sort === "recent"
        ? b.items[0].date.localeCompare(a.items[0].date) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );

  return (
    <section className="mt-8" aria-labelledby="additional-findings-title">
      <h2 id="additional-findings-title" className="text-lg font-semibold">
        {t("labs.findingsTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("labs.findingsDescription")}</p>
      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label={t("labs.findingsSearch")}
            placeholder={t("labs.findingsSearch")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9 pr-9"
          />
          {query && (
            <Button
              size="iconSm"
              variant="ghost"
              aria-label={t("labs.findingsClearSearch")}
              className="absolute right-0.5 top-0.5"
              onClick={() => setQuery("")}
            >
              <X />
            </Button>
          )}
        </div>
        <SelectMenu
          value={sort}
          onChange={setSort}
          options={[
            { value: "name", label: t("labs.findingsByName") },
            { value: "recent", label: t("labs.findingsByDate") },
          ]}
        />
        <p className="text-xs text-muted-foreground" role="status">
          {t("labs.findingsCount", { count: String(shown.length), total: String(groups.length) })}
        </p>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("common.noMatches")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div
            className={`${columns} hidden border-b bg-muted/30 px-5 py-3 text-xs font-medium text-muted-foreground md:grid`}
          >
            <span>{t("labs.findingsName")}</span>
            <span>{t("labs.findingsLatest")}</span>
            <span>{t("labs.findingsReport")}</span>
          </div>
          <div className="divide-y">
            {shown.map(({ key, name, items: [latest, ...history] }) => (
              <article key={key} className="p-5">
                <div className={columns}>
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <h3 className="text-sm font-semibold leading-relaxed">{name}</h3>
                    {normalize(latest.rawLabel) !== normalize(name) && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {latest.rawLabel}
                      </p>
                    )}
                  </div>
                  <FindingReading finding={latest} name={name} />
                </div>
                {history.length > 0 && (
                  <details className="group mt-3">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                      {t("labs.findingsHistory", { count: String(history.length) })}
                    </summary>
                    <div className="mt-3 space-y-4 border-l-2 border-primary/20 pl-4">
                      {history.map((finding) => (
                        <div key={finding.id} className={`${columns} rounded-lg bg-muted/25 p-3`}>
                          <p className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                            {finding.rawLabel}
                          </p>
                          <FindingReading finding={finding} name={name} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
