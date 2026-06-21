/**
 * Prescription / medication-list import module.
 *
 * An Rx photo or a medication list yields several `medication` rows. Every row
 * is reviewed manually and starts UNCHECKED — nothing is auto-accepted. Rows
 * whose name matches an existing medication are flagged as duplicates (surfaced,
 * never blocked) so the user decides whether to add them again.
 */

import { Pill } from "lucide-react";
import { PRESCRIPTION_EXTRACTION_PROMPT } from "../../prompts";
import type { DocTypeModule, ReviewProps } from "../registry";
import { asArray, asObject, boolOrNull, nullableStr } from "../validate";
import { resolveEnum, parseDose } from "../resolve";
import { MEDICATION_TYPE_VOCAB, type MedicationType } from "../vocab";
import { ReviewBanner } from "../ReviewBanner";
import { storeSourceAttachment } from "../save-helpers";
import { createMedication } from "@/db/repos";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectMenu } from "@/components/ui/select-menu";
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

type MedRow = {
  key: number;
  include: boolean;
  name: string;
  type: MedicationType;
  dose: string | null;
  frequency: string | null;
  purpose: string | null;
  asNeeded: boolean;
  duplicate: boolean;
};

export type PrescriptionDraft = { rows: MedRow[] };

type RawMed = {
  name: string;
  type: string | null;
  dose: string | null;
  frequency: string | null;
  purpose: string | null;
  asNeeded: boolean | null;
};

function validateMeds(parsed: unknown): RawMed[] {
  const meds: RawMed[] = [];
  for (const item of asArray(parsed)) {
    const o = asObject(item);
    if (!o) continue;
    const name = nullableStr(o.name);
    if (!name) continue;
    meds.push({
      name,
      type: nullableStr(o.type, 40),
      dose: nullableStr(o.dose, 60),
      frequency: nullableStr(o.frequency, 120),
      purpose: nullableStr(o.purpose, 200),
      asNeeded: boolOrNull(o.asNeeded),
    });
  }
  return meds;
}

export const prescriptionModule: DocTypeModule<PrescriptionDraft> = {
  id: "prescription",
  icon: Pill,
  i18nKey: "prescriptionReview",

  async prepare(doc, ctx): Promise<PrescriptionDraft> {
    const parsed = await ctx.provider.extractStructured(doc, PRESCRIPTION_EXTRACTION_PROMPT, 8192);
    const meds = validateMeds(parsed);
    const existing = new Set(ctx.medications.map((m) => m.name.trim().toLowerCase()));
    return {
      rows: meds.map((m, i) => ({
        key: i,
        include: false,
        name: m.name,
        type: resolveEnum(m.type, MEDICATION_TYPE_VOCAB, "drug").value,
        dose: m.dose,
        frequency: m.frequency,
        purpose: m.purpose,
        asNeeded: m.asNeeded ?? false,
        duplicate: existing.has(m.name.trim().toLowerCase()),
      })),
    };
  },

  isEmpty: (draft) => draft.rows.length === 0,

  Review: PrescriptionReview,

  async save(draft, ctx): Promise<string> {
    await storeSourceAttachment(ctx, "prescription", "medication");
    const included = draft.rows.filter((r) => r.include && r.name.trim());
    for (const r of included) {
      const { amount, unit } = parseDose(r.dose);
      await createMedication({
        profileId: ctx.profileId,
        name: r.name.trim(),
        type: r.type,
        doseAmount: amount,
        doseUnit: unit,
        schedule: r.frequency?.trim() ? { frequency: r.frequency.trim() } : null,
        asNeeded: r.asNeeded,
        startDate: todayISO(),
        endDate: null,
        purpose: r.purpose?.trim() || null,
      });
    }
    return "/medications";
  },
};

function PrescriptionReview({ draft, setDraft, onSave }: ReviewProps<PrescriptionDraft>) {
  const { t } = useI18n();
  const { rows } = draft;
  const included = rows.filter((r) => r.include && r.name.trim());
  const canSave = included.length > 0;

  const typeOptions = (["drug", "supplement"] as const).map((v) => ({
    value: v,
    label: t(`types.${v}`),
  }));

  const patch = (key: number, p: Partial<MedRow>) =>
    setDraft({ rows: rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });

  return (
    <>
      <ReviewBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.prescriptionReview.title")}</CardTitle>
          <CardDescription>{t("importWizard.prescriptionReview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead>{t("importWizard.prescriptionReview.columns.name")}</TableHead>
                <TableHead className="w-36">
                  {t("importWizard.prescriptionReview.columns.type")}
                </TableHead>
                <TableHead>{t("importWizard.prescriptionReview.columns.dose")}</TableHead>
                <TableHead>{t("importWizard.prescriptionReview.columns.schedule")}</TableHead>
                <TableHead>{t("importWizard.prescriptionReview.columns.purpose")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const missing = row.include && !row.name.trim();
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={row.include}
                        onChange={() => patch(row.key, { include: !row.include })}
                      />
                    </TableCell>
                    <TableCell className="min-w-44">
                      <div className="flex items-center gap-2">
                        <Input
                          value={row.name}
                          onChange={(e) => patch(row.key, { name: e.target.value })}
                          className={missing ? "border-destructive" : ""}
                        />
                        {row.duplicate && (
                          <Badge
                            variant="warning"
                            title={t("importWizard.prescriptionReview.duplicateHint")}
                          >
                            {t("importWizard.prescriptionReview.duplicate")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-32">
                      <SelectMenu
                        value={row.type}
                        onChange={(v) => patch(row.key, { type: v as MedicationType })}
                        options={typeOptions}
                      />
                    </TableCell>
                    <TableCell className="min-w-28">
                      <Input
                        value={row.dose ?? ""}
                        onChange={(e) => patch(row.key, { dose: e.target.value || null })}
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <Input
                        value={row.frequency ?? ""}
                        onChange={(e) => patch(row.key, { frequency: e.target.value || null })}
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <Input
                        value={row.purpose ?? ""}
                        onChange={(e) => patch(row.key, { purpose: e.target.value || null })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="px-5 pb-4">
            <AiDisclaimer />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex justify-end">
        <Button onClick={onSave} disabled={!canSave}>
          {t("importWizard.prescriptionReview.save", { count: String(included.length) })}
        </Button>
      </div>
    </>
  );
}
