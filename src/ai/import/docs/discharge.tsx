/**
 * Discharge-summary / epicrisis import module.
 *
 * One free-form clinical document yields several entity kinds — a visit, plus
 * diagnoses, prescribed medications and stated allergies. All are reviewed
 * manually and start UNCHECKED; the model never guesses. Allergies are captured
 * here too because they are safety-critical and routinely appear in epicrises.
 */

import { FileText } from "lucide-react";
import { DISCHARGE_EXTRACTION_PROMPT } from "../../prompts";
import type { RawDischargeExtraction } from "../../types";
import type { DocTypeModule, ReviewProps } from "../registry";
import { asArray, asObject, expectObject, isoDateOrNull, nullableStr } from "../validate";
import { resolveEnum, parseDose } from "../resolve";
import {
  ALLERGY_SEVERITY_VOCAB,
  ALLERGY_CATEGORY_VOCAB,
  type AllergySeverity,
  type AllergyCategory,
} from "../vocab";
import { ReviewBanner } from "../ReviewBanner";
import { storeSourceAttachment } from "../save-helpers";
import {
  createAllergy,
  createDiagnosis,
  createMedication,
  createVisit,
  updateAttachment,
} from "@/db/repos";
import { Field } from "@/components/app/Field";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { todayISO } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type DischargeMeta = { visitDate: string; clinic: string; doctorName: string; notes: string };

type DischargeRow =
  | { key: number; include: boolean; type: "diagnosis"; name: string; icdCode: string | null }
  | { key: number; include: boolean; type: "medication"; name: string; dose: string | null }
  | {
      key: number;
      include: boolean;
      type: "allergy";
      name: string;
      reaction: string | null;
      severity: AllergySeverity;
      category: AllergyCategory;
    };

export type DischargeDraft = { meta: DischargeMeta; rows: DischargeRow[] };

function validateDischarge(parsed: unknown): RawDischargeExtraction {
  const o = expectObject(parsed, "Discharge extraction");
  const diagnoses = asArray(o.diagnoses)
    .map((d) => {
      const r = asObject(d);
      const name = r && nullableStr(r.name);
      return name ? { name, icdCode: nullableStr(r!.icdCode, 20) } : null;
    })
    .filter((d): d is { name: string; icdCode: string | null } => d !== null);
  const medications = asArray(o.medications)
    .map((m) => {
      const r = asObject(m);
      const name = r && nullableStr(r.name);
      return name ? { name, dose: nullableStr(r!.dose, 60) } : null;
    })
    .filter((m): m is { name: string; dose: string | null } => m !== null);
  const allergies = asArray(o.allergies)
    .map((a) => {
      const r = asObject(a);
      const allergen = r && nullableStr(r.allergen);
      return allergen
        ? {
            allergen,
            reaction: nullableStr(r!.reaction, 200),
            severity: nullableStr(r!.severity, 40),
            category: nullableStr(r!.category, 40),
          }
        : null;
    })
    .filter(
      (
        a,
      ): a is {
        allergen: string;
        reaction: string | null;
        severity: string | null;
        category: string | null;
      } => a !== null,
    );
  return {
    visitDate: isoDateOrNull(o.visitDate),
    clinic: nullableStr(o.clinic),
    doctorName: nullableStr(o.doctorName),
    diagnoses,
    medications,
    allergies,
    notes: typeof o.notes === "string" ? o.notes.trim().slice(0, 4000) : "",
  };
}

