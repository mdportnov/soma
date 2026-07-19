import { Link } from "react-router-dom";
import { Check, FileUp, Pill, Rocket, Sparkles, type LucideIcon } from "lucide-react";
import { useDismissed } from "@/hooks/useDismissed";
import { loadInterests } from "@/lib/interests";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { settingsPath } from "@/lib/settings-navigation";

type Step = {
  done: boolean;
  icon: LucideIcon;
  label: string;
  to: string;
  /** Only show a step the user opted into (a med step is noise if meds are off). */
  show: boolean;
};

/**
 * First-run checklist on the dashboard. Each step self-completes from real data
 * (a lab exists, a medication exists, AI actually works), and only steps the
 * user opted into via their section interests are shown — so it never nudges
 * toward a section they hid. The whole card disappears once everything is done
 * or the user dismisses it, replacing a hollow "all calm" verdict on an empty
 * account with something actionable.
 */
export function GettingStarted({
  hasLabs,
  hasMeds,
  aiEnabled,
}: {
  hasLabs: boolean;
  hasMeds: boolean;
  aiEnabled: boolean;
}) {
  const { t } = useI18n();
  const { dismissed, dismiss } = useDismissed("getting-started");
  const enabled = loadInterests();

  const steps: Step[] = [
    {
      done: hasLabs,
      icon: FileUp,
      label: t("gettingStarted.importLab"),
      to: "/labs/import",
      show: true,
    },
    {
      done: hasMeds,
      icon: Pill,
      label: t("gettingStarted.addMed"),
      to: "/medications",
      show: enabled.has("meds"),
    },
    {
      done: aiEnabled,
      icon: Sparkles,
      label: t("gettingStarted.enableAi"),
      to: settingsPath("ai"),
      show: enabled.has("ai"),
    },
  ].filter((s) => s.show);

  if (dismissed || steps.length === 0 || steps.every((s) => s.done)) return null;

  return (
    <Card className="mb-6 border-primary/30">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Rocket className="size-4 text-primary" /> {t("gettingStarted.title")}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t("gettingStarted.description")}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          {t("gettingStarted.skip")}
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {steps.map((s) => (
            <li key={s.to} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  s.done ? "bg-success/15 text-success" : "bg-secondary text-secondary-foreground",
                )}
              >
                {s.done ? <Check className="size-4" /> : <s.icon className="size-4" />}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-sm",
                  s.done && "text-muted-foreground line-through",
                )}
              >
                {s.label}
              </span>
              {!s.done && (
                <Link to={s.to}>
                  <Button size="sm" variant="outline">
                    {t("gettingStarted.cta")}
                  </Button>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
