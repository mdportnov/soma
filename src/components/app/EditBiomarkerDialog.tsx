import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { Biomarker } from "@/db/schema";
import { updateBiomarkerDictionary } from "@/db/repos";
import { parseAliases, parseNumberOrNull, validateRanges } from "@/lib/biomarker-edit";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/app/Toast";
import { useI18n } from "@/lib/i18n";

/**
 * Edits a dictionary entry's reference/optimal ranges and aliases — for seeded
 * markers as well as custom ones. Persists via `updateBiomarkerDictionary`,
 * which flags the entry so the startup seed sync stops overriding it.
 */
export function EditBiomarkerDialog({
  open,
  biomarker,
  onClose,
  onSaved,
}: {
  open: boolean;
  biomarker: Biomarker | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [refLow, setRefLow] = React.useState("");
  const [refHigh, setRefHigh] = React.useState("");
  const [optimalLow, setOptimalLow] = React.useState("");
  const [optimalHigh, setOptimalHigh] = React.useState("");
  const [aliases, setAliases] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Prefill from the entry each time the dialog opens.
  React.useEffect(() => {
    if (open && biomarker) {
      setRefLow(biomarker.refLow?.toString() ?? "");
      setRefHigh(biomarker.refHigh?.toString() ?? "");
      setOptimalLow(biomarker.optimalLow?.toString() ?? "");
      setOptimalHigh(biomarker.optimalHigh?.toString() ?? "");
      setAliases((biomarker.aliases ?? []).join(", "));
      setError(null);
    }
  }, [open, biomarker]);

  const submit = async () => {
    if (!biomarker || saving) return;
    const ranges = {
      refLow: parseNumberOrNull(refLow),
      refHigh: parseNumberOrNull(refHigh),
      optimalLow: parseNumberOrNull(optimalLow),
      optimalHigh: parseNumberOrNull(optimalHigh),
    };
    const valid = validateRanges(ranges);
    if (!valid.ok) {
      setError(
        valid.error === "ref"
          ? t("biomarkers.editDialog.refOrderError")
          : t("biomarkers.editDialog.optimalOrderError"),
      );
      return;
    }
    setSaving(true);
    try {
      await updateBiomarkerDictionary(biomarker.id, { ...ranges, aliases: parseAliases(aliases) });
      toast.show(t("toasts.updated", { name: biomarker.canonicalName }));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("biomarkers.editDialog.title")}
      description={biomarker ? `${biomarker.canonicalName} · ${biomarker.defaultUnit}` : undefined}
      onSubmit={submit}
      submitDisabled={saving}
      guardUnsaved
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("biomarkers.editDialog.refLowLabel")}>
            <Input type="number" value={refLow} onChange={(e) => setRefLow(e.target.value)} />
          </Field>
          <Field label={t("biomarkers.editDialog.refHighLabel")}>
            <Input type="number" value={refHigh} onChange={(e) => setRefHigh(e.target.value)} />
          </Field>
          <Field label={t("biomarkers.editDialog.optimalLowLabel")}>
            <Input
              type="number"
              value={optimalLow}
              onChange={(e) => setOptimalLow(e.target.value)}
            />
          </Field>
          <Field label={t("biomarkers.editDialog.optimalHighLabel")}>
            <Input
              type="number"
              value={optimalHigh}
              onChange={(e) => setOptimalHigh(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("biomarkers.editDialog.aliasesLabel")}>
          <Textarea
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder={t("biomarkers.editDialog.aliasesPlaceholder")}
            rows={2}
          />
        </Field>
        {error && (
          <p className="flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {t("common.saveChanges")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
