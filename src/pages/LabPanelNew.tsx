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
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { todayISO } from "@/lib/utils";
import type { Biomarker } from "@/db/schema";

type Row = { key: number; biomarkerId: number | ""; value: string; unit: string };

export function LabPanelNew() {
  const { profileId } = useApp();
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
      <PageHeader title="New lab panel" description="Manual entry of a lab draw." />

      <Card>
        <CardHeader>
          <CardTitle>Panel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Lab name">
            <Input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="e.g. Invitro" />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Country">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={panelType} onChange={(e) => setPanelType(e.target.value as typeof panelType)}>
              <option value="blood">Blood</option>
              <option value="urine">Urine</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => {
            const bio = row.biomarkerId !== "" ? byId.get(row.biomarkerId) : undefined;
            return (
              <div key={row.key} className="flex flex-wrap items-end gap-2">
                <Field label="Biomarker" className="min-w-56 flex-1">
                  <Select
                    value={row.biomarkerId === "" ? "" : String(row.biomarkerId)}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : "";
                      updateRow(row.key, {
                        biomarkerId: id,
                        unit: id !== "" ? (byId.get(id as number)?.defaultUnit ?? "") : "",
                      });
                    }}
                  >
                    <option value="">Select biomarker…</option>
                    {[...byCategory.entries()].map(([category, items]) => (
                      <optgroup key={category} label={category}>
                        {items.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.canonicalName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
                <Field label="Value" className="w-28">
                  <Input
                    type="number"
                    step="any"
                    value={row.value}
                    onChange={(e) => updateRow(row.key, { value: e.target.value })}
                  />
                </Field>
                <Field label="Unit" className="w-28">
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
                  aria-label="Remove row"
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
              setRows((rs) => [...rs, { key: nextKey.current++, biomarkerId: "", value: "", unit: "" }])
            }
          >
            <Plus /> Add row
          </Button>
        </CardContent>
      </Card>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/labs")}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || validRows.length === 0 || !date}>
          Save panel ({validRows.length} result{validRows.length === 1 ? "" : "s"})
        </Button>
      </div>
    </>
  );
}
