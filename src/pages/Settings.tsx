import * as React from "react";
import {
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getProfile, updateProfile } from "@/db/repos";
import {
  buildProvider,
  effectiveModelId,
  loadAiSettings,
  modelRegistry,
  saveAiSettings,
  type AiSettings,
} from "@/ai";
import { deleteApiKey, getApiKey, setApiKey } from "@/ai/keystore";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { Field } from "@/components/app/Field";
import {
  CoreFields,
  OptionalFields,
  draftFromProfile,
  draftToUpdate,
  useProfileDraft,
} from "@/components/app/ProfileFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportAllJson, exportLabsCsv } from "@/lib/export";

export function Settings() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="AI providers, profile and data export. Everything stays on this device unless you say otherwise."
      />
      <div className="space-y-4">
        <AiSettingsCard />
        <ProfileCard />
        <ExportCard />
      </div>
    </>
  );
}

// ── AI provider / model / key ──────────────────────────────────────────────

function AiSettingsCard() {
  const [settings, setSettings] = React.useState<AiSettings>(() => loadAiSettings());
  const [keyInput, setKeyInput] = React.useState("");
  const [hasStoredKey, setHasStoredKey] = React.useState<boolean | null>(null);
  const [testState, setTestState] = React.useState<
    { kind: "idle" } | { kind: "testing" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const provider = modelRegistry.find((p) => p.id === settings.providerId) ?? null;
  // Only multimodal models qualify for the import pipeline (§5); the registry
  // already filters, but guard anyway in case of manual registry edits.
  const usableModels = provider?.models.filter((m) => m.supports_vision && m.supports_pdf) ?? [];

  React.useEffect(() => {
    setHasStoredKey(null);
    if (!settings.providerId) return;
    let cancelled = false;
    getApiKey(settings.providerId)
      .then((k) => !cancelled && setHasStoredKey(!!k))
      .catch(() => !cancelled && setHasStoredKey(false));
    return () => {
      cancelled = true;
    };
  }, [settings.providerId]);

  const update = (patch: Partial<AiSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
    setTestState({ kind: "idle" });
  };

  const saveKey = async () => {
    if (!settings.providerId || !keyInput.trim()) return;
    await setApiKey(settings.providerId, keyInput.trim());
    setKeyInput("");
    setHasStoredKey(true);
    setTestState({ kind: "idle" });
  };

  const removeKey = async () => {
    if (!settings.providerId) return;
    await deleteApiKey(settings.providerId);
    setHasStoredKey(false);
    setTestState({ kind: "idle" });
  };

  const testKey = async () => {
    if (!settings.providerId) return;
    setTestState({ kind: "testing" });
    try {
      const key = await getApiKey(settings.providerId);
      if (!key) throw new Error("No API key stored for this provider");
      const model = effectiveModelId(settings);
      if (!model) throw new Error("Select a model first");
      await buildProvider(settings.providerId, key, model).testKey();
      setTestState({ kind: "ok" });
    } catch (e) {
      setTestState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI analysis</CardTitle>
        <CardDescription>
          Off by default. Bring your own API key — it is stored in the OS keychain, never in the
          database or config files. Only multimodal models (vision + PDF) are offered, since the
          import pipeline reads photos and PDFs.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provider">
            <Select
              value={settings.providerId}
              onChange={(e) => update({ providerId: e.target.value, modelId: "", customModel: "" })}
            >
              <option value="">AI disabled</option>
              {modelRegistry.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {provider && (
            <Field label="Model (multimodal only)">
              <Select
                value={settings.modelId}
                onChange={(e) => update({ modelId: e.target.value })}
              >
                <option value="">Select model…</option>
                {usableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {provider && (
          <>
            <Field label="Custom model id (optional, overrides the list — must support vision + PDF input)">
              <Input
                value={settings.customModel}
                onChange={(e) => update({ customModel: e.target.value })}
                placeholder="e.g. a newer model id not in the registry yet"
              />
            </Field>

            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium">
                  API key for {provider.label}
                  {hasStoredKey === null ? (
                    <span className="text-muted-foreground"> · checking…</span>
                  ) : hasStoredKey ? (
                    <Badge variant="success" className="ml-2">
                      <ShieldCheck className="size-3" /> stored in keychain
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-2">
                      not set
                    </Badge>
                  )}
                </p>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={provider.keyPlaceholder}
                  className="max-w-sm"
                  autoComplete="off"
                />
                <Button onClick={saveKey} disabled={!keyInput.trim()}>
                  Save key
                </Button>
                {hasStoredKey && (
                  <>
                    <Button
                      variant="outline"
                      onClick={testKey}
                      disabled={testState.kind === "testing"}
                    >
                      {testState.kind === "testing" ? <Loader2 className="animate-spin" /> : null}
                      Test key
                    </Button>
                    <Button variant="ghost" className="text-destructive" onClick={removeKey}>
                      <Trash2 /> Remove
                    </Button>
                  </>
                )}
              </div>
              {testState.kind === "ok" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="size-3.5" /> Key works — model responded.
                </p>
              )}
              {testState.kind === "error" && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                  <XCircle className="mt-0.5 size-3.5 shrink-0" /> {testState.message}
                </p>
              )}
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          AI output is never medical advice. Documents you import are sent to the selected provider
          only when you explicitly run an AI action.
        </p>
      </CardContent>
    </Card>
  );
}

// ── profile ────────────────────────────────────────────────────────────────

function ProfileCard() {
  const { profileId } = useApp();
  const { data: prof, loading } = useQuery(() => getProfile(profileId), [profileId]);
  const { draft, setDraft, patch } = useProfileDraft();
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (prof) setDraft(draftFromProfile(prof));
  }, [prof, setDraft]);

  if (loading) return <Loading />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Used for sex- and age-aware biomarker reference ranges. Single profile for now;
          multi-profile sharing comes later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <CoreFields draft={draft} patch={patch} />
        <OptionalFields draft={draft} patch={patch} />
        <div>
          <Button
            onClick={async () => {
              await updateProfile(profileId, draftToUpdate(draft));
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            {saved ? "Saved ✓" : "Save profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── export ─────────────────────────────────────────────────────────────────

function ExportCard() {
  const { profileId } = useApp();
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = async (kind: string, fn: () => Promise<boolean>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data export</CardTitle>
        <CardDescription>Everything is yours — full dump anytime, no lock-in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => run("json", exportAllJson)}
        >
          <Download /> {busy === "json" ? "Exporting…" : "Export all (JSON)"}
        </Button>
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => run("csv", () => exportLabsCsv(profileId))}
        >
          <Download /> {busy === "csv" ? "Exporting…" : "Lab results (CSV)"}
        </Button>
      </CardContent>
    </Card>
  );
}
