import * as React from "react";
import { CalendarCheck, Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  computeAntigen,
  countActionable,
  isGradedTier,
  TIER_ORDER,
  VACCINE_SCHEDULE,
  type AntigenView,
  type DoseStatus,
  type VaccineTier,
} from "@/lib/vaccine-schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, todayISO } from "@/lib/utils";

type VaccineRecord = {
  vaccineName: string;
  manufacturer?: string | null;
  date: string;
  expiresAt?: string | null;
};

const STATUS_TEXT: Record<DoseStatus, string> = {
  done: "text-success",
  due: "text-warning",
  overdue: "text-destructive",
  upcoming: "text-muted-foreground",
  contextual: "text-muted-foreground",
  not_recorded: "text-muted-foreground",
};

const STATUS_BORDER: Record<DoseStatus, string> = {
  done: "border-success/40 bg-success/10",
  due: "border-warning/50 bg-warning/10",
  overdue: "border-destructive/50 bg-destructive/10",
  upcoming: "border-border bg-muted/40",
  contextual: "border-border bg-muted/30",
  not_recorded: "border-dashed border-border bg-muted/20",
};

function overallBadge(status: DoseStatus, t: ReturnType<typeof useI18n>["t"]) {
  const label = t(`vaccines.calendar.status.${status}`);
  switch (status) {
    case "overdue":
      return <Badge variant="destructive">{label}</Badge>;
    case "due":
      return <Badge variant="warning">{label}</Badge>;
    case "done":
      return (
        <Badge variant="success">
          <Check className="size-3" /> {label}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{label}</Badge>;
  }
}

export function VaccineCalendar({
  birthDate,
  records,
}: {
  birthDate: string | null;
  records: VaccineRecord[];
}) {
  const { t, lang } = useI18n();
  const today = todayISO();

  const byTier = React.useMemo(() => {
    const map = new Map<VaccineTier, AntigenView[]>();
    for (const entry of VACCINE_SCHEDULE) {
      const view = computeAntigen(entry, birthDate, records, today, isGradedTier(entry.tier));
      const list = map.get(entry.tier) ?? [];
      list.push(view);
      map.set(entry.tier, list);
    }
    return map;
  }, [birthDate, records, today]);

  const allViews = React.useMemo(() => [...byTier.values()].flat(), [byTier]);
  // Headline count = genuinely actionable items only (recurring adult boosters
  // past due + lapsed certificates). Unrecorded childhood doses never count.
  const actionableCount = countActionable(allViews, records, today);
  const dueCount = allViews.filter((v) => v.overall === "due").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-muted-foreground" />
          <CardTitle>{t("vaccines.calendar.title")}</CardTitle>
          <Badge variant="secondary">{t("vaccines.calendar.subtitle")}</Badge>
          <div className="ml-auto flex items-center gap-1.5">
            {actionableCount > 0 && (
              <Badge variant="destructive">
                {t("vaccines.calendar.actionable", { n: String(actionableCount) })}
              </Badge>
            )}
            {dueCount > 0 && (
              <Badge variant="warning">{t("vaccines.calendar.due", { n: String(dueCount) })}</Badge>
            )}
            {birthDate && actionableCount === 0 && dueCount === 0 && (
              <span className="text-xs text-success">{t("vaccines.calendar.summaryClear")}</span>
            )}
          </div>
        </div>
        <CardDescription>{t("vaccines.calendar.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!birthDate && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
            {t("vaccines.calendar.addBirthDate")}
          </p>
        )}
        {TIER_ORDER.map((tier) => {
          const views = byTier.get(tier);
          if (!views || views.length === 0) return null;
          return (
            <TierSection
              key={tier}
              tier={tier}
              views={views}
              defaultOpen={tier === "regional" || tier === "risk"}
              lang={lang}
              t={t}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function TierSection({
  tier,
  views,
  defaultOpen,
  lang,
  t,
}: {
  tier: VaccineTier;
  views: AntigenView[];
  defaultOpen: boolean;
  lang: string;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  // Only genuinely actionable items (overdue/due) get the red dot. A tier full of
  // unrecorded childhood doses (`not_recorded`) is calm by design.
  const flagged = views.filter((v) => v.overall === "overdue" || v.overall === "due").length;
  const blurb = t(`vaccines.calendar.tierBlurbs.${tier}`);

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 p-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium">{t(`vaccines.calendar.tiers.${tier}`)}</span>
            <span className="text-xs text-muted-foreground">({views.length})</span>
            {flagged > 0 && <span className="size-1.5 rounded-full bg-destructive" />}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{blurb}</span>
        </span>
        <ChevronDown
          className={cn(
            "ml-auto mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="divide-y border-t">
          {views.map((v) => (
            <AntigenRow key={v.entry.id} view={v} lang={lang} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function AntigenRow({
  view,
  lang,
  t,
}: {
  view: AntigenView;
  lang: string;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const name = lang === "ru" ? view.entry.nameRu : view.entry.name;
  const disease = lang === "ru" ? view.entry.diseaseRu : view.entry.disease;
  const note = lang === "ru" ? view.entry.noteRu : view.entry.note;

  return (
    <div className="p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{disease}</span>
          </div>
        </div>
        {overallBadge(view.overall, t)}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {view.doses.map((d, i) => {
          const role = lang === "ru" ? d.labelRu : d.label;
          const roleLabel = role ?? t("vaccines.calendar.doseN", { n: String(i + 1) });
          const ageLabel = lang === "ru" ? d.ageLabelRu : d.ageLabel;
          return (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
                STATUS_BORDER[d.status],
                STATUS_TEXT[d.status],
              )}
              title={roleLabel}
            >
              {d.status === "done" && <Check className="size-3" />}
              <span className="font-medium">{ageLabel}</span>
              {d.status === "done" && d.doneDate && (
                <span className="opacity-80">· {formatDate(d.doneDate).slice(-4)}</span>
              )}
            </span>
          );
        })}

        {view.recurring && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px]",
              STATUS_TEXT[view.recurring.status],
            )}
          >
            <span className="font-medium">
              {lang === "ru" ? view.recurring.labelRu : view.recurring.label}
            </span>
            {view.recurring.nextDate && (
              <span className="opacity-80">
                · {t("vaccines.calendar.next", { date: formatDate(view.recurring.nextDate) })}
              </span>
            )}
          </span>
        )}
      </div>

      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
