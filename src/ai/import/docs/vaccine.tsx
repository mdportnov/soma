/**
 * Vaccination-certificate import module.
 *
 * No dictionary fallback exists for vaccines, so every extracted dose is
 * reviewed manually and starts UNCHECKED — nothing is auto-accepted. The model
 * never guesses: unreadable fields become null.
 */

import { Syringe } from "lucide-react";
import { VACCINE_EXTRACTION_PROMPT } from "../../prompts";
import type { RawVaccineExtraction } from "../../types";
import type { DocTypeModule, ReviewProps } from "../registry";
import { asArray, asObject, intOrNull, isoDateOrNull, nullableStr } from "../validate";
import { ReviewBanner } from "../ReviewBanner";
import { storeSourceAttachment } from "../save-helpers";
import { createVaccine } from "@/db/repos";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";

type VaccineRow = RawVaccineExtraction & { include: boolean; key: number };

export type VaccineDraft = { rows: VaccineRow[] };

function validateVaccines(parsed: unknown): RawVaccineExtraction[] {
  const rows: RawVaccineExtraction[] = [];
  for (const item of asArray(parsed)) {
    const o = asObject(item);
    if (!o) continue;
    const name = nullableStr(o.vaccineName);
    if (!name) continue;
    rows.push({
      vaccineName: name,
      date: isoDateOrNull(o.date),
      doseNumber: intOrNull(o.doseNumber),
      manufacturer: nullableStr(o.manufacturer),
      batchNumber: nullableStr(o.batchNumber),
      expiresAt: isoDateOrNull(o.expiresAt),
    });
  }
  return rows;
}

export const vaccineModule: DocTypeModule<VaccineDraft> = {
  id: "vaccine",
  icon: Syringe,
  i18nKey: "vaccineReview",

  async prepare(doc, ctx): Promise<VaccineDraft> {
    const parsed = await ctx.provider.extractStructured(doc, VACCINE_EXTRACTION_PROMPT, 8192);
    const vaccines = validateVaccines(parsed);
    return { rows: vaccines.map((v, i) => ({ ...v, include: false, key: i })) };
  },

  isEmpty: (draft) => draft.rows.length === 0,

  Review: VaccineReview,

  async save(draft, ctx): Promise<string> {
    const attachmentId = await storeSourceAttachment(ctx, "vaccination_cert", "vaccine");
    const included = draft.rows.filter((r) => r.include && r.vaccineName.trim() && r.date);
    for (const r of included) {
      await createVaccine({
        profileId: ctx.profileId,
        vaccineName: r.vaccineName.trim(),
        date: r.date!,
        manufacturer: r.manufacturer?.trim() || null,
        batchNumber: r.batchNumber?.trim() || null,
        dose: r.doseNumber ?? null,
        expiresAt: r.expiresAt || null,
        attachmentId,
      });
    }
    return "/vaccines";
  },
};

function VaccineReview({ draft, setDraft, onSave }: ReviewProps<VaccineDraft>) {
  const { t } = useI18n();
  const { rows } = draft;
  const included = rows.filter((r) => r.include);
  const canSave = included.length > 0 && included.every((r) => r.vaccineName.trim() && r.date);

  const patch = (key: number, p: Partial<VaccineRow>) =>
    setDraft({ rows: rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });

  return (
    <>
      <ReviewBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.vaccineReview.title")}</CardTitle>
          <CardDescription>{t("importWizard.vaccineReview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.vaccine")}</TableHead>
                <TableHead>{t("fields.date")}</TableHead>
                <TableHead className="w-16">
                  {t("importWizard.vaccineReview.columns.dose")}
                </TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.manufacturer")}</TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.batch")}</TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.expires")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const missing = row.include && (!row.vaccineName.trim() || !row.date);
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
                      <Input
                        value={row.vaccineName}
                        onChange={(e) => patch(row.key, { vaccineName: e.target.value })}
                        className={missing && !row.vaccineName.trim() ? "border-destructive" : ""}
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <DateInput
                        value={row.date ?? ""}
                        onChange={(v) => patch(row.key, { date: v || null })}
                        clearable
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.doseNumber != null ? String(row.doseNumber) : ""}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          patch(row.key, { doseNumber: Number.isFinite(n) ? n : null });
                        }}
                        inputMode="numeric"
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <Input
                        value={row.manufacturer ?? ""}
                        onChange={(e) => patch(row.key, { manufacturer: e.target.value || null })}
                      />
                    </TableCell>
                    <TableCell className="min-w-28">
                      <Input
                        value={row.batchNumber ?? ""}
                        onChange={(e) => patch(row.key, { batchNumber: e.target.value || null })}
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <DateInput
                        value={row.expiresAt ?? ""}
                        onChange={(v) => patch(row.key, { expiresAt: v || null })}
                        clearable
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
          {t("importWizard.vaccineReview.save", { count: String(included.length) })}
        </Button>
      </div>
    </>
  );
}
