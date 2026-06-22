import * as React from "react";
import { subMonths } from "date-fns";
import { FileDown } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/app/Toast";
import { getDoctorReportData, type DoctorReportSection } from "@/db/repos";
import { exportDoctorReportPdf } from "@/lib/doctor-report-pdf";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";

type RangePreset = "last6m" | "last12m" | "all" | "custom";

const SECTION_KEYS: DoctorReportSection[] = [
  "diagnoses",
  "medications",
  "allergies",
  "labs",
  "visits",
  "imaging",
  "vaccines",
  "lifestyle",
];

const isoFromDate = (d: Date) => d.toISOString().slice(0, 10);

export function DoctorReport() {
  const { profileId } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();

  const locale = lang === "ru" ? "ru-RU" : "en-GB";

  const [preset, setPreset] = React.useState<RangePreset>("last12m");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");
  const [sections, setSections] = React.useState<Record<DoctorReportSection, boolean>>(
    () =>
      Object.fromEntries(SECTION_KEYS.map((s) => [s, true])) as Record<
        DoctorReportSection,
        boolean
      >,
  );
  const [generating, setGenerating] = React.useState(false);

  const toggleSection = (key: DoctorReportSection) =>
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const resolveRange = (): { fromDate: string | null; toDate: string | null } => {
    switch (preset) {
      case "last6m":
        return { fromDate: isoFromDate(subMonths(new Date(), 6)), toDate: null };
      case "last12m":
        return { fromDate: isoFromDate(subMonths(new Date(), 12)), toDate: null };
      case "all":
        return { fromDate: null, toDate: null };
      case "custom":
        return { fromDate: customFrom || null, toDate: customTo || null };
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { fromDate, toDate } = resolveRange();
      const data = await getDoctorReportData(profileId, { fromDate, toDate, sections });
      if (!data) return;
      const saved = await exportDoctorReportPdf(data, { t, locale });
      toast.show(saved ? t("doctorReport.saved") : t("doctorReport.cancelled"));
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <PageHeader
        back="/"
        breadcrumbs={crumbs(
          { label: t("nav.dashboard"), to: "/" },
          { label: t("doctorReport.title") },
        )}
        title={t("doctorReport.title")}
        description={t("doctorReport.description")}
      />

      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t("doctorReport.intro")}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("doctorReport.rangeLabel")} className="sm:col-span-1">
                <SelectMenu
                  value={preset}
                  onChange={(v) => setPreset(v as RangePreset)}
                  options={[
                    { value: "last6m", label: t("doctorReport.range.last6m") },
                    { value: "last12m", label: t("doctorReport.range.last12m") },
                    { value: "all", label: t("doctorReport.range.all") },
                    { value: "custom", label: t("doctorReport.range.custom") },
                  ]}
                />
              </Field>

              {preset === "custom" && (
                <>
                  <Field label={t("doctorReport.from")}>
                    <DateInput
                      value={customFrom}
                      onChange={setCustomFrom}
                      clearable
                      disableFuture
                    />
                  </Field>
                  <Field label={t("doctorReport.to")}>
                    <DateInput value={customTo} onChange={setCustomTo} clearable disableFuture />
                  </Field>
                </>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t("doctorReport.sectionsLabel")}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {SECTION_KEYS.map((key) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sections[key]}
                      onChange={() => toggleSection(key)}
                      className="size-4 rounded border-input accent-primary"
                    />
                    {t(`doctorReport.sections.${key}`)}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Button onClick={() => void handleGenerate()} disabled={generating}>
                <FileDown />
                {generating ? t("doctorReport.generating") : t("doctorReport.generate")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
