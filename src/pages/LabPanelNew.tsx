import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createPanelWithResults, listBiomarkers } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { todayISO } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { Biomarker } from "@/db/schema";

type Row = { key: number; biomarkerId: number | ""; value: string; unit: string };

export function LabPanelNew() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: biomarkers, loading } = useQuery(() => listBiomarkers(), []);

  const [date, setDate] = React.useState(todayISO());
  const [labName, setLabName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [panelType, setPanelType] = React.useState<"blood" | "urine" | "other">("blood");
  const nextKey = React.useRef(1);
  const [rows, setRows] = React.useState<Row[]>([{ key: 0, biomarkerId: "", value: "", unit: "" }]);
  const [saving, setSaving] = React.useState(false);

  if (loading || !biomarkers) return <Loading />;

  const byId = new Map<number, Biomarker>(biomarkers.map((b) => [b.id, b]));
  const byCategory = new Map<string, Biomarker[]>();
  for (const b of biomarkers) {
    const list = byCategory.get(b.category) ?? [];
    list.push(b);
    byCategory.set(b.category, list);
  }
  const biomarkerOptions: ComboboxOption[] = [...byCategory.entries()].flatMap(([category, items]) =>
    items.map((b) => ({ value: String(b.id), label: b.canonicalName, group: category, keywords: b.aliases })),
  );

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validRows = rows.filter(
    (r) => r.biomarkerId !== "" && r.value.trim() !== "" && Number.isFinite(Number(r.value)),
  );

  const save = async () => {
    setSaving(true);
    try {
      const panelId = await createPanelWithResults(
        {
          profileId,
          date,
          labName: labName.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          panelType,
          importMethod: "manual",
        },
        validRows.map((r) => ({
          biomarkerId: r.biomarkerId as number,
          value: Number(r.value),
          unit: r.unit.trim() || byId.get(r.biomarkerId as number)?.defaultUnit || "",
        })),
        byId,
      );
      navigate(`/labs/${panelId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Link
        to="/labs"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Lab results
      </Link>
      <PageHeader title={t("labPanelNew.title")} description={t("labPanelNew.description")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("labPanelNew.panelTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t("fields.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t("labPanelNew.fields.labName")}>
            <Input
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              placeholder="e.g. Invitro"
            />
          </Field>
          <Field label={t("fields.city")}>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label={t("fields.country")}>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
          <Field label={t("fields.type")}>
            <Select
              value={panelType}
              onChange={(e) => setPanelType(e.target.value as typeof panelType)}
            >
              <option value="blood">{t("types.blood")}</option>
              <option value="urine">{t("types.urine")}</option>
              <option value="other">{t("types.other")}</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("labPanelNew.resultsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => {
            const bio = row.biomarkerId !== "" ? byId.get(row.biomarkerId) : undefined;
            return (
              <div key={row.key} className="flex flex-wrap items-end gap-2">
                <Field label={t("labPanelNew.fields.biomarker")} className="min-w-56 flex-1">
                  <Combobox
                    value={row.biomarkerId === "" ? null : String(row.biomarkerId)}
                    onChange={(v) => {
                      const id = v ? Number(v) : "";
                      updateRow(row.key, {
                        biomarkerId: id,
                        unit: id !== "" ? (byId.get(id as number)?.defaultUnit ?? "") : "",
                      });
                    }}
                    options={biomarkerOptions}
                    placeholder={t("labPanelNew.selectBiomarker")}
                  />
                </Field>
                <Field label={t("fields.value")} className="w-28">
                  <Input
                    type="number"
                    step="any"
                    value={row.value}
                    onChange={(e) => updateRow(row.key, { value: e.target.value })}
                  />
                </Field>
                <Field label={t("fields.unit")} className="w-28">
                  <Input
                    value={row.unit}
                    placeholder={bio?.defaultUnit ?? ""}
                    onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                  disabled={rows.length === 1}
                  aria-label={t("labPanelNew.removeRow")}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { key: nextKey.current++, biomarkerId: "", value: "", unit: "" },
              ])
            }
          >
            <Plus /> {t("labPanelNew.addRow")}
          </Button>
        </CardContent>
      </Card>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/labs")}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || validRows.length === 0 || !date}>
          {validRows.length === 1 ? t("labPanelNew.savePanelSingular", { count: validRows.length.toString() }) : t("labPanelNew.savePanelPlural", { count: validRows.length.toString() })}
        </Button>
      </div>
    </>
  );
}
