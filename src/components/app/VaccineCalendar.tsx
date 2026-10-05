import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Plus,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  computeAntigen,
  isGradedTier,
  TIER_ORDER,
  vaccineReminders,
  VACCINE_SCHEDULE,
  type AntigenView,
  type DoseStatus,
  type VaccineReminder,
  type VaccineTier,
} from "@/lib/vaccine-schedule";
import { Tooltip } from "@/components/ui/tooltip";
import { settingsPath } from "@/lib/settings-navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate, todayISO } from "@/lib/utils";

export type VaccineRecord = {
  id?: number;
  vaccineName: string;
  manufacturer?: string | null;
  date: string;
  expiresAt?: string | null;
};

type T = ReturnType<typeof useI18n>["t"];

/**
 * Three-bucket status system used everywhere on the calendar. Colour is never
 * the only carrier: every graded status has an icon and a text label.
 *  - action    — overdue / due (destructive / warning, alert / clock icon)
 *  - done      — recorded (success, check icon)
 *  - reference — upcoming / contextual / not recorded (neutral, no icon)
 */
const STATUS_TEXT: Record<DoseStatus, string> = {
  done: "text-success-strong",
  due: "text-warning-strong",
  overdue: "text-destructive",
  upcoming: "text-muted-foreground",
  contextual: "text-muted-foreground",
  not_recorded: "text-muted-foreground",
};

const STATUS_CHIP: Record<DoseStatus, string> = {
  done: "border-success/40 bg-success/10",
  due: "border-warning/50 bg-warning/10",
  overdue: "border-destructive/50 bg-destructive/10",
  upcoming: "border-border bg-muted/60",
  contextual: "border-border bg-muted/40",
  not_recorded: "border-dashed border-border",
};

function StatusIcon({ status, className }: { status: DoseStatus; className?: string }) {
  const cls = cn("size-3 shrink-0", className);
  switch (status) {
    case "done":
      return <Check className={cls} />;
    case "overdue":
      return <AlertTriangle className={cls} />;
    case "due":
      return <Clock className={cls} />;
    default:
      return null;
  }
}

function StatusBadge({ status, t }: { status: DoseStatus; t: T }) {
  const label = t(`vaccines.calendar.status.${status}`);
  const variant =
    status === "overdue"
      ? "destructive"
      : status === "due"
        ? "warning"
        : status === "done"
          ? "success"
          : "secondary";
  return (
    <Badge variant={variant}>
      <StatusIcon status={status} />
      {label}
    </Badge>
  );
}

