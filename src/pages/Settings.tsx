import * as React from "react";
import {
  CheckCircle2,
  Download,
  Globe,
  HeartPulse,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useI18n } from "@/lib/i18n";
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
import { BackupCard } from "@/components/app/BackupCard";
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
import { Collapsible } from "@/components/ui/collapsible";
import { exportAllJson, exportLabsCsv } from "@/lib/export";

export function Settings() {
  const { t } = useI18n();

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="space-y-4">
        <LanguageCard />
        <ProfileCard />
        <EmergencyContactCard />
        <AiSettingsCard />
        <BackupCard />
        <ExportCard />
      </div>
    </>
  );
}

// ── Language ───────────────────────────────────────────────────────────────

function LanguageCard() {
  const { lang, setLang, t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <CardTitle>{t("settings.language.title")}</CardTitle>
        </div>
        <CardDescription>{t("settings.language.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field label={t("settings.language.title")}>
          <Select value={lang} onChange={(e) => setLang(e.target.value as "en" | "ru")}>
            <option value="en">{t("settings.language.english")}</option>
            <option value="ru">{t("settings.language.russian")}</option>
          </Select>
        </Field>
      </CardContent>
    </Card>
  );
}

// ── AI provider / model / key ──────────────────────────────────────────────

function AiSettingsCard() {
  const { t } = useI18n();
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
    <Collapsible
      title={t("settings.ai.title")}
      description={t("settings.ai.description")}
      defaultOpen={false}
      icon={<Sparkles className="size-4" />}
    >
      <div className="grid gap-4 p-5 pt-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("settings.ai.provider")}>
            <Select
              value={settings.providerId}
              onChange={(e) => update({ providerId: e.target.value, modelId: "", customModel: "" })}
            >
              <option value="">{t("settings.ai.aiDisabled")}</option>
              {modelRegistry.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {provider && (
            <Field label={t("settings.ai.model")}>
              <Select
                value={settings.modelId}
                onChange={(e) => update({ modelId: e.target.value })}
              >
                <option value="">{t("common.selectModel")}</option>
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
            <Field label={t("settings.ai.customModel")}>
              <Input
                value={settings.customModel}
                onChange={(e) => update({ customModel: e.target.value })}
                placeholder={t("settings.ai.customModelPlaceholder")}
              />
            </Field>

            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <p className="text-xs font-medium">
                  {t("settings.ai.apiKeyFor")} {provider.label}
                  {hasStoredKey === null ? (
                    <span className="text-muted-foreground"> · {t("settings.ai.checking")}</span>
                  ) : hasStoredKey ? (
                    <Badge variant="success" className="ml-2">
                      <ShieldCheck className="size-3" /> {t("settings.ai.storedInKeychain")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-2">
                      {t("settings.ai.notSet")}
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
                  {t("settings.ai.saveKey")}
                </Button>
                {hasStoredKey && (
                  <>
                    <Button
                      variant="outline"
                      onClick={testKey}
                      disabled={testState.kind === "testing"}
                    >
                      {testState.kind === "testing" ? <Loader2 className="animate-spin" /> : null}
                      {t("settings.ai.testKey")}
                    </Button>
                    <Button variant="ghost" className="text-destructive" onClick={removeKey}>
                      <Trash2 /> {t("common.remove")}
                    </Button>
                  </>
                )}
              </div>
              {testState.kind === "ok" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="size-3.5" /> {t("settings.ai.keyWorks")}
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

        <p className="text-[11px] text-muted-foreground">{t("settings.ai.disclaimer")}</p>
      </div>
    </Collapsible>
  );
}

// ── profile ────────────────────────────────────────────────────────────────

function ProfileCard() {
  const { t } = useI18n();
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
        <CardTitle>{t("settings.profile.title")}</CardTitle>
        <CardDescription>{t("settings.profile.description")}</CardDescription>
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
            {saved ? t("settings.profile.saved") : t("settings.profile.saveProfile")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── emergency contact ───────────────────────────────────────────────────────

function EmergencyContactCard() {
  const { t } = useI18n();
  const { profileId } = useApp();
  const { data: prof, loading } = useQuery(() => getProfile(profileId), [profileId]);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [relation, setRelation] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!prof) return;
    setName(prof.emergencyContactName ?? "");
    setPhone(prof.emergencyContactPhone ?? "");
    setRelation(prof.emergencyContactRelation ?? "");
  }, [prof]);

  if (loading) return <Loading />;

  const trimToNull = (s: string) => (s.trim() ? s.trim() : null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HeartPulse className="size-4 text-muted-foreground" />
          <CardTitle>{t("emergency.settings.title")}</CardTitle>
        </div>
        <CardDescription>{t("emergency.settings.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("emergency.settings.name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("emergency.settings.phone")}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t("emergency.settings.relation")}>
            <Input value={relation} onChange={(e) => setRelation(e.target.value)} />
          </Field>
        </div>
        <div>
          <Button
            onClick={async () => {
              await updateProfile(profileId, {
                emergencyContactName: trimToNull(name),
                emergencyContactPhone: trimToNull(phone),
                emergencyContactRelation: trimToNull(relation),
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            {saved ? t("emergency.settings.saved") : t("emergency.settings.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── export ─────────────────────────────────────────────────────────────────

function ExportCard() {
  const { t } = useI18n();
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
        <CardTitle>{t("settings.export.title")}</CardTitle>
        <CardDescription>{t("settings.export.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => run("json", exportAllJson)}
        >
          <Download />{" "}
          {busy === "json" ? t("settings.export.exporting") : t("settings.export.exportAll")}
        </Button>
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => run("csv", () => exportLabsCsv(profileId))}
        >
          <Download />{" "}
          {busy === "csv" ? t("settings.export.exporting") : t("settings.export.exportLabs")}
        </Button>
      </CardContent>
    </Card>
  );
}
