import * as React from "react";
import {
  CheckCircle2,
  Download,
  Globe,
  MonitorSmartphone,
  Moon,
  Sun,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
  XCircle,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getProfile, updateProfile } from "@/db/repos";
import { loadInterests, saveInterests, SECTION_GROUPS, type SectionGroup } from "@/lib/interests";
import {
  DASHBOARD_WIDGETS,
  loadDashboardWidgets,
  saveDashboardWidgets,
  type DashboardWidget,
} from "@/lib/dashboard-prefs";
import {
  buildProvider,
  effectiveModelId,
  loadAiSettings,
  modelRegistry,
  saveAiSettings,
  type AiSettings,
} from "@/ai";
import { deleteApiKey, getApiKey, setApiKey } from "@/ai/keystore";
import { useKeychainStatus } from "@/hooks/useKeychainStatus";
import { KeychainNotice } from "@/components/app/KeychainNotice";
import { useToast } from "@/components/app/Toast";
import { appLogDir, join } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { applyThemePreference, loadThemePreference, type ThemePreference } from "@/lib/theme";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { PageHeader } from "@/components/app/PageHeader";
import { BackupCard } from "@/components/app/BackupCard";
import { EncryptionCard } from "@/components/app/EncryptionCard";
import { McpCard } from "@/components/app/McpCard";
import { GROUP_META } from "@/components/app/SectionToggles";
import { resetPersonalization } from "@/lib/personalization";
import { notifySetupChanged } from "@/lib/setup-state";
import { ToggleRow } from "@/components/app/ToggleRow";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { exportAllJson, exportLabsCsv } from "@/lib/export";
import { GITHUB_RELEASES_URL, checkLatestRelease, type UpdateCheckResult } from "@/lib/releases";
import { settingsSectionFromSearch, type SettingsSection } from "@/lib/settings-navigation";

export function Settings() {
  const { t } = useI18n();
  const location = useLocation();
  const legacyState = location.state as {
    openAi?: boolean;
    openDashboard?: boolean;
    openSections?: boolean;
  } | null;
  const requestedSection =
    settingsSectionFromSearch(location.search) ??
    (legacyState?.openAi
      ? "ai"
      : legacyState?.openDashboard
        ? "dashboard"
        : legacyState?.openSections
          ? "sections"
          : null);
  const [highlighted, setHighlighted] = React.useState<SettingsSection | null>(requestedSection);

  React.useEffect(() => {
    if (!requestedSection) return;
    setHighlighted(requestedSection);
    const scrollTimer = window.setTimeout(() => {
      const target = document.getElementById(`settings-${requestedSection}`);
      const container = target?.closest("main");
      if (!target || !container) return;
      const top =
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        24;
      container.scrollTop = Math.max(0, top);
    }, 100);
    const highlightTimer = window.setTimeout(() => setHighlighted(null), 2000);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [location.key, location.search, requestedSection]);

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="space-y-4">
        <SettingsTarget section="appearance" highlighted={highlighted}>
          <AppearanceCard />
        </SettingsTarget>
        <SettingsTarget section="updates" highlighted={highlighted}>
          <UpdatesCard />
        </SettingsTarget>
        <SettingsTarget section="sections" highlighted={highlighted}>
          <SectionsCard />
        </SettingsTarget>
        <SettingsTarget section="dashboard" highlighted={highlighted}>
          <DashboardCard />
        </SettingsTarget>
        <SettingsTarget section="reset" highlighted={highlighted}>
          <ResetPersonalizationCard />
        </SettingsTarget>
        <SettingsTarget section="profile" highlighted={highlighted}>
          <ProfileCard />
        </SettingsTarget>
        <SettingsTarget section="emergency" highlighted={highlighted}>
          <EmergencyContactCard />
        </SettingsTarget>
        <SettingsTarget section="ai" highlighted={highlighted}>
          <AiSettingsCard focused={requestedSection === "ai"} />
        </SettingsTarget>
        <SettingsTarget section="mcp" highlighted={highlighted}>
          <McpCard />
        </SettingsTarget>
        <SettingsTarget section="backup" highlighted={highlighted}>
          <BackupCard />
        </SettingsTarget>
        <SettingsTarget section="encryption" highlighted={highlighted}>
          <EncryptionCard />
        </SettingsTarget>
        <SettingsTarget section="export" highlighted={highlighted}>
          <ExportCard />
        </SettingsTarget>
        <SettingsTarget section="logs" highlighted={highlighted}>
          <LogsCard />
        </SettingsTarget>
      </div>
    </>
  );
}

