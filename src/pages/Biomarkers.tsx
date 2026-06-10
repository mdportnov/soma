import * as React from "react";
import { Link } from "react-router-dom";
import { Activity, Plus, Search } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createBiomarker, getLatestResults, listBiomarkers } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { FlagBadge } from "@/components/app/FlagBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatValue } from "@/lib/utils";
import { normalizeLabel } from "@/lib/fuzzy";
import { useI18n } from "@/lib/i18n";

export function Biomarkers() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const [onlyTracked, setOnlyTracked] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data, loading, reload } = useQuery(async () => {
    const [biomarkers, latest] = await Promise.all([listBiomarkers(), getLatestResults(profileId)]);
    return { biomarkers, latest };
  }, [profileId]);

  if (loading || !data) return <Loading />;

  const q = normalizeLabel(query);
  const filtered = data.biomarkers.filter((b) => {
    if (onlyTracked && !data.latest.has(b.id)) return false;
    if (!q) return true;
    return [b.canonicalName, ...(b.aliases ?? [])].some((n) => normalizeLabel(n).includes(q));
  });

  const byCategory = new Map<string, typeof filtered>();
  for (const b of filtered) {
    const list = byCategory.get(b.category) ?? [];
    list.push(b);
    byCategory.set(b.category, list);
  }

  return (
    <>
      <PageHeader
        title={t("biomarkers.title")}
        description={t("biomarkers.description")}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> {t("biomarkers.customBiomarker")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("biomarkers.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant={onlyTracked ? "secondary" : "outline"}
          size="sm"
          onClick={() => setOnlyTracked(!onlyTracked)}
        >
          {t("biomarkers.withDataOnly")}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={t("biomarkers.emptySearchTitle")}
          description={t("biomarkers.emptySearchDescription")}
        />
      ) : (
        <div className="space-y-6">
          {[...byCategory.entries()].map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((b) => {
                  const latest = data.latest.get(b.id);
                  return (
                    <Link
                      key={b.id}
                      to={`/biomarkers/${b.id}`}
                      className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{b.canonicalName}</p>
                        {b.isCustom && <Badge variant="secondary">{t("biomarkers.custom")}</Badge>}
                      </div>
                      {latest ? (
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="text-sm tabular-nums">
                            <span className="font-semibold">{formatValue(latest.value)}</span>{" "}
                            <span className="text-xs text-muted-foreground">{latest.unit}</span>
                          </p>
                          <div className="flex items-center gap-1.5">
                            <FlagBadge flag={latest.outOfRange ? latest.flag : null} />
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(latest.date)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {t("biomarkers.noData")} · {b.refLow ?? "—"}–{b.refHigh ?? "—"} {b.defaultUnit}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <CreateBiomarkerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void reload();
        }}
        existingCategories={[...new Set(data.biomarkers.map((b) => b.category))]}
      />
    </>
  );
}

export function CreateBiomarkerDialog({
  open,
  onClose,
  onCreated,
  existingCategories,
  initialName = "",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
  existingCategories: string[];
  initialName?: string;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState(initialName);
  const [category, setCategory] = React.useState("Custom");
  const [unit, setUnit] = React.useState("");
  const [refLow, setRefLow] = React.useState("");
  const [refHigh, setRefHigh] = React.useState("");
  const [aliases, setAliases] = React.useState("");
  const [direction, setDirection] = React.useState<"range" | "higher_better" | "lower_better">(
    "range",
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const submit = async () => {
    if (!name.trim() || !unit.trim()) return;
    setSaving(true);
    try {
      const id = await createBiomarker({
        canonicalName: name.trim(),
        category: category.trim() || t("categories.custom"),
        defaultUnit: unit.trim(),
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        refLow: refLow ? Number(refLow) : null,
        refHigh: refHigh ? Number(refHigh) : null,
        direction,
        isCustom: true,
      });
      onCreated(id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("biomarkers.createDialog.title")}
      description={t("biomarkers.createDialog.description")}
      onSubmit={submit}
      submitDisabled={saving || !name.trim() || !unit.trim()}
    >
      <div className="grid gap-3">
        <Field label={t("biomarkers.createDialog.nameLabel")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("biomarkers.createDialog.namePlaceholder")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("biomarkers.createDialog.categoryLabel")}>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="bio-categories"
            />
            <datalist id="bio-categories">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={t("biomarkers.createDialog.unitLabel")}>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("biomarkers.createDialog.unitPlaceholder")} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("biomarkers.createDialog.refLowLabel")}>
            <Input type="number" value={refLow} onChange={(e) => setRefLow(e.target.value)} />
          </Field>
          <Field label={t("biomarkers.createDialog.refHighLabel")}>
            <Input type="number" value={refHigh} onChange={(e) => setRefHigh(e.target.value)} />
          </Field>
          <Field label={t("biomarkers.createDialog.directionLabel")}>
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
            >
              <option value="range">{t("biomarkers.createDialog.directionOptions.range")}</option>
              <option value="higher_better">{t("biomarkers.createDialog.directionOptions.higherBetter")}</option>
              <option value="lower_better">{t("biomarkers.createDialog.directionOptions.lowerBetter")}</option>
            </Select>
          </Field>
        </div>
        <Field label={t("biomarkers.createDialog.aliasesLabel")}>
          <Input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder={t("biomarkers.createDialog.aliasesPlaceholder")}
          />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim() || !unit.trim()}>
            {t("biomarkers.createDialog.create")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
