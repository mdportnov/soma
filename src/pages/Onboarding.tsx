import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { completeOnboarding } from "@/db/repos";
import { useI18n } from "@/lib/i18n";
import { SECTION_GROUPS, saveInterests, type SectionGroup } from "@/lib/interests";
import {
  CoreFields,
  OptionalFields,
  draftToUpdate,
  useProfileDraft,
} from "@/components/app/ProfileFields";
import { SectionToggles } from "@/components/app/SectionToggles";
import { RestoreDialog } from "@/components/app/BackupCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutoHeight } from "@/components/ui/auto-height";
import logo from "@/assets/logo.svg";

type StepId = "welcome" | "core" | "interests" | "optional" | "done";
const ORDER: StepId[] = ["welcome", "core", "interests", "optional", "done"];

/**
 * First-run onboarding wizard. Collects the profile data needed for
 * sex/age-aware biomarker reference ranges, then lets the user pick which
 * sections matter to them. Optional steps can be skipped. On finish it stamps
 * `onboardedAt` and persists the section selection.
 *
 * Rendered above the router (see AppContext), so it cannot navigate — the
 * "enable AI" nudge lives on the dashboard's getting-started checklist instead.
 */
export function Onboarding({ profileId, onDone }: { profileId: number; onDone: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { draft, patch } = useProfileDraft();
  const [step, setStep] = React.useState<StepId>("welcome");
  const [groups, setGroups] = React.useState<Set<SectionGroup>>(() => new Set(SECTION_GROUPS));
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const index = ORDER.indexOf(step);
  const coreValid = draft.name.trim().length > 0 && draft.birthDate !== "" && draft.sex !== "";
  const firstName = draft.name.trim().split(/\s+/)[0];

  const go = (id: StepId) => {
    setError(null);
    setStep(id);
  };

  const toggleGroup = (g: SectionGroup) =>
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      saveInterests(groups);
      await completeOnboarding(profileId, draftToUpdate(draft));
      onDone();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  // Enter submits the current step (when valid) — the primary buttons are submit.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "welcome") go("core");
    else if (step === "core") {
      if (coreValid) go("interests");
    } else if (step === "interests") go("optional");
    else if (step === "optional") go("done");
    else void finish();
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

      {/* Language is a setting, not part of the centered flow — pin it to the corner. */}
      <div
        className="absolute right-6 top-6 z-10 flex rounded-lg border bg-card/60 p-0.5 backdrop-blur"
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

        {/* AutoHeight eases the card between sizes; key={step} re-mounts so each
            step slides in, and a language change reflows the copy smoothly too. */}
        <AutoHeight>
          <form key={step} onSubmit={onSubmit} className="animate-step-in">
          {step === "welcome" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("onboarding.welcomeTitle")}</CardTitle>
                <CardDescription className="text-sm">
                  {t("onboarding.welcomeDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  {t("onboarding.privacyNote")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("onboarding.disclaimer")}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="text-muted-foreground"
                    onClick={() => setRestoreOpen(true)}
                  >
                    <RotateCcw /> {t("onboarding.restore")}
                  </Button>
                  <Button type="submit">
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
                  <Button
                    type="button"
                    variant="outline"
                    className="text-muted-foreground"
                    onClick={() => go("welcome")}
                  >
                    <ArrowLeft /> {t("common.back")}
                  </Button>
                  <Button type="submit" disabled={!coreValid}>
                    {t("common.continue")} <ArrowRight />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "interests" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("onboarding.interestsTitle")}</CardTitle>
                <CardDescription className="text-sm">
                  {t("onboarding.interestsDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <SectionToggles enabled={groups} onToggle={toggleGroup} />
                <p className="text-xs text-muted-foreground">{t("onboarding.interestsHint")}</p>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className="text-muted-foreground"
                    onClick={() => go("core")}
                  >
                    <ArrowLeft /> {t("common.back")}
                  </Button>
                  <Button type="submit">
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
                  <Button
                    type="button"
                    variant="outline"
                    className="text-muted-foreground"
                    onClick={() => go("interests")}
                  >
                    <ArrowLeft /> {t("common.back")}
                  </Button>
                  {/* Fields are optional, so Continue doubles as Skip. */}
                  <Button type="submit">
                    {t("common.continue")} <ArrowRight />
                  </Button>
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
                  <Button
                    type="button"
                    variant="outline"
                    className="text-muted-foreground"
                    onClick={() => go("optional")}
                    disabled={saving}
                  >
                    <ArrowLeft /> {t("common.back")}
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    {t("onboarding.openDashboard")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          </form>
        </AutoHeight>
      </div>

      {restoreOpen && <RestoreDialog onClose={() => setRestoreOpen(false)} />}
    </div>
  );
}
