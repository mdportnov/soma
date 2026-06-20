import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, FileDown } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useI18n } from "@/lib/i18n";
import { getEmergencyCard, type EmergencyCardData } from "@/db/repos";
import type { Allergy } from "@/db/schema";
import { exportEmergencyCardHtml, severityClass } from "@/lib/emergency-export";
import { exportEmergencyCardPdf } from "@/lib/emergency-pdf";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, todayISO } from "@/lib/utils";

function ageFromBirthDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function severityVariant(severity: Allergy["severity"]): "secondary" | "warning" | "destructive" {
  const cls = severityClass(severity);
  return cls === "danger" ? "destructive" : cls === "warn" ? "warning" : "secondary";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-muted-foreground">{children}</p>;
}

export function EmergencyCard() {
  const { t, lang } = useI18n();
  const { profileId } = useApp();
  const { data, loading } = useQuery(() => getEmergencyCard(profileId), [profileId]);
  const [exporting, setExporting] = React.useState<"html" | "pdf" | null>(null);
  const [error, setError] = React.useState(false);

  if (loading || !data) return <Loading />;

  const locale = lang === "ru" ? "ru-RU" : "en-GB";

  const runExport = async (kind: "html" | "pdf", fn: () => Promise<boolean>) => {
    setExporting(kind);
    setError(false);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader
        back="/"
        breadcrumbs={crumbs(
          { label: t("nav.dashboard"), to: "/" },
          { label: t("emergency.openCard") },
        )}
        title={t("emergency.title")}
        description={t("emergency.description")}
        actions={
          <>
            <Button
              variant="outline"
              disabled={exporting !== null}
              onClick={() =>
                void runExport("html", () => exportEmergencyCardHtml(data, { t, locale }))
              }
            >
              <Download /> {t("emergency.exportHtml")}
            </Button>
            <Button
              disabled={exporting !== null}
              onClick={() =>
                void runExport("pdf", () => exportEmergencyCardPdf(data, { t, locale }))
              }
            >
              <FileDown /> {t("emergency.exportPdf")}
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("emergency.exportError")}
        </div>
      )}

      <Body data={data} locale={locale} />
    </>
  );
}

