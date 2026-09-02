import * as React from "react";
import { Activity, AlertTriangle, ArrowUpDown, Pencil, Plus, Search, X } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useListMotion } from "@/hooks/useListMotion";
import { seedState, type BiomarkerSeed } from "@/app/seed";
import {
  createBiomarker,
  getBiomarkerSeries,
  getLatestResults,
  listBiomarkers,
  type SeriesPoint,
} from "@/db/repos";
import type { Biomarker } from "@/db/schema";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { FlagBadge } from "@/components/app/FlagBadge";
import { IconAction } from "@/components/app/IconAction";
import { StatusCard } from "@/components/app/StatusCard";
import { EditBiomarkerDialog } from "@/components/app/EditBiomarkerDialog";
import { Sparkline } from "@/components/charts/Sparkline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { formatDate, formatValue } from "@/lib/utils";
import {
  SORTS,
  STATUS_FILTERS,
  activeFilterKeys,
  filterItems,
  groupByCategory,
  isGroupedSort,
  listStatus,
  sortItems,
  type ListFilters,
  type ListItem,
  type Sort,
  type StatusFilter,
} from "@/lib/biomarker-list";
import {
  loadBiomarkerListPrefs,
  saveBiomarkerListPrefs,
  type BiomarkerListPrefs,
} from "@/lib/biomarker-list-prefs";
import { useToast } from "@/components/app/Toast";
import { allKnownUnits } from "@/lib/units";
import { useI18n } from "@/lib/i18n";

const STATUS_FILTER_KEYS: Record<StatusFilter, string> = {
  all: "biomarkerList.status.all",
  with_data: "biomarkerList.status.withData",
  out_of_range: "biomarkerList.status.outOfRange",
  not_optimal: "biomarkerList.status.notOptimal",
  optimal: "biomarkerList.status.optimal",
  not_evaluated: "biomarkerList.status.notEvaluated",
  no_data: "biomarkerList.status.noData",
};

const SORT_KEYS: Record<Sort, string> = {
  attention: "biomarkerList.sort.attention",
  name: "biomarkerList.sort.name",
  recent: "biomarkerList.sort.recent",
  stale: "biomarkerList.sort.stale",
  change: "biomarkerList.sort.change",
};

/** Sentinel for "every category" in the SelectMenu (its value can't be null). */
const ALL_CATEGORIES = "__all__";

