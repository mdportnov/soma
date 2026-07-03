import * as React from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import type { Biomarker } from "@/db/schema";
import { getConfiguredProvider } from "@/ai";
import { AIProviderError, type AIProvider } from "@/ai/types";
import { buildTrendInterpretationPrompt, TREND_INTERPRETATION_SYSTEM } from "@/ai/prompts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { useI18n } from "@/lib/i18n";
import { formatValue } from "@/lib/utils";
import {
  getInterpretation,
  interpretationKey,
  setInterpretation,
} from "@/lib/interpretation-cache";

type Point = { date: string; value: number; flag: string | null };

type BioRanges = Pick<
  Biomarker,
  | "canonicalName"
  | "defaultUnit"
  | "refLow"
  | "refHigh"
  | "optimalLow"
  | "optimalHigh"
  | "direction"
>;

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; text: string; cached: boolean }
  | { phase: "error"; message: string };

/**
 * "AI interpretation" card for a single biomarker's trend (§8). Renders nothing
 * until a provider is configured (AI is opt-in), and shows the mandatory
 * disclaimer under every answer. Vendor-agnostic — runs through `AIProvider.chat`.
 */
export function AiInterpretation({
  bio,
  points,
  medications,
}: {
  bio: BioRanges;
  /** Oldest-first readings for the charted period. */
  points: Point[];
  /** Names of medications taken during the charted period. */
  medications: string[];
}) {
  const { t } = useI18n();
  const [provider, setProvider] = React.useState<AIProvider | null | undefined>(undefined);
  const [state, setState] = React.useState<State>({ phase: "idle" });

  React.useEffect(() => {
    let alive = true;
    getConfiguredProvider().then((p) => alive && setProvider(p));
    return () => {
      alive = false;
    };
  }, []);

  const range = (lo: number | null, hi: number | null) =>
    lo != null && hi != null ? `${formatValue(lo)}–${formatValue(hi)} ${bio.defaultUnit}` : null;
  const referenceRange = range(bio.refLow, bio.refHigh);
  const optimalRange = range(bio.optimalLow, bio.optimalHigh);
  const cacheKey = interpretationKey({
    name: bio.canonicalName,
    direction: bio.direction,
    referenceRange,
    optimalRange,
    points,
    medications,
  });

  // Show a previously-generated interpretation for this exact data instead of
  // re-charging the API on every revisit; changing data yields a new key.
  React.useEffect(() => {
    const cached = getInterpretation(cacheKey);
    setState(cached ? { phase: "done", text: cached, cached: true } : { phase: "idle" });
  }, [cacheKey]);

  // AI disabled (or still resolving) → stay out of the way. A trend needs at
  // least two readings to be worth interpreting.
  if (!provider || points.length < 2) return null;

  const run = async () => {
    setState({ phase: "loading" });
    try {
      const text = await provider.chat(
        [
          {
            role: "user",
            content: buildTrendInterpretationPrompt({
              name: bio.canonicalName,
              unit: bio.defaultUnit,
              referenceRange,
              optimalRange,
              direction: bio.direction,
              points,
              medications,
            }),
          },
        ],
        TREND_INTERPRETATION_SYSTEM,
      );
      setInterpretation(cacheKey, text);
      setState({ phase: "done", text, cached: false });
    } catch (e) {
      setState({ phase: "error", message: aiErrorMessage(e, t) });
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {t("aiInterpretation.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {state.phase === "idle" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground">{t("aiInterpretation.prompt")}</p>
            <Button size="sm" onClick={run}>
              <Sparkles /> {t("aiInterpretation.button")}
            </Button>
          </div>
        )}
        {state.phase === "loading" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("aiInterpretation.loading")}
          </p>
        )}
        {state.phase === "error" && (
          <div className="flex flex-col items-start gap-2">
            <p className="flex items-start gap-1.5 text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </p>
            <Button size="sm" variant="outline" onClick={run}>
              {t("aiInterpretation.retry")}
            </Button>
          </div>
        )}
        {state.phase === "done" && (
          <div>
            <p className="whitespace-pre-wrap leading-relaxed">{state.text}</p>
            <AiDisclaimer />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={run}>
                {t("aiInterpretation.regenerate")}
              </Button>
              {state.cached && (
                <span className="text-[11px] text-muted-foreground">
                  {t("aiInterpretation.cached")}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Maps a provider failure to a friendly, localized message. */
export function aiErrorMessage(e: unknown, t: (key: string) => string): string {
  if (e instanceof AIProviderError) {
    return e.kind === "auth" ? t("aiInterpretation.errorAuth") : t("aiInterpretation.errorGeneric");
  }
  return e instanceof Error ? e.message : String(e);
}
