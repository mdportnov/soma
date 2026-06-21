/**
 * Imaging-report import module.
 *
 * Radiology / MRI / CT / X-ray / ultrasound report → `imaging_record`. There is
 * no deterministic dictionary fallback, so every extracted study is reviewed
 * manually and starts UNCHECKED — nothing is auto-accepted. The modality is the
 * one field with a controlled enum: it is resolved against IMAGING_MODALITY_VOCAB
 * and any low-confidence resolution is badged for the user to verify.
 */

import { ScanLine } from "lucide-react";
import { IMAGING_EXTRACTION_PROMPT } from "../../prompts";
import type { DocTypeModule, ReviewProps } from "../registry";
import { asArray, asObject, isoDateOrNull, nullableStr } from "../validate";
import { resolveEnum, type ResolveConfidence } from "../resolve";
import { IMAGING_MODALITY_VOCAB, type ImagingModality } from "../vocab";
import { ReviewBanner } from "../ReviewBanner";
import { storeSourceAttachment } from "../save-helpers";
import { createImagingRecord } from "@/db/repos";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
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

type ImagingRow = {
  key: number;
  include: boolean;
  date: string | null;
  modality: ImagingModality;
  modalityRaw: string;
  modalityConfidence: ResolveConfidence;
  bodyArea: string;
  findings: string | null;
  radiologistName: string | null;
  clinic: string | null;
};

export type ImagingDraft = { rows: ImagingRow[] };

const MODALITY_VALUES = ["xray", "ct", "mri", "ultrasound", "pet", "other"] as const;

function validateImaging(parsed: unknown): ImagingRow[] {
  const rows: ImagingRow[] = [];
  let key = 0;
  for (const item of asArray(parsed)) {
    const o = asObject(item);
    if (!o) continue;
    const modalityRaw = nullableStr(o.modality, 80);
    const bodyArea = nullableStr(o.bodyArea, 120);
    // The model returns a JSON array; drop anything with no usable target.
    if (!bodyArea && !modalityRaw) continue;
    const resolution = resolveEnum(modalityRaw, IMAGING_MODALITY_VOCAB, "other");
    rows.push({
      key: key++,
      include: false,
      date: isoDateOrNull(o.date),
      modality: resolution.value,
      modalityRaw: modalityRaw ?? "",
      modalityConfidence: resolution.confidence,
      bodyArea: bodyArea ?? "",
      findings: nullableStr(o.findings, 4000),
      radiologistName: nullableStr(o.radiologistName, 200),
      clinic: nullableStr(o.clinic, 200),
    });
  }
  return rows;
}

export const imagingModule: DocTypeModule<ImagingDraft> = {
  id: "imaging",
  icon: ScanLine,
  i18nKey: "imagingReview",

  async prepare(doc, ctx): Promise<ImagingDraft> {
    const parsed = await ctx.provider.extractStructured(doc, IMAGING_EXTRACTION_PROMPT, 8192);
    return { rows: validateImaging(parsed) };
  },

  isEmpty: (draft) => draft.rows.length === 0,

  Review: ImagingReview,

  async save(draft, ctx): Promise<string> {
    const attachmentId = await storeSourceAttachment(ctx, "imaging", "imaging_record");
    const included = draft.rows.filter((r) => r.include && r.bodyArea.trim());
    for (const r of included) {
      await createImagingRecord({
        profileId: ctx.profileId,
        date: r.date ?? todayISO(),
        modalityType: r.modality,
        bodyArea: r.bodyArea.trim(),
        findings: r.findings?.trim() || null,
        radiologistName: r.radiologistName?.trim() || null,
        clinic: r.clinic?.trim() || null,
        attachmentId,
      });
    }
    return "/imaging";
  },
};

function ImagingReview({ draft, setDraft, onSave }: ReviewProps<ImagingDraft>) {
  const { t } = useI18n();
  const { rows } = draft;
  const included = rows.filter((r) => r.include);
  const canSave = included.length > 0 && included.every((r) => r.bodyArea.trim());

  const modalityOptions = MODALITY_VALUES.map((v) => ({
    value: v,
    label: t(`imagingModality.${v}`),
  }));

  const patch = (key: number, p: Partial<ImagingRow>) =>
    setDraft({ rows: rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });

  return (
    <>
      <ReviewBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.imagingReview.title")}</CardTitle>
          <CardDescription>{t("importWizard.imagingReview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead>{t("importWizard.imagingReview.columns.date")}</TableHead>
                <TableHead>{t("importWizard.imagingReview.columns.modality")}</TableHead>
                <TableHead>{t("importWizard.imagingReview.columns.bodyArea")}</TableHead>
                <TableHead>{t("importWizard.imagingReview.columns.findings")}</TableHead>
                <TableHead>{t("importWizard.imagingReview.columns.facility")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const lowConfidence =
                  row.modalityConfidence === "fallback" || row.modalityConfidence === "fuzzy";
                const missingArea = row.include && !row.bodyArea.trim();
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
                    <TableCell className="min-w-36">
                      <DateInput
                        value={row.date ?? ""}
                        onChange={(v) => patch(row.key, { date: v || null })}
                        clearable
                      />
                    </TableCell>
                    <TableCell className="min-w-44">
                      <div className="flex items-center gap-1.5">
                        <SelectMenu
                          value={row.modality}
                          onChange={(v) => patch(row.key, { modality: v as ImagingModality })}
                          options={modalityOptions}
                          className="min-w-32"
                        />
                        {lowConfidence && (
                          <Badge variant="warning" title={t("needsReview.rowHint")}>
                            {t("importWizard.verifyBadge")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-44">
                      <Input
                        value={row.bodyArea}
                        onChange={(e) => patch(row.key, { bodyArea: e.target.value })}
                        className={missingArea ? "border-destructive" : ""}
                      />
                    </TableCell>
                    <TableCell className="min-w-52">
                      <Input
                        value={row.findings ?? ""}
                        onChange={(e) => patch(row.key, { findings: e.target.value || null })}
                      />
                    </TableCell>
                    <TableCell className="min-w-44">
                      <Input
                        value={row.clinic ?? ""}
                        onChange={(e) => patch(row.key, { clinic: e.target.value || null })}
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
          {t("importWizard.imagingReview.save", { count: String(included.length) })}
        </Button>
      </div>
    </>
  );
}
