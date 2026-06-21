/**
 * Allergy-document import module.
 *
 * Allergy list / record → `allergy[]`. There is no dictionary fallback for
 * allergen names, so every extracted row is reviewed manually and starts
 * UNCHECKED — nothing is auto-accepted.
 *
 * Severity is safety-critical and NOT NULL in the DB. When the model could not
 * read a severity we default to "moderate" but mark the row `severityKnown:false`
 * so the review UI flags it for explicit confirmation. Category resolves through
 * the shared controlled vocabulary, defaulting to "other".
 *
 * Rows whose allergen already exists for the profile are surfaced as duplicates
 * (a non-blocking hint) so the user can skip re-adding them.
 */

import { ShieldAlert } from "lucide-react";
import { ALLERGY_EXTRACTION_PROMPT } from "../../prompts";
import type { DocTypeModule, ReviewProps } from "../registry";
import { asArray, asObject, isoDateOrNull, nullableStr } from "../validate";
import { resolveEnum } from "../resolve";
import {
  ALLERGY_CATEGORY_VOCAB,
  ALLERGY_SEVERITY_VOCAB,
  type AllergyCategory,
  type AllergySeverity,
} from "../vocab";
import { ReviewBanner } from "../ReviewBanner";
import { storeSourceAttachment } from "../save-helpers";
import { createAllergy, listAllergies } from "@/db/repos";
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
import { useI18n } from "@/lib/i18n";

type AllergyRow = {
  key: number;
  include: boolean;
  allergen: string;
  category: AllergyCategory;
  severity: AllergySeverity;
  /** False when the model gave no severity and we defaulted — prompts confirmation. */
  severityKnown: boolean;
  reaction: string | null;
  onsetDate: string | null;
  /** Allergen already exists for this profile — surfaced, not blocked. */
  duplicate: boolean;
};

export type AllergyDraft = { rows: AllergyRow[] };

type ParsedAllergy = {
  allergen: string;
  category: AllergyCategory;
  severity: AllergySeverity;
  severityKnown: boolean;
  reaction: string | null;
  onsetDate: string | null;
};

function validateAllergies(parsed: unknown): ParsedAllergy[] {
  const rows: ParsedAllergy[] = [];
  for (const item of asArray(parsed)) {
    const o = asObject(item);
    if (!o) continue;
    const allergen = nullableStr(o.allergen);
    if (!allergen) continue;
    const rawSeverity = nullableStr(o.severity, 40);
    rows.push({
      allergen,
      category: resolveEnum(nullableStr(o.category, 40), ALLERGY_CATEGORY_VOCAB, "other").value,
      severity: rawSeverity
        ? resolveEnum(rawSeverity, ALLERGY_SEVERITY_VOCAB, "moderate").value
        : "moderate",
      severityKnown: rawSeverity != null,
      reaction: nullableStr(o.reaction, 200),
      onsetDate: isoDateOrNull(o.onsetDate),
    });
  }
  return rows;
}

const CATEGORY_VALUES = ["drug", "food", "environmental", "other"] as const;
const SEVERITY_VALUES = ["mild", "moderate", "severe", "anaphylactic"] as const;

export const allergyModule: DocTypeModule<AllergyDraft> = {
  id: "allergy",
  icon: ShieldAlert,
  i18nKey: "allergyReview",

  async prepare(doc, ctx): Promise<AllergyDraft> {
    const parsed = await ctx.provider.extractStructured(doc, ALLERGY_EXTRACTION_PROMPT, 8192);
    const allergies = validateAllergies(parsed);
    const existing = await listAllergies(ctx.profileId);
    const known = new Set(existing.map((a) => a.allergen.trim().toLowerCase()));
    return {
      rows: allergies.map((a, i) => ({
        ...a,
        key: i,
        include: false,
        duplicate: known.has(a.allergen.trim().toLowerCase()),
      })),
    };
  },

  isEmpty: (draft) => draft.rows.length === 0,

  Review: AllergyReview,

  async save(draft, ctx): Promise<string> {
    await storeSourceAttachment(ctx, "allergy_doc", "allergy");
    const included = draft.rows.filter((r) => r.include && r.allergen.trim());
    for (const r of included) {
      await createAllergy({
        profileId: ctx.profileId,
        allergen: r.allergen.trim(),
        category: r.category,
        severity: r.severity,
        reaction: r.reaction?.trim() || null,
        onsetDate: r.onsetDate || null,
        status: "active",
      });
    }
    return "/allergies";
  },
};

function AllergyReview({ draft, setDraft, onSave }: ReviewProps<AllergyDraft>) {
  const { t } = useI18n();
  const { rows } = draft;
  const included = rows.filter((r) => r.include);
  const canSave = included.length > 0 && included.every((r) => r.allergen.trim());

  const patch = (key: number, p: Partial<AllergyRow>) =>
    setDraft({ rows: rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });

  const categoryOptions = CATEGORY_VALUES.map((v) => ({
    value: v,
    label: t(`allergyCategory.${v}`),
  }));
  const severityOptions = SEVERITY_VALUES.map((v) => ({
    value: v,
    label: t(`allergySeverity.${v}`),
  }));

  return (
    <>
      <ReviewBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.allergyReview.title")}</CardTitle>
          <CardDescription>{t("importWizard.allergyReview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead>{t("importWizard.allergyReview.columns.allergen")}</TableHead>
                <TableHead>{t("importWizard.allergyReview.columns.category")}</TableHead>
                <TableHead>{t("importWizard.allergyReview.columns.severity")}</TableHead>
                <TableHead>{t("importWizard.allergyReview.columns.reaction")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const missing = row.include && !row.allergen.trim();
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
                        value={row.allergen}
                        onChange={(e) => patch(row.key, { allergen: e.target.value })}
                        className={missing ? "border-destructive" : ""}
                      />
                      {row.duplicate && (
                        <div className="mt-1">
                          <Badge
                            variant="warning"
                            title={t("importWizard.allergyReview.duplicateHint")}
                          >
                            {t("importWizard.allergyReview.duplicate")}
                          </Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="min-w-36">
                      <SelectMenu
                        value={row.category}
                        onChange={(v) => patch(row.key, { category: v as AllergyCategory })}
                        options={categoryOptions}
                      />
                    </TableCell>
                    <TableCell className="min-w-40">
                      <SelectMenu
                        value={row.severity}
                        onChange={(v) =>
                          patch(row.key, { severity: v as AllergySeverity, severityKnown: true })
                        }
                        options={severityOptions}
                      />
                      {row.severity === "anaphylactic" ? (
                        <div className="mt-1">
                          <Badge variant="destructive">{t("allergySeverity.anaphylactic")}</Badge>
                        </div>
                      ) : !row.severityKnown ? (
                        <div className="mt-1">
                          <Badge variant="warning" title={t("needsReview.rowHint")}>
                            {t("importWizard.verifyBadge")}
                          </Badge>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-44">
                      <Input
                        value={row.reaction ?? ""}
                        onChange={(e) => patch(row.key, { reaction: e.target.value || null })}
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
          {t("importWizard.allergyReview.save", { count: String(included.length) })}
        </Button>
      </div>
    </>
  );
}
