import { AlertTriangle, CheckCircle2, Database, ExternalLink, X } from "lucide-react";
import type { ChangeSetWithItems } from "@/db/chat-repos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function ChangeSetPanel(props: {
  changeSet: ChangeSetWithItems;
  saving: boolean;
  onSelect: (itemId: number, selected: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { t } = useI18n();
  const { changeSet } = props;
  const selected = changeSet.items.filter((item) => item.selected);
  const blocked = selected.some((item) => item.status === "blocked");
  const committed = changeSet.status === "committed";
  const closed = committed || changeSet.status === "discarded";
  return (
    <div className="mt-2 w-full max-w-2xl rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            {committed ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <Database className="size-4" />
            )}
            {changeSet.summary}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {committed
              ? t("aiAnalysis.changes.saved")
              : changeSet.status === "discarded"
                ? t("aiAnalysis.changes.discarded")
                : t("aiAnalysis.changes.review")}
          </p>
        </div>
        <Badge variant={changeSet.riskLevel === "elevated" ? "warning" : "secondary"}>
          {t(`aiAnalysis.changes.risk.${changeSet.riskLevel}`)}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        {changeSet.items.map((item) => (
          <label
            key={item.id}
            className={cn(
              "block rounded-lg border p-3",
              !item.selected && "opacity-50",
              item.status === "blocked" &&
                item.selected &&
                "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex items-start gap-2">
              {!closed && (
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={item.selected}
                  onChange={(event) => props.onSelect(item.id, event.target.checked)}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    {t(`aiAnalysis.changes.operation.${item.operation}`)} ·{" "}
                    {t(`aiAnalysis.changes.entity.${item.entityType}`)}
                  </p>
                  {committed && item.entityId != null && (
                    <a
                      href={recordHref(item.entityType, item.entityId)}
                      className="text-primary"
                      title={t("aiAnalysis.changes.openRecord")}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-2">
                  {Object.entries(item.payloadJson)
                    .filter(
                      ([key, value]) =>
                        ![
                          "kind",
                          "assertionType",
                          "draftRef",
                          "visitDraftRef",
                          "prescribedAtVisitRef",
                        ].includes(key) && value != null,
                    )
                    .map(([key, value]) => (
                      <div key={key} className="flex min-w-0 gap-1">
                        <dt className="text-muted-foreground">{fieldLabel(key)}:</dt>
                        <dd className="truncate">{displayValue(value)}</dd>
                      </div>
                    ))}
                </dl>
                {item.candidateMatchesJson.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {t("aiAnalysis.changes.matches")}:{" "}
                    {item.candidateMatchesJson.map((candidate) => candidate.label).join(", ")}
                  </p>
                )}
                {item.warningsJson.map((warning) => (
                  <p
                    key={warning}
                    className="mt-2 flex gap-1 text-xs text-amber-700 dark:text-amber-400"
                  >
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {warning}
                  </p>
                ))}
                {item.errorsJson.map((error) => (
                  <p key={error} className="mt-2 flex gap-1 text-xs text-destructive">
                    <X className="mt-0.5 size-3 shrink-0" /> {error}
                  </p>
                ))}
              </div>
            </div>
          </label>
        ))}
      </div>
      {!closed && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <Button
            size="sm"
            onClick={props.onSave}
            disabled={props.saving || blocked || selected.length === 0}
          >
            {props.saving
              ? t("aiAnalysis.changes.saving")
              : t("aiAnalysis.changes.save", { count: String(selected.length) })}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onDiscard} disabled={props.saving}>
            {t("aiAnalysis.changes.discard")}
          </Button>
          {blocked && (
            <p className="self-center text-xs text-destructive">
              {t("aiAnalysis.changes.blocked")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function fieldLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function recordHref(entityType: string, entityId: number): string {
  if (entityType === "medication") return `/medications/${entityId}`;
  if (entityType === "diagnosis") return `/diagnoses/${entityId}`;
  if (entityType === "allergy") return "/allergies";
  if (entityType === "visit") return `/visits/${entityId}`;
  if (entityType === "imaging") return `/imaging/${entityId}`;
  if (entityType === "vaccine") return "/vaccines";
  if (entityType === "profile") return "/settings";
  if (entityType === "retest_schedule") return "/notifications";
  if (["symptom", "weight", "blood_pressure", "lifestyle"].includes(entityType)) return "/journal";
  return "/timeline";
}
