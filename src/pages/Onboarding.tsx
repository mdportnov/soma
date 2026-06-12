import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { completeOnboarding } from "@/db/repos";
import { useI18n } from "@/lib/i18n";
import {
  CoreFields,
  OptionalFields,
  draftToUpdate,
  useProfileDraft,
} from "@/components/app/ProfileFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import logo from "@/assets/logo.svg";

type StepId = "welcome" | "core" | "optional" | "done";
const ORDER: StepId[] = ["welcome", "core", "optional", "done"];

/**
 * First-run onboarding wizard. Collects the profile data needed for
 * sex/age-aware biomarker reference ranges before the dashboard is shown.
 * Optional steps can be skipped. On finish it stamps `onboardedAt`.
 */
export function Onboarding({ profileId, onDone }: { profileId: number; onDone: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { draft, patch } = useProfileDraft();
  const [step, setStep] = React.useState<StepId>("welcome");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const index = ORDER.indexOf(step);
  const coreValid = draft.name.trim().length > 0 && draft.birthDate !== "" && draft.sex !== "";
  const firstName = draft.name.trim().split(/\s+/)[0];

  const go = (id: StepId) => {
    setError(null);
    setStep(id);
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding(profileId, draftToUpdate(draft));
      onDone();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {/* soft brand glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--primary) 14%, transparent) 0%, transparent 65%)",
        }}
      />

      <div className="animate-rise-in relative w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src={logo} alt="" className="size-9" />
          <span className="text-lg font-semibold tracking-tight">Soma</span>
        </div>

        <div className="mb-5 flex items-center justify-center gap-1.5">
          {ORDER.map((id, i) => (
            <span
              key={id}
              className={
                "h-1.5 rounded-full transition-all duration-300 " +
                (i === index ? "w-6 bg-primary" : i < index ? "w-3 bg-primary/50" : "w-3 bg-muted")
              }
            />
          ))}
        </div>

        {error && (
          <div className="animate-step-in mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* key={step} re-mounts the card so each step slides in */}
        <div key={step} className="animate-step-in">
          {step === "welcome" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">{t("onboarding.welcomeTitle")}</CardTitle>
                  <div
                    className="flex shrink-0 rounded-lg border p-0.5"
                    aria-label={t("onboarding.language")}
                  >
                    {(["en", "ru"] as const).map((l) => (
                      <Button
                        key={l}
                        size="sm"
                        variant={lang === l ? "secondary" : "ghost"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setLang(l)}
                      >
                        {l.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
                <CardDescription className="text-sm">
                  {t("onboarding.welcomeDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  {t("onboarding.privacyNote")}
                </p>
                <div className="flex justify-end">
                  <Button onClick={() => go("core")}>
                    {t("onboarding.getStarted")} <ArrowRight />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "core" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("onboarding.aboutYouTitle")}</CardTitle>
                <CardDescription className="text-sm">
                  {t("onboarding.aboutYouDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <CoreFields draft={draft} patch={patch} />
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => go("welcome")}>
                    <ArrowLeft /> {t("common.back")}
                  </Button>
                  <Button disabled={!coreValid} onClick={() => go("optional")}>
                    {t("common.continue")} <ArrowRight />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "optional" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("onboarding.fineTuningTitle")}</CardTitle>
                <CardDescription className="text-sm">
                  {t("onboarding.fineTuningDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <OptionalFields draft={draft} patch={patch} />
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => go("core")}>
                    <ArrowLeft /> {t("common.back")}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => go("done")}>
                      {t("common.skipForNow")}
                    </Button>
                    <Button onClick={() => go("done")}>
                      {t("common.continue")} <ArrowRight />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "done" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {firstName
                    ? t("onboarding.allSetTitleWithName", { name: firstName })
                    : t("onboarding.allSetTitle")}
                </CardTitle>
                <CardDescription className="text-sm">
                  {t("onboarding.allSetDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  {t("onboarding.tip")}
                </p>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => go("optional")} disabled={saving}>
                    <ArrowLeft /> {t("common.back")}
                  </Button>
                  <Button onClick={finish} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    {t("onboarding.openDashboard")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
