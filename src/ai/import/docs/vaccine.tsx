/**
 * Vaccination-certificate import module.
 *
 * Each extracted dose is matched against the antigen library (`vaccine-vocab.ts`)
 * so a Russian "ОПВ" / "АКДС" / "ЖКВ" — or any country's shorthand — is stored
 * under the canonical antigen the vaccine calendar grades against, and lights up
 * the schedule the moment it's saved. Confident matches (exact/alias) with a date
 * are pre-selected; fuzzy, unmatched or undated rows start unchecked for the user
 * to confirm or correct. The model never guesses: unreadable fields become null.
 */

import { Syringe } from "lucide-react";
import { VACCINE_EXTRACTION_PROMPT } from "../../prompts";
import type { RawVaccineExtraction } from "../../types";
import type { DocTypeModule, ReviewProps } from "../registry";
import { asArray, asObject, intOrNull, isoDateOrNull, nullableStr } from "../validate";
import {
  resolveVaccine,
  antigenById,
  VACCINE_ANTIGEN_OPTIONS,
  type VaccineMatch,
} from "../vaccine-vocab";
import { ReviewBanner } from "../ReviewBanner";
import { storeSourceAttachment } from "../save-helpers";
import { createVaccine } from "@/db/repos";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
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

type VaccineRow = RawVaccineExtraction & {
  include: boolean;
  key: number;
  /** Library antigen this dose resolved to, or null when nothing matched. */
  match: VaccineMatch | null;
};

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
      disease: nullableStr(o.disease),
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
    return {
      rows: vaccines.map((v, i) => {
        const match = resolveVaccine(v.vaccineName, v.disease);
        // Pre-select rows we're confident about (named antigen + a date); leave
        // fuzzy / unmatched / undated rows for the user to confirm.
        const include =
          !!v.date && (match?.confidence === "exact" || match?.confidence === "alias");
        return { ...v, match, include, key: i };
      }),
    };
  },

  isEmpty: (draft) => draft.rows.length === 0,

  Review: VaccineReview,

  async save(draft, ctx): Promise<string> {
    const attachmentId = await storeSourceAttachment(ctx, "vaccination_cert", "vaccine");
    const included = draft.rows.filter((r) => r.include && r.vaccineName.trim() && r.date);
    for (const r of included) {
      // Store the canonical antigen name when matched, so the calendar recognises
      // the dose; preserve the printed original in notes so nothing is lost.
      const printed = r.vaccineName.trim();
      const storedName = r.match ? r.match.name : printed;
      const note =
        r.match && r.match.name.toLowerCase() !== printed.toLowerCase()
          ? `Imported as «${printed}»`
          : null;
      await createVaccine({
        profileId: ctx.profileId,
        vaccineName: storedName,
        date: r.date!,
        manufacturer: r.manufacturer?.trim() || null,
        batchNumber: r.batchNumber?.trim() || null,
        dose: r.doseNumber ?? null,
        expiresAt: r.expiresAt || null,
        notes: note,
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
  const allSelected = rows.length > 0 && rows.every((r) => r.include);

  const patch = (key: number, p: Partial<VaccineRow>) =>
    setDraft({ rows: rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });

  const toggleAll = () => setDraft({ rows: rows.map((r) => ({ ...r, include: !allSelected })) });

  // An explicit "no match" row so the user can unset an antigen (the Combobox
  // never emits an empty selection on its own).
  const NONE = "__none__";
  const antigenOptions = [
    { value: NONE, label: t("importWizard.vaccineReview.noMatch") },
    ...VACCINE_ANTIGEN_OPTIONS,
  ];

  const matchBadge = (match: VaccineMatch | null) => {
    if (!match) return <Badge variant="secondary">{t("importWizard.vaccineReview.noMatch")}</Badge>;
    if (match.confidence === "fuzzy")
      return <Badge variant="warning">{t("importWizard.verifyBadge")}</Badge>;
    return null;
  };

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
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={t("importWizard.vaccineReview.selectAll")}
                  />
                </TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.vaccine")}</TableHead>
                <TableHead className="min-w-52">
                  {t("importWizard.vaccineReview.columns.match")}
                </TableHead>
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
                    <TableCell className="min-w-40">
                      <Input
                        value={row.vaccineName}
                        onChange={(e) => patch(row.key, { vaccineName: e.target.value })}
                        className={missing && !row.vaccineName.trim() ? "border-destructive" : ""}
                      />
                    </TableCell>
                    <TableCell className="min-w-52">
                      <div className="flex items-center gap-1.5">
                        <Combobox
                          value={row.match?.entryId ?? null}
                          onChange={(v) =>
                            patch(row.key, { match: v && v !== NONE ? antigenById(v) : null })
                          }
                          options={antigenOptions}
                          placeholder={t("importWizard.vaccineReview.noMatch")}
                        />
                        {matchBadge(row.match)}
                      </div>
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