export const dischargeModule: DocTypeModule<DischargeDraft> = {
  id: "discharge",
  icon: FileText,
  i18nKey: "dischargeReview",

  async prepare(doc, ctx): Promise<DischargeDraft> {
    const parsed = await ctx.provider.extractStructured(doc, DISCHARGE_EXTRACTION_PROMPT, 8192);
    const d = validateDischarge(parsed);
    let key = 0;
    const rows: DischargeRow[] = [
      ...d.diagnoses.map(
        (dx): DischargeRow => ({
          key: key++,
          include: false,
          type: "diagnosis",
          name: dx.name,
          icdCode: dx.icdCode,
        }),
      ),
      ...d.medications.map(
        (m): DischargeRow => ({
          key: key++,
          include: false,
          type: "medication",
          name: m.name,
          dose: m.dose,
        }),
      ),
      ...d.allergies.map(
        (a): DischargeRow => ({
          key: key++,
          include: false,
          type: "allergy",
          name: a.allergen,
          reaction: a.reaction,
          severity: resolveEnum(a.severity, ALLERGY_SEVERITY_VOCAB, "moderate").value,
          // Resolve the category from the summary; never assume "drug" — a
          // mis-categorised food/environmental allergy would feed the
          // drug-interaction warnings incorrectly.
          category: resolveEnum(a.category, ALLERGY_CATEGORY_VOCAB, "other").value,
        }),
      ),
    ];
    return {
      meta: {
        visitDate: d.visitDate ?? "",
        clinic: d.clinic ?? "",
        doctorName: d.doctorName ?? "",
        notes: d.notes,
      },
      rows,
    };
  },

  isEmpty: (draft) =>
    draft.rows.length === 0 &&
    !draft.meta.visitDate &&
    !draft.meta.clinic &&
    !draft.meta.doctorName,

  Review: DischargeReview,

  async save(draft, ctx): Promise<string> {
    const { meta, rows } = draft;
    const attachmentId = await storeSourceAttachment(ctx, "discharge", "visit");
    const visitDate = meta.visitDate || null;
    const recordDate = visitDate ?? todayISO();
    let visitId: number | null = null;
    if (visitDate || meta.clinic.trim() || meta.doctorName.trim()) {
      visitId = await createVisit({
        profileId: ctx.profileId,
        date: recordDate,
        doctorName: meta.doctorName.trim() || null,
        clinic: meta.clinic.trim() || null,
        notes: meta.notes.trim() || null,
      });
      if (attachmentId != null) {
        await updateAttachment(attachmentId, {
          linkedEntityType: "visit",
          linkedEntityId: visitId,
        });
      }
    }

    const included = rows.filter((r) => r.include && r.name.trim());
    for (const r of included) {
      if (r.type === "diagnosis") {
        await createDiagnosis({
          profileId: ctx.profileId,
          name: r.name.trim(),
          icdCode: r.icdCode?.trim() || null,
          date: recordDate,
          visitId,
        });
      } else if (r.type === "medication") {
        const parsed = parseDose(r.dose);
        await createMedication({
          profileId: ctx.profileId,
          name: r.name.trim(),
          type: "drug",
          doseAmount: parsed.amount,
          doseUnit: parsed.unit,
          schedule: null,
          startDate: recordDate,
          endDate: null,
        });
      } else {
        await createAllergy({
          profileId: ctx.profileId,
          allergen: r.name.trim(),
          category: r.category,
          severity: r.severity,
          reaction: r.reaction?.trim() || null,
          onsetDate: null,
          status: "active",
        });
      }
    }
    return visitId != null ? `/visits/${visitId}` : "/visits";
  },
};

function DischargeReview({ draft, setDraft, onSave }: ReviewProps<DischargeDraft>) {
  const { t } = useI18n();
  const { meta, rows } = draft;
  const included = rows.filter((r) => r.include && r.name.trim());

  const setMeta = (p: Partial<DischargeMeta>) => setDraft({ ...draft, meta: { ...meta, ...p } });
  const setName = (key: number, name: string) =>
    setDraft({ ...draft, rows: rows.map((r) => (r.key === key ? { ...r, name } : r)) });
  const toggle = (key: number) =>
    setDraft({
      ...draft,
      rows: rows.map((r) => (r.key === key ? { ...r, include: !r.include } : r)),
    });

  return (
    <>
      <ReviewBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.dischargeReview.title")}</CardTitle>
          <CardDescription>{t("importWizard.dischargeReview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label={t("fields.date")}>
            <DateInput
              value={meta.visitDate}
              onChange={(v) => setMeta({ visitDate: v })}
              clearable
            />
          </Field>
          <Field label={t("visits.fields.clinic")}>
            <Input value={meta.clinic} onChange={(e) => setMeta({ clinic: e.target.value })} />
          </Field>
          <Field label={t("visits.fields.doctor")}>
            <Input
              value={meta.doctorName}
              onChange={(e) => setMeta({ doctorName: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead className="w-28">
                  {t("importWizard.dischargeReview.typeColumn")}
                </TableHead>
                <TableHead>{t("fields.name")}</TableHead>
                <TableHead>{t("importWizard.dischargeReview.detailColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={row.include}
                      onChange={() => toggle(row.key)}
                    />
                  </TableCell>
                  <TableCell>
                    {row.type === "diagnosis" ? (
                      <Badge variant="secondary">
                        {t("importWizard.dischargeReview.diagnosisBadge")}
                      </Badge>
                    ) : row.type === "medication" ? (
                      <Badge>{t("importWizard.dischargeReview.medicationBadge")}</Badge>
                    ) : (
                      <Badge variant="destructive">
                        {t("importWizard.dischargeReview.allergyBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="min-w-52">
                    <Input value={row.name} onChange={(e) => setName(row.key, e.target.value)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.type === "diagnosis"
                      ? (row.icdCode ?? "—")
                      : row.type === "medication"
                        ? (row.dose ?? "—")
                        : [row.reaction, t(`allergySeverity.${row.severity}`)]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-5 pb-4">
            <AiDisclaimer />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex justify-end">
        <Button onClick={onSave} disabled={included.length === 0}>
          {t("importWizard.dischargeReview.save", { count: String(included.length) })}
        </Button>
      </div>
    </>
  );
}