export function VaccineCalendar<R extends VaccineRecord>({
  birthDate,
  records,
  hiddenKeys = [],
  onAddVaccine,
  onEditRecord,
  onSetHidden,
}: {
  birthDate: string | null;
  records: R[];
  /** Reminder keys the user hid (profile `uiPrefs.vaccineRemindersHidden`). */
  hiddenKeys?: string[];
  /** Opens the add form pre-filled with the antigen / vaccine name. */
  onAddVaccine?: (vaccineName: string) => void;
  /** Opens a recorded shot (used for lapsed certificates). */
  onEditRecord?: (record: R) => void;
  /** Hides a reminder everywhere, or brings it back. */
  onSetHidden?: (key: string, hidden: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const today = todayISO();
  const [showHidden, setShowHidden] = React.useState(false);

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
  const reminders = React.useMemo(
    () => vaccineReminders(allViews, records, today, hiddenKeys),
    [allViews, records, today, hiddenKeys],
  );
  const active = reminders.filter((r) => !r.hidden);
  const hidden = reminders.filter((r) => r.hidden);
  // Headline count = genuinely actionable items only (overdue boosters/doses and
  // lapsed certificates the user hasn't hidden). Unrecorded childhood doses never count.
  const actionableCount = active.filter((r) => r.status === "overdue").length;
  const dueCount = active.length - actionableCount;
  const clear = !!birthDate && active.length === 0;
  const activeAntigens = new Set(active.map((r) => r.antigenId));
  const hiddenAntigens = new Set(
    hidden.map((r) => r.antigenId).filter((id) => !activeAntigens.has(id)),
  );

  const reminderName = (r: VaccineReminder) => (lang === "ru" ? r.nameRu : r.name);
  const reminderDetail = (r: VaccineReminder) => {
    if (r.kind === "certificate")
      return r.date ? `${t("vaccines.table.expires")}: ${formatDate(r.date)}` : undefined;
    return [
      lang === "ru" ? r.labelRu : r.label,
      r.lastDate && t("vaccines.calendar.last", { date: formatDate(r.lastDate) }),
      r.date &&
        (r.kind === "dose" || r.status === "overdue") &&
        t("vaccines.calendar.dueSince", { date: formatDate(r.date) }),
    ]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <>
      {!birthDate && (
        <Card className="border-warning/40">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <CalendarCheck className="size-4 text-warning-strong" />
            </div>
            <p className="min-w-0 flex-1 text-sm">{t("vaccines.calendar.addBirthDate")}</p>
            <Link to={settingsPath("profile")}>
              <Button variant="outline" size="sm">
                {t("nav.settings")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <Card className={actionableCount > 0 ? "border-destructive/40" : "border-warning/40"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  actionableCount > 0 ? "bg-destructive/10" : "bg-warning/10",
                )}
              >
                {actionableCount > 0 ? (
                  <AlertTriangle className="size-4 text-destructive" />
                ) : (
                  <Clock className="size-4 text-warning-strong" />
                )}
              </div>
              <p className="text-sm font-semibold">
                {actionableCount > 0
                  ? actionableCount === 1
                    ? t("dashboard.attention.vaccinesOne")
                    : t("dashboard.attention.vaccinesMany", { count: String(actionableCount) })
                  : t("vaccines.calendar.due", { n: String(dueCount) })}
              </p>
            </div>
            <ul className="mt-3 divide-y rounded-lg border">
              {active.map((r) => (
                <ActionItem
                  key={r.key}
                  name={reminderName(r)}
                  detail={reminderDetail(r)}
                  status={r.status}
                  statusLabel={r.kind === "certificate" ? t("vaccines.expired") : undefined}
                  action={
                    <span className="flex items-center gap-1.5">
                      {r.kind === "certificate" && r.record && onEditRecord && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEditRecord(r.record as R)}
                        >
                          {t("common.edit")}
                        </Button>
                      )}
                      {onAddVaccine && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onAddVaccine(reminderName(r))}
                        >
                          <Plus /> {t("common.add")}
                        </Button>
                      )}
                      {onSetHidden && (
                        <Tooltip content={t("vaccines.reminders.hideHint")}>
                          <Button
                            size="iconSm"
                            variant="ghost"
                            aria-label={t("vaccines.reminders.hide")}
                            onClick={() => onSetHidden(r.key, true)}
                          >
                            <EyeOff />
                          </Button>
                        </Tooltip>
                      )}
                    </span>
                  }
                  t={t}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {hidden.length > 0 && onSetHidden && (
        <div className="-mt-3 text-xs text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
          >
            <EyeOff className="size-3.5" />
            {t("vaccines.reminders.hiddenCount", { count: String(hidden.length) })}
            <ChevronDown
              className={cn("size-3.5 transition-transform", showHidden && "rotate-180")}
            />
          </button>
          {showHidden && (
            <ul className="mt-2 divide-y rounded-lg border bg-card">
              {hidden.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{reminderName(r)}</p>
                    {reminderDetail(r) && <p className="mt-0.5">{reminderDetail(r)}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onSetHidden(r.key, false)}>
                    <Eye /> {t("vaccines.reminders.show")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarCheck className="size-4 text-muted-foreground" />
            <CardTitle>{t("vaccines.calendar.title")}</CardTitle>
            <Badge variant="secondary">{t("vaccines.calendar.subtitle")}</Badge>
            {clear && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-success-strong">
                <Check className="size-3.5" />
                {t("vaccines.calendar.summaryClear")}
              </span>
            )}
          </div>
          <CardDescription>{t("vaccines.calendar.description")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-hidden rounded-b-xl p-0">
          {TIER_ORDER.map((tier) => {
            const views = byTier.get(tier);
            if (!views || views.length === 0) return null;
            return (
              <TierSection
                key={tier}
                tier={tier}
                views={views}
                activeAntigens={activeAntigens}
                hiddenAntigens={hiddenAntigens}
                lang={lang}
                t={t}
              />
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

function ActionItem({
  name,
  detail,
  status,
  statusLabel,
  action,
  t,
}: {
  name: string;
  detail?: string;
  status: DoseStatus;
  statusLabel?: string;
  action?: React.ReactNode;
  t: T;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium selectable">{name}</span>
          {statusLabel ? (
            <Badge variant="destructive">
              <StatusIcon status={status} />
              {statusLabel}
            </Badge>
          ) : (
            <StatusBadge status={status} t={t} />
          )}
        </p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </li>
  );
}

function TierSection({
  tier,
  views,
  activeAntigens,
  hiddenAntigens,
  lang,
  t,
}: {
  tier: VaccineTier;
  views: AntigenView[];
  /** Antigens with a reminder the user hasn't hidden. */
  activeAntigens: Set<string | null>;
  /** Antigens whose only reminders are hidden. */
  hiddenAntigens: Set<string | null>;
  lang: string;
  t: T;
}) {
  const flagged = views.filter((v) => activeAntigens.has(v.entry.id)).length;
  const done = views.filter((v) => v.overall === "done").length;
  // Only a tier that actually asks for something opens by default; the rest is
  // reference material and stays folded so the page reads top-down.
  const [open, setOpen] = React.useState(flagged > 0);
  const contentId = React.useId();
  // The childhood blurb carries a real rule ("unrecorded ≠ overdue"); the other
  // tiers' blurbs only restate "reference", which the tier name and the row
  // badges already say.
  const blurb = tier === "universal" ? t("vaccines.calendar.tierBlurbs.universal") : null;

  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted",
          open ? "bg-muted/70" : "bg-muted/40",
        )}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{t(`vaccines.calendar.tiers.${tier}`)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{views.length}</span>
          </span>
          {blurb && <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {flagged > 0 && (
            <Badge variant="destructive">
              <AlertTriangle className="size-3" />
              {flagged}
            </Badge>
          )}
          {done > 0 && (
            <Badge variant="success">
              <Check className="size-3" />
              {done}
            </Badge>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id={contentId} className="divide-y border-t">
          {views.map((v) => (
            <AntigenRow
              key={v.entry.id}
              view={v}
              reminderHidden={hiddenAntigens.has(v.entry.id)}
              lang={lang}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AntigenRow({
  view,
  reminderHidden,
  lang,
  t,
}: {
  view: AntigenView;
  reminderHidden: boolean;
  lang: string;
  t: T;
}) {
  const name = lang === "ru" ? view.entry.nameRu : view.entry.name;
  const disease = lang === "ru" ? view.entry.diseaseRu : view.entry.disease;
  const note = lang === "ru" ? view.entry.noteRu : view.entry.note;

  return (
    <div className="px-5 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{name}</p>
          {disease !== name && <p className="text-xs text-muted-foreground">{disease}</p>}
        </div>
        {reminderHidden && (view.overall === "overdue" || view.overall === "due") ? (
          <Badge variant="secondary">
            <EyeOff className="size-3" />
            {t("vaccines.reminders.hidden")}
          </Badge>
        ) : (
          <StatusBadge status={view.overall} t={t} />
        )}
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
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
                STATUS_CHIP[d.status],
                STATUS_TEXT[d.status],
              )}
              title={`${roleLabel} — ${t(`vaccines.calendar.status.${d.status}`)}`}
            >
              <StatusIcon status={d.status} />
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
              "inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs",
              view.recurring.status === "overdue" && "border-destructive/50 bg-destructive/10",
              view.recurring.status === "due" && "border-warning/50 bg-warning/10",
              STATUS_TEXT[view.recurring.status],
            )}
          >
            <StatusIcon status={view.recurring.status} />
            <span className="font-medium">
              {lang === "ru" ? view.recurring.labelRu : view.recurring.label}
            </span>
            {view.recurring.status === "due" && view.recurring.lastDate ? (
              <span className="opacity-80">
                · {t("vaccines.calendar.last", { date: formatDate(view.recurring.lastDate) })}
              </span>
            ) : (
              view.recurring.nextDate && (
                <span className="opacity-80">
                  ·{" "}
                  {t(
                    view.recurring.status === "overdue"
                      ? "vaccines.calendar.dueSince"
                      : "vaccines.calendar.next",
                    { date: formatDate(view.recurring.nextDate) },
                  )}
                </span>
              )
            )}
          </span>
        )}
      </div>

      {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