function Body({ data, locale }: { data: EmergencyCardData; locale: string }) {
  const { t } = useI18n();
  const p = data.profile;
  const fd = (iso: string | null | undefined) =>
    iso
      ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

  const age = ageFromBirthDate(p.birthDate);
  const sexLabel = p.sex
    ? t(`profile.options.${p.sex === "other" ? "otherIntersex" : p.sex}`)
    : "—";
  const bloodNumeral: Record<string, string> = { O: "I", A: "II", B: "III", AB: "IV" };
  const blood = p.bloodType
    ? `${p.bloodType}${p.rhFactor === "positive" ? "+" : p.rhFactor === "negative" ? "−" : ""} (${bloodNumeral[p.bloodType]}${p.rhFactor === "positive" ? " Rh+" : p.rhFactor === "negative" ? " Rh−" : ""})`
    : "—";

  const hasContact = !!(p.emergencyContactName || p.emergencyContactPhone);
  const incomplete = !p.bloodType || !hasContact;
  const today = todayISO();

  return (
    <div className="space-y-4">
      {incomplete && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {t("emergency.incompleteBanner")}{" "}
            <Link to="/settings" className="font-medium underline">
              {t("emergency.updateProfile")}
            </Link>
          </p>
        </div>
      )}

      <Section title={t("emergency.sections.identity")}>
        <FieldRow label={t("emergency.identity.name")} value={p.name || "—"} />
        <FieldRow
          label={t("emergency.identity.dob")}
          value={
            p.birthDate
              ? `${fd(p.birthDate)}${age != null ? ` · ${t("emergency.identity.ageValue", { years: String(age) })}` : ""}`
              : "—"
          }
        />
        <FieldRow label={t("emergency.identity.sex")} value={sexLabel} />
        <FieldRow label={t("emergency.identity.bloodType")} value={blood} />
        {p.citizenship && (
          <FieldRow label={t("emergency.identity.citizenship")} value={p.citizenship} />
        )}
        {p.languages && <FieldRow label={t("emergency.identity.languages")} value={p.languages} />}
      </Section>

      {(p.pregnancyStatus || p.codeStatus || p.organDonor != null) && (
        <Card className="border-l-4 border-l-destructive">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
              {t("emergency.sections.criticalStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {p.pregnancyStatus && p.pregnancyStatus !== "not_pregnant" && (
              <FieldRow
                label={t("emergency.criticalStatus.pregnancy")}
                value={t(`emergency.criticalStatus.pregnancyValues.${p.pregnancyStatus}`)}
              />
            )}
            {p.codeStatus && (
              <FieldRow
                label={t("emergency.criticalStatus.codeStatus")}
                value={t(`emergency.criticalStatus.codeStatusValues.${p.codeStatus}`)}
              />
            )}
            {p.organDonor != null && (
              <FieldRow
                label={t("emergency.criticalStatus.organDonor")}
                value={t(
                  p.organDonor ? "emergency.criticalStatus.yes" : "emergency.criticalStatus.no",
                )}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Section title={t("emergency.sections.contact")}>
        {hasContact ? (
          <>
            <FieldRow label={t("emergency.contact.name")} value={p.emergencyContactName || "—"} />
            <FieldRow label={t("emergency.contact.phone")} value={p.emergencyContactPhone || "—"} />
            <FieldRow
              label={t("emergency.contact.relation")}
              value={p.emergencyContactRelation || "—"}
            />
          </>
        ) : (
          <EmptyText>{t("emergency.contact.empty")}</EmptyText>
        )}
      </Section>

      <Section title={t("emergency.sections.insurance")}>
        {p.insurer || p.insurancePolicyNumber || p.insurancePhone ? (
          <>
            {p.insurer && <FieldRow label={t("emergency.insurance.insurer")} value={p.insurer} />}
            {p.insurancePolicyNumber && (
              <FieldRow
                label={t("emergency.insurance.policyNumber")}
                value={p.insurancePolicyNumber}
              />
            )}
            {p.insurancePhone && (
              <FieldRow label={t("emergency.insurance.phone")} value={p.insurancePhone} />
            )}
          </>
        ) : (
          <EmptyText>{t("emergency.emptyInsurance")}</EmptyText>
        )}
      </Section>

      <Section title={t("emergency.sections.allergies")}>
        {data.activeAllergies.length === 0 && data.resolvedAllergies.length === 0 ? (
          <EmptyText>{t("emergency.allergies.none")}</EmptyText>
        ) : (
          <ul className="divide-y">
            {data.activeAllergies.map((a) => (
              <AllergyRow key={a.id} allergy={a} resolved={false} />
            ))}
            {data.resolvedAllergies.map((a) => (
              <AllergyRow key={a.id} allergy={a} resolved />
            ))}
          </ul>
        )}
      </Section>

      {p.emergencyNotes && p.emergencyNotes.trim() && (
        <Card className="border-l-4 border-l-warning">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
              {t("emergency.sections.notes")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{p.emergencyNotes.trim()}</p>
          </CardContent>
        </Card>
      )}

      <Section title={t("emergency.sections.medications")}>
        {data.activeMedications.length === 0 && data.asNeededMedications.length === 0 ? (
          <EmptyText>{t("emergency.medications.none")}</EmptyText>
        ) : (
          <>
            {data.activeMedications.length > 0 && (
              <ul className="divide-y">
                {data.activeMedications.map((m) => (
                  <MedRow key={m.id} med={m} fd={fd} t={t} />
                ))}
              </ul>
            )}
            {data.asNeededMedications.length > 0 && (
              <>
                <p className="mt-3 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("emergency.medications.asNeededTitle")}
                </p>
                <ul className="divide-y">
                  {data.asNeededMedications.map((m) => (
                    <MedRow key={m.id} med={m} fd={fd} t={t} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Section>

      <Section title={t("emergency.sections.diagnoses")}>
        {data.activeDiagnoses.length === 0 ? (
          <EmptyText>{t("emergency.diagnoses.none")}</EmptyText>
        ) : (
          <ul className="divide-y">
            {data.activeDiagnoses.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm"
              >
                <span className="font-medium">{d.name}</span>
                {d.icdCode && (
                  <Badge variant="secondary" className="text-xs">
                    {d.icdCode}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{fd(d.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("emergency.sections.vaccines")}>
        {data.recentVaccines.length === 0 ? (
          <EmptyText>{t("emergency.vaccines.none")}</EmptyText>
        ) : (
          <ul className="divide-y">
            {data.recentVaccines.map((v) => {
              const expired = !!v.expiresAt && v.expiresAt.slice(0, 10) < today;
              return (
                <li
                  key={v.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm"
                >
                  <span className="font-medium">{v.vaccineName}</span>
                  <span className="text-muted-foreground">{fd(v.date)}</span>
                  {v.dose != null && (
                    <span className="text-xs text-muted-foreground">
                      {t("emergency.vaccines.doseValue", { n: String(v.dose) })}
                    </span>
                  )}
                  {v.expiresAt && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {t("emergency.vaccines.expires")} {fd(v.expiresAt)}
                      {expired && (
                        <Badge variant="warning" className="text-xs">
                          {t("emergency.vaccines.expired")}
                        </Badge>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <p className="pt-2 text-xs text-muted-foreground">
        {t("emergency.footer", { date: formatDate(today) })}
      </p>
    </div>
  );
}

function MedRow({
  med: m,
  fd,
  t,
}: {
  med: EmergencyCardData["activeMedications"][number];
  fd: (iso: string | null | undefined) => string;
  t: (key: string) => string;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
      <span className="font-medium">{m.name}</span>
      {m.doseAmount != null && (
        <span className="text-muted-foreground">
          {m.doseAmount}
          {m.doseUnit ? ` ${m.doseUnit}` : ""}
        </span>
      )}
      {m.schedule?.frequency && (
        <span className="text-muted-foreground">{m.schedule.frequency.replaceAll("_", " ")}</span>
      )}
      <span className="text-xs text-muted-foreground">
        {t("emergency.medications.since")} {fd(m.startDate)}
      </span>
    </li>
  );
}

function AllergyRow({ allergy: a, resolved }: { allergy: Allergy; resolved: boolean }) {
  const { t } = useI18n();
  return (
    <li
      className={
        "flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" + (resolved ? " opacity-60" : "")
      }
    >
      <span className="font-medium">{a.allergen}</span>
      <Badge variant={severityVariant(a.severity)}>{t(`allergySeverity.${a.severity}`)}</Badge>
      {resolved && <Badge variant="secondary">{t("emergency.allergies.resolved")}</Badge>}
      {a.reaction && <span className="text-muted-foreground">{a.reaction}</span>}
    </li>
  );
}