export function Biomarkers() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const [prefs, setPrefs] = React.useState<BiomarkerListPrefs>(() => loadBiomarkerListPrefs());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Biomarker | null>(null);

  const updatePrefs = (patch: Partial<BiomarkerListPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveBiomarkerListPrefs(next);
      return next;
    });
  };
  const resetFilters = () => {
    setQuery("");
    updatePrefs({ status: "all", category: null });
  };

  const { data, loading, reload } = useQuery(async () => {
    const [biomarkers, latest] = await Promise.all([listBiomarkers(), getLatestResults(profileId)]);
    // Sparklines only need biomarkers that actually have readings — fetch their
    // series in parallel and key the trend by id.
    const trackedIds = [...latest.keys()];
    const seriesList = await Promise.all(trackedIds.map((id) => getBiomarkerSeries(profileId, id)));
    const series = new Map(trackedIds.map((id, i) => [id, seriesList[i]]));
    return { biomarkers, latest, series };
  }, [profileId]);

  // Derived before the loading guard so the list-motion hook below can run on
  // every render (rules of hooks); with no data yet the list is simply empty.
  const biomarkers = data?.biomarkers ?? [];
  const items: ListItem<Biomarker, SeriesPoint>[] = biomarkers.map((b) => ({
    biomarker: b,
    latest: data?.latest.get(b.id),
    series: data?.series.get(b.id),
  }));
  const categories = [...new Set(biomarkers.map((b) => b.category))].sort((a, b) =>
    a.localeCompare(b),
  );
  // A stored category that no longer exists (renamed, dictionary changed) must
  // not silently empty the page.
  const category =
    prefs.category != null && categories.includes(prefs.category) ? prefs.category : null;
  const filters: ListFilters = { query, status: prefs.status, category };
  const visible = sortItems(filterItems(items, filters), prefs.sort);
  const grouped = isGroupedSort(prefs.sort) && category == null;
  const sections: [string | null, ListItem<Biomarker, SeriesPoint>[]][] = grouped
    ? [...groupByCategory(visible).entries()]
    : [[null, visible]];
  const active = activeFilterKeys(filters);
  // Sorting slides the cards to their new places, filtering fades the
  // newcomers in — the change the user just asked for is seen, not inferred.
  const listRef = useListMotion(visible.map((item) => String(item.biomarker.id)));

  if (loading || !data) return <Loading />;

  const activeFilterLabels = active.map((k) => {
    if (k === "query") return t("biomarkerList.activeFilter.query", { query: query.trim() });
    if (k === "status")
      return t("biomarkerList.activeFilter.status", { value: t(STATUS_FILTER_KEYS[prefs.status]) });
    return t("biomarkerList.activeFilter.category", { value: category ?? "" });
  });

  const statusBadge = (item: ListItem<Biomarker, SeriesPoint>) => {
    const status = listStatus(item);
    switch (status) {
      case "out_of_range":
      case "not_evaluated":
        return (
          <FlagBadge
            flag={item.latest?.outOfRange ? (item.latest.flag ?? null) : null}
            evaluated={status !== "not_evaluated"}
          />
        );
      case "optimal":
        return <Badge variant="success">{t("biomarkers.optimal")}</Badge>;
      case "in_range":
        return <Badge variant="secondary">{t("biomarkers.inRange")}</Badge>;
      case "no_data":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            {t("biomarkers.noData")}
          </Badge>
        );
    }
  };

  const renderCard = (item: ListItem<Biomarker, SeriesPoint>) => {
    const b = item.biomarker;
    const latest = item.latest;
    const status = listStatus(item);
    const series = item.series ?? [];
    const refRange =
      b.refLow != null || b.refHigh != null
        ? `${b.refLow ?? "—"}–${b.refHigh ?? "—"} ${b.defaultUnit}`
        : null;
    return (
      <StatusCard
        key={b.id}
        motionKey={String(b.id)}
        to={`/biomarkers/${b.id}`}
        // What the card already shows travels with the click, so the detail
        // page paints its header in the same frame instead of after its query.
        state={seedState<BiomarkerSeed>({
          kind: "biomarker",
          biomarker: b,
          latest: latest
            ? { value: latest.value, unit: latest.unit, date: latest.date }
            : undefined,
        })}
        title={b.canonicalName}
        status={statusBadge(item)}
        muted={status === "no_data"}
        value={
          latest ? (
            <p className="text-base font-semibold leading-none tabular-nums selectable">
              {formatValue(latest.value)}{" "}
              <span className="text-xs font-normal text-muted-foreground">{latest.unit}</span>
            </p>
          ) : (
            <p className="text-base font-semibold leading-none text-muted-foreground">—</p>
          )
        }
        aside={
          series.length > 0 ? (
            <Sparkline
              points={series.map((p) => ({
                date: p.date,
                value: p.value,
                unit: p.unit,
                flag: p.flag,
                outOfRange: p.outOfRange,
                evaluated: p.evaluated,
              }))}
              optimalLow={b.optimalLow}
              optimalHigh={b.optimalHigh}
              lastOutOfRange={status === "out_of_range"}
              label={b.canonicalName}
            />
          ) : undefined
        }
        meta={
          latest
            ? formatDate(latest.date)
            : refRange
              ? `${t("biomarkerList.refRange")} ${refRange}`
              : t("biomarkerList.noRefRange")
        }
        tag={b.isCustom ? <Badge variant="secondary">{t("biomarkers.custom")}</Badge> : undefined}
        action={
          <IconAction
            label={t("biomarkers.editDialog.action")}
            icon={<Pencil className="size-3.5" />}
            onClick={() => setEditing(b)}
            className="size-7 bg-card"
          />
        }
      />
    );
  };

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
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("biomarkers.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
            aria-label={t("biomarkers.searchPlaceholder")}
          />
        </div>
        <SelectMenu
          value={prefs.status}
          onChange={(v) => updatePrefs({ status: v as StatusFilter })}
          options={STATUS_FILTERS.map((s) => ({ value: s, label: t(STATUS_FILTER_KEYS[s]) }))}
          className="w-full sm:w-44"
        />
        <SelectMenu
          value={category ?? ALL_CATEGORIES}
          onChange={(v) => updatePrefs({ category: v === ALL_CATEGORIES ? null : v })}
          options={[
            { value: ALL_CATEGORIES, label: t("biomarkerList.allCategories") },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          className="w-full sm:w-44"
        />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <SelectMenu
            value={prefs.sort}
            onChange={(v) => updatePrefs({ sort: v as Sort })}
            options={SORTS.map((s) => ({ value: s, label: t(SORT_KEYS[s]) }))}
            className="w-full sm:w-52"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {t("biomarkerList.count", { shown: String(visible.length), total: String(items.length) })}
        </span>
        {active.length > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X /> {t("biomarkerList.reset")}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={t("biomarkers.emptySearchTitle")}
          description={
            active.length > 0
              ? t("biomarkerList.emptyFiltered", { filters: activeFilterLabels.join(" · ") })
              : t("biomarkers.emptySearchDescription")
          }
          action={
            active.length > 0 ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <X /> {t("biomarkerList.reset")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div ref={listRef} className="space-y-6">
          {sections.map(([heading, list]) => (
            <section key={heading ?? "__flat__"}>
              {heading && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {heading}
                </h2>
              )}
              <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map(renderCard)}
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
        existingCategories={categories}
        unitCatalog={allKnownUnits(data.biomarkers.map((b) => b.defaultUnit))}
      />

      <EditBiomarkerDialog
        open={!!editing}
        biomarker={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
    </>
  );
}

export function CreateBiomarkerDialog({
  open,
  onClose,
  onCreated,
  existingCategories,
  unitCatalog,
  initialName = "",
  initialUnit = "",
  initialRefLow = "",
  initialRefHigh = "",
  initialCategory,
  initialDirection,
  initialAliases = "",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
  existingCategories: string[];
  unitCatalog: string[];
  initialName?: string;
  /** Prefills (e.g. from an import row): printed unit + parsed reference range. */
  initialUnit?: string;
  initialRefLow?: string;
  initialRefHigh?: string;
  /** AI-drafted definition for an unmatched import row (optional, best-effort). */
  initialCategory?: string;
  initialDirection?: "range" | "higher_better" | "lower_better";
  initialAliases?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = React.useState(initialName);
  const [category, setCategory] = React.useState(initialCategory ?? "Custom");
  const [unit, setUnit] = React.useState(initialUnit);
  const [refLow, setRefLow] = React.useState(initialRefLow);
  const [refHigh, setRefHigh] = React.useState(initialRefHigh);
  const [aliases, setAliases] = React.useState(initialAliases);
  const [direction, setDirection] = React.useState<"range" | "higher_better" | "lower_better">(
    initialDirection ?? "range",
  );
  const [saving, setSaving] = React.useState(false);

  // Re-seed from props each time the dialog opens (a different import row).
  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setCategory(initialCategory ?? "Custom");
      setUnit(initialUnit);
      setRefLow(initialRefLow);
      setRefHigh(initialRefHigh);
      setDirection(initialDirection ?? "range");
      setAliases(initialAliases);
    }
  }, [
    open,
    initialName,
    initialUnit,
    initialRefLow,
    initialRefHigh,
    initialCategory,
    initialDirection,
    initialAliases,
  ]);

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
      toast.show(t("toasts.added", { name: name.trim() }));
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
      guardUnsaved
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
            <Combobox
              value={unit || null}
              onChange={setUnit}
              options={unitCatalog.map((u) => ({ value: u, label: u }))}
              placeholder={t("biomarkers.createDialog.unitPlaceholder")}
              allowCustom
            />
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
            <SelectMenu
              value={direction}
              onChange={(v) => setDirection(v as typeof direction)}
              options={[
                { value: "range", label: t("biomarkers.createDialog.directionOptions.range") },
                {
                  value: "higher_better",
                  label: t("biomarkers.createDialog.directionOptions.higherBetter"),
                },
                {
                  value: "lower_better",
                  label: t("biomarkers.createDialog.directionOptions.lowerBetter"),
                },
              ]}
            />
          </Field>
        </div>
        {!refLow.trim() && !refHigh.trim() && (
          <p className="flex items-start gap-1.5 text-[11px] text-warning-strong">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            {t("biomarkers.createDialog.noRangeWarning")}
          </p>
        )}
        <Field label={t("biomarkers.createDialog.aliasesLabel")}>
          <Input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder={t("biomarkers.createDialog.aliasesPlaceholder")}
          />
        </Field>
        <DialogActions
          onClose={onClose}
          onSubmit={submit}
          submitLabel={t("biomarkers.createDialog.create")}
          disabled={saving || !name.trim() || !unit.trim()}
        />
      </div>
    </Dialog>
  );
}