function SettingsTarget({
  section,
  highlighted,
  children,
}: {
  section: SettingsSection;
  highlighted: SettingsSection | null;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`settings-${section}`}
      className={cn(
        "scroll-mt-6 rounded-xl transition-shadow duration-300",
        highlighted === section && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
      )}
    >
      {children}
    </div>
  );
}

function UpdatesCard() {
  const { t } = useI18n();
  const [currentVersion, setCurrentVersion] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [error, setError] = React.useState(false);

  const check = React.useCallback(async (version: string) => {
    setChecking(true);
    setError(false);
    setResult(null);
    try {
      setResult(await checkLatestRelease(version));
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void getVersion()
      .then((version) => {
        setCurrentVersion(version);
        return check(version);
      })
      .catch(() => {
        setError(true);
        setChecking(false);
      });
  }, [check]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <RefreshCw className="size-4 text-muted-foreground" />
          <CardTitle>{t("settings.updates.title")}</CardTitle>
        </div>
        <CardDescription>
          {currentVersion
            ? t("settings.updates.description", { version: currentVersion })
            : t("settings.updates.loadingVersion")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          {checking && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("settings.updates.checking")}
            </p>
          )}
          {!checking && error && (
            <p className="flex items-center gap-2 text-destructive">
              <XCircle className="size-4" /> {t("settings.updates.error")}
            </p>
          )}
          {!checking && result?.status === "no_releases" && (
            <p className="text-muted-foreground">{t("settings.updates.noReleases")}</p>
          )}
          {!checking && result?.status === "current" && (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" />
              {t("settings.updates.current", { version: result.latestVersion })}
            </p>
          )}
          {!checking && result?.status === "available" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {t("settings.updates.available", { version: result.latestVersion })}
              </p>
              <Badge variant="success">{t("settings.updates.newVersion")}</Badge>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={checking || currentVersion === null}
            onClick={() => currentVersion && void check(currentVersion)}
          >
            {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("settings.updates.check")}
          </Button>
          {result?.status === "available" && (
            <Button onClick={() => void openUrl(result.releaseUrl)}>
              <Download />
              {t("settings.updates.openRelease", { version: result.latestVersion })}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void openUrl(GITHUB_RELEASES_URL)}>
            <SquareArrowOutUpRight /> {t("settings.updates.allReleases")}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("settings.updates.manual")}</p>
      </CardContent>
    </Card>
  );
}

// ── Language ───────────────────────────────────────────────────────────────

function AppearanceCard() {
  const { lang, setLang, t } = useI18n();
  const [theme, setTheme] = React.useState<ThemePreference>(() => loadThemePreference());

  const changeTheme = (next: ThemePreference) => {
    setTheme(next);
    applyThemePreference(next);
  };

  const segment = (active: boolean): "secondary" | "ghost" => (active ? "secondary" : "ghost");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <CardTitle>{t("settings.appearance.title")}</CardTitle>
        </div>
        <CardDescription>{t("settings.appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-6">
        <Field label={t("settings.appearance.language")}>
          <div className="flex w-fit rounded-lg border p-0.5">
            {(["en", "ru"] as const).map((l) => (
              <Button
                key={l}
                variant={segment(lang === l)}
                size="sm"
                className="h-7 px-3"
                onClick={() => setLang(l)}
              >
                {l === "en" ? "English" : "Русский"}
              </Button>
            ))}
          </div>
        </Field>
        <Field label={t("settings.appearance.theme")}>
          <div className="flex w-fit rounded-lg border p-0.5">
            <Button
              variant={segment(theme === "light")}
              size="sm"
              className="h-7 gap-1.5 px-3"
              onClick={() => changeTheme("light")}
            >
              <Sun className="size-3.5" /> {t("settings.appearance.light")}
            </Button>
            <Button
              variant={segment(theme === "dark")}
              size="sm"
              className="h-7 gap-1.5 px-3"
              onClick={() => changeTheme("dark")}
            >
              <Moon className="size-3.5" /> {t("settings.appearance.dark")}
            </Button>
            <Button
              variant={segment(theme === "system")}
              size="sm"
              className="h-7 gap-1.5 px-3"
              onClick={() => changeTheme("system")}
            >
              <MonitorSmartphone className="size-3.5" /> {t("settings.appearance.system")}
            </Button>
          </div>
        </Field>
      </CardContent>
    </Card>
  );
}

// ── sidebar sections ─────────────────────────────────────────────────────────

function SectionsCard() {
  const { t } = useI18n();
  const [groups, setGroups] = React.useState<Set<SectionGroup>>(() => loadInterests());

  const toggle = (g: SectionGroup) =>
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      saveInterests(next);
      return next;
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <CardTitle>{t("settings.sections.title")}</CardTitle>
        </div>
        <CardDescription>{t("settings.sections.description")}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y py-0">
        {SECTION_GROUPS.map((id) => (
          <ToggleRow
            key={id}
            icon={GROUP_META[id].icon}
            label={t(GROUP_META[id].labelKey)}
            description={t(GROUP_META[id].descKey)}
            checked={groups.has(id)}
            onChange={() => toggle(id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ── dashboard widgets ─────────────────────────────────────────────────────────

/** Stable order + i18n keys for the dashboard widget toggles. */
const WIDGET_KEYS: Record<DashboardWidget, { labelKey: string; descKey: string }> = {
  safetyBanner: {
    labelKey: "settings.dashboard.widgets.safetyBanner.label",
    descKey: "settings.dashboard.widgets.safetyBanner.desc",
  },
  verdict: {
    labelKey: "settings.dashboard.widgets.verdict.label",
    descKey: "settings.dashboard.widgets.verdict.desc",
  },
  stats: {
    labelKey: "settings.dashboard.widgets.stats.label",
    descKey: "settings.dashboard.widgets.stats.desc",
  },
  attention: {
    labelKey: "settings.dashboard.widgets.attention.label",
    descKey: "settings.dashboard.widgets.attention.desc",
  },
  review: {
    labelKey: "settings.dashboard.widgets.review.label",
    descKey: "settings.dashboard.widgets.review.desc",
  },
  changes: {
    labelKey: "settings.dashboard.widgets.changes.label",
    descKey: "settings.dashboard.widgets.changes.desc",
  },
  activity: {
    labelKey: "settings.dashboard.widgets.activity.label",
    descKey: "settings.dashboard.widgets.activity.desc",
  },
};

function DashboardCard() {
  const { t } = useI18n();
  const [enabled, setEnabled] = React.useState<Set<DashboardWidget>>(() => loadDashboardWidgets());
  // Confirm before hiding the safety banner: it's a life-safety surface, so a
  // stray toggle shouldn't silently bury it (the Emergency Card still has it).
  const [confirmSafety, setConfirmSafety] = React.useState(false);

  const apply = (w: DashboardWidget, on: boolean) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(w);
      else next.delete(w);
      saveDashboardWidgets(next);
      return next;
    });

  const toggle = (w: DashboardWidget) => {
    // Intercept only the off-switch of the safety banner.
    if (w === "safetyBanner" && enabled.has(w)) {
      setConfirmSafety(true);
      return;
    }
    apply(w, !enabled.has(w));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <LayoutDashboard className="size-4 text-muted-foreground" />
          <CardTitle>{t("settings.dashboard.title")}</CardTitle>
        </div>
        <CardDescription>{t("settings.dashboard.description")}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y py-0">
        {DASHBOARD_WIDGETS.map((w) => (
          <ToggleRow
            key={w}
            label={t(WIDGET_KEYS[w].labelKey)}
            description={t(WIDGET_KEYS[w].descKey)}
            checked={enabled.has(w)}
            onChange={() => toggle(w)}
          />
        ))}
      </CardContent>
      <ConfirmDialog
        open={confirmSafety}
        title={t("settings.dashboard.safetyConfirm.title")}
        description={t("settings.dashboard.safetyConfirm.body")}
        confirmLabel={t("settings.dashboard.safetyConfirm.confirm")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          apply("safetyBanner", false);
          setConfirmSafety(false);
        }}
        onClose={() => setConfirmSafety(false)}
      />
    </Card>
  );
}

// ── reset ──────────────────────────────────────────────────────────────────

function ResetPersonalizationCard() {
  const { t } = useI18n();
  const toast = useToast();
  const { profileId } = useApp();
  const [open, setOpen] = React.useState(false);

  const reset = async () => {
    await resetPersonalization(profileId);
    setOpen(false);
    toast.show(t("settings.reset.done"));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <RotateCcw className="size-4 text-muted-foreground" />
          <CardTitle>{t("settings.reset.title")}</CardTitle>
        </div>
        <CardDescription>{t("settings.reset.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <RotateCcw /> {t("settings.reset.action")}
        </Button>
      </CardContent>
      <ConfirmDialog
        open={open}
        title={t("settings.reset.confirm.title")}
        description={t("settings.reset.confirm.body")}
        confirmLabel={t("settings.reset.action")}
        cancelLabel={t("common.cancel")}
        onConfirm={reset}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}

// ── AI provider / model / key ──────────────────────────────────────────────

function AiSettingsCard({ focused }: { focused: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const {
    status: keychain,
    checking: keychainChecking,
    recheck: recheckKeychain,
  } = useKeychainStatus();
  const [settings, setSettings] = React.useState<AiSettings>(() => loadAiSettings());
  const [open, setOpen] = React.useState(focused);
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
    if (focused) setOpen(true);
  }, [focused]);

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
    notifySetupChanged();
  };

  const saveKey = async () => {
    if (!settings.providerId || !keyInput.trim()) return;
    try {
      await setApiKey(settings.providerId, keyInput.trim());
      setKeyInput("");
      setHasStoredKey(true);
      setTestState({ kind: "idle" });
      notifySetupChanged();
    } catch {
      // Keychain probe passed but the write still failed (e.g. a locked keyring
      // the user dismissed). Re-probe so the notice + guidance appear.
      toast.show(t("keychain.saveFailed"));
      void recheckKeychain();
    }
  };

  const keychainBlocked = keychain?.available === false;

  const removeKey = async () => {
    if (!settings.providerId) return;
    await deleteApiKey(settings.providerId);
    setHasStoredKey(false);
    setTestState({ kind: "idle" });
    notifySetupChanged();
    toast.show(t("toasts.apiKeyRemoved"));
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
      open={open}
      onOpenChange={setOpen}
      icon={<Sparkles className="size-4" />}
    >
      <div className="grid gap-4 p-5 pt-0">
        <KeychainNotice
          status={keychain}
          checking={keychainChecking}
          onRecheck={() => void recheckKeychain()}
        />
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Lightbulb className="size-3.5 text-primary" /> {t("settings.ai.recommendTitle")}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("settings.ai.recommendBody")}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("settings.ai.provider")}>
            <SelectMenu
              value={settings.providerId || null}
              onChange={(v) => update({ providerId: v, modelId: "", customModel: "" })}
              placeholder={t("settings.ai.aiDisabled")}
              options={[
                { value: "", label: t("settings.ai.aiDisabled") },
                ...modelRegistry.map((p) => ({ value: p.id, label: p.label })),
              ]}
            />
          </Field>
          {provider && (
            <Field label={t("settings.ai.model")}>
              <SelectMenu
                value={settings.modelId || null}
                onChange={(v) => update({ modelId: v })}
                placeholder={t("common.selectModel")}
                options={usableModels.map((m) => ({ value: m.id, label: m.label }))}
              />
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
                <Button onClick={saveKey} disabled={!keyInput.trim() || keychainBlocked}>
                  {t("settings.ai.saveKey")}
                </Button>
                {provider.keyUrl && (
                  <Button variant="outline" onClick={() => void openUrl(provider.keyUrl!)}>
                    <SquareArrowOutUpRight /> {t("settings.ai.getApiKey")}
                  </Button>
                )}
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
  const toast = useToast();
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
              toast.show(t("toasts.profileSaved"));
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
  const toast = useToast();
  const { profileId } = useApp();
  const { data: prof, loading } = useQuery(() => getProfile(profileId), [profileId]);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [relation, setRelation] = React.useState("");
  const [citizenship, setCitizenship] = React.useState("");
  const [languages, setLanguages] = React.useState("");
  const [insurer, setInsurer] = React.useState("");
  const [policyNumber, setPolicyNumber] = React.useState("");
  const [insurancePhone, setInsurancePhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pregnancyStatus, setPregnancyStatus] = React.useState("");
  const [codeStatus, setCodeStatus] = React.useState("");
  const [organDonor, setOrganDonor] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!prof) return;
    setName(prof.emergencyContactName ?? "");
    setPhone(prof.emergencyContactPhone ?? "");
    setRelation(prof.emergencyContactRelation ?? "");
    setCitizenship(prof.citizenship ?? "");
    setLanguages(prof.languages ?? "");
    setInsurer(prof.insurer ?? "");
    setPolicyNumber(prof.insurancePolicyNumber ?? "");
    setInsurancePhone(prof.insurancePhone ?? "");
    setNotes(prof.emergencyNotes ?? "");
    setPregnancyStatus(prof.pregnancyStatus ?? "");
    setCodeStatus(prof.codeStatus ?? "");
    setOrganDonor(prof.organDonor == null ? "" : prof.organDonor ? "yes" : "no");
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("emergency.settings.citizenship")}>
            <Input
              value={citizenship}
              onChange={(e) => setCitizenship(e.target.value)}
              placeholder={t("emergency.settings.citizenshipPlaceholder")}
            />
          </Field>
          <Field label={t("emergency.settings.languages")}>
            <Input
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
              placeholder={t("emergency.settings.languagesPlaceholder")}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("emergency.settings.insurer")}>
            <Input value={insurer} onChange={(e) => setInsurer(e.target.value)} />
          </Field>
          <Field label={t("emergency.settings.policyNumber")}>
            <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
          </Field>
          <Field label={t("emergency.settings.assistancePhone")}>
            <Input
              type="tel"
              value={insurancePhone}
              onChange={(e) => setInsurancePhone(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("emergency.settings.pregnancy")}>
            <SelectMenu
              value={pregnancyStatus}
              onChange={setPregnancyStatus}
              placeholder={t("emergency.settings.notSet")}
              options={[
                { value: "", label: t("emergency.settings.notSet") },
                {
                  value: "not_pregnant",
                  label: t("emergency.criticalStatus.pregnancyValues.not_pregnant"),
                },
                {
                  value: "pregnant",
                  label: t("emergency.criticalStatus.pregnancyValues.pregnant"),
                },
                {
                  value: "postpartum",
                  label: t("emergency.criticalStatus.pregnancyValues.postpartum"),
                },
                {
                  value: "unknown",
                  label: t("emergency.criticalStatus.pregnancyValues.unknown"),
                },
              ]}
            />
          </Field>
          <Field label={t("emergency.settings.codeStatus")}>
            <SelectMenu
              value={codeStatus}
              onChange={setCodeStatus}
              placeholder={t("emergency.settings.notSet")}
              options={[
                { value: "", label: t("emergency.settings.notSet") },
                {
                  value: "full_code",
                  label: t("emergency.criticalStatus.codeStatusValues.full_code"),
                },
                { value: "dnr", label: t("emergency.criticalStatus.codeStatusValues.dnr") },
                { value: "dni", label: t("emergency.criticalStatus.codeStatusValues.dni") },
              ]}
            />
          </Field>
          <Field label={t("emergency.settings.organDonor")}>
            <SelectMenu
              value={organDonor}
              onChange={setOrganDonor}
              placeholder={t("emergency.settings.notSet")}
              options={[
                { value: "", label: t("emergency.settings.notSet") },
                { value: "yes", label: t("emergency.criticalStatus.yes") },
                { value: "no", label: t("emergency.criticalStatus.no") },
              ]}
            />
          </Field>
        </div>
        <Field label={t("emergency.settings.notes")} hint={t("emergency.settings.notesHint")}>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div>
          <Button
            onClick={async () => {
              await updateProfile(profileId, {
                emergencyContactName: trimToNull(name),
                emergencyContactPhone: trimToNull(phone),
                emergencyContactRelation: trimToNull(relation),
                citizenship: trimToNull(citizenship),
                languages: trimToNull(languages),
                insurer: trimToNull(insurer),
                insurancePolicyNumber: trimToNull(policyNumber),
                insurancePhone: trimToNull(insurancePhone),
                emergencyNotes: trimToNull(notes),
                pregnancyStatus: (pregnancyStatus || null) as
                  "not_pregnant" | "pregnant" | "postpartum" | "unknown" | null,
                codeStatus: (codeStatus || null) as "full_code" | "dnr" | "dni" | null,
                organDonor: organDonor === "" ? null : organDonor === "yes",
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
              toast.show(t("toasts.profileSaved"));
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

function LogsCard() {
  const { t } = useI18n();
  const [error, setError] = React.useState(false);

  const openLogs = async () => {
    setError(false);
    const dir = await appLogDir();
    try {
      await openPath(await join(dir, "soma.log"));
    } catch {
      // File may not exist yet or no default app for .log — fall back to the folder.
      try {
        await openPath(dir);
      } catch {
        setError(true);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.logs.title")}</CardTitle>
        <CardDescription>{t("settings.logs.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => void openLogs()}>
          {t("settings.logs.open")}
        </Button>
        {error && <p className="text-xs text-destructive">{t("settings.logs.error")}</p>}
      </CardContent>
    </Card>
  );
}

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
