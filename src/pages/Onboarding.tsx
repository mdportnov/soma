import * as React from "react";
import { ArrowLeft, ArrowRight, Check, HeartPulse, Loader2, ShieldCheck } from "lucide-react";
import { completeOnboarding } from "@/db/repos";
import {
  CoreFields,
  OptionalFields,
  draftToUpdate,
  useProfileDraft,
} from "@/components/app/ProfileFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StepId = "welcome" | "core" | "optional" | "done";
const ORDER: StepId[] = ["welcome", "core", "optional", "done"];

/**
 * First-run onboarding wizard. Collects the profile data needed for
 * sex/age-aware biomarker reference ranges before the dashboard is shown.
 * Optional steps can be skipped. On finish it stamps `onboardedAt`.
 */
export function Onboarding({ profileId, onDone }: { profileId: number; onDone: () => void }) {
  const { draft, patch } = useProfileDraft();
  const [step, setStep] = React.useState<StepId>("welcome");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const index = ORDER.indexOf(step);
  const coreValid = draft.name.trim().length > 0 && draft.birthDate !== "" && draft.sex !== "";

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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HeartPulse className="size-4.5" />
          </div>
          <span className="text-base font-semibold tracking-tight">Soma</span>
        </div>

        {/* progress dots (skip the welcome/done framing screens) */}
        <div className="mb-4 flex items-center justify-center gap-1.5">
          {ORDER.map((id, i) => (
            <span
              key={id}
              className={
                "h-1.5 rounded-full transition-all " +
                (i <= index ? "w-6 bg-primary" : "w-3 bg-muted")
              }
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === "welcome" && (
          <Card>
            <CardHeader>
              <CardTitle>Welcome to Soma</CardTitle>
              <CardDescription>
                Your private, local-first health dashboard. Let&apos;s set up your profile so lab
                results can be checked against the right reference ranges for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                Everything you enter stays on this device. It takes about a minute.
              </p>
              <div className="flex justify-end">
                <Button onClick={() => go("core")}>
                  Get started <ArrowRight />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "core" && (
          <Card>
            <CardHeader>
              <CardTitle>About you</CardTitle>
              <CardDescription>
                Biological sex and age determine which reference ranges apply to your biomarkers, so
                these are required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <CoreFields draft={draft} patch={patch} />
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => go("welcome")}>
                  <ArrowLeft /> Back
                </Button>
                <Button disabled={!coreValid} onClick={() => go("optional")}>
                  Continue <ArrowRight />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "optional" && (
          <Card>
            <CardHeader>
              <CardTitle>A bit more (optional)</CardTitle>
              <CardDescription>
                These refine some reference ranges and help track goals. Skip anything you&apos;d
                rather not share — you can edit it later in Settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <OptionalFields draft={draft} patch={patch} />
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => go("core")}>
                  <ArrowLeft /> Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => go("done")}>
                    Skip
                  </Button>
                  <Button onClick={() => go("done")}>
                    Continue <ArrowRight />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card>
            <CardHeader>
              <CardTitle>You&apos;re all set</CardTitle>
              <CardDescription>
                Your profile is ready. Import lab results, log medications and visits, and Soma will
                flag values outside your reference ranges.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {draft.name.trim() || "Profile"} — saved locally.
              </p>
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => go("optional")} disabled={saving}>
                  <ArrowLeft /> Back
                </Button>
                <Button onClick={finish} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  Go to dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
