import * as React from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FolderOpen,
  KeyRound,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/app/Field";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  applyRestore,
  currentSchemaVersion,
  detectProviders,
  discardRestoreStaging,
  FREQUENCY_LABELS,
  inspectBackup,
  loadBackupSettings,
  runBackup,
  saveBackupSettings,
  setPassphrase,
  verifyBackupDir,
  type BackupFrequency,
  type BackupSettings,
  type Detection,
  type RestoreMeta,
} from "@/lib/backup";

function formatSize(bytes: number): string {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function BackupCard() {
  const { t } = useI18n();
  const [settings, setSettings] = React.useState<BackupSettings>(() => loadBackupSettings());
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const update = (patch: Partial<BackupSettings>) => {
    const next = { ...loadBackupSettings(), ...patch };
    saveBackupSettings(next);
    setSettings(next);
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      await runBackup();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      saveBackupSettings({
        ...loadBackupSettings(),
        lastResult: { ok: false, message, at: new Date().toISOString() },
      });
    } finally {
      setSettings(loadBackupSettings());
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("backup.title")}</CardTitle>
        <CardDescription>{t("backup.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {settings.enabled ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("backup.destination")}>
                <p className="truncate rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs">
                  {settings.destDir}
                </p>
              </Field>
              <Field label={t("backup.frequency")}>
                <SelectMenu
                  value={settings.frequency}
                  onChange={(v) => update({ frequency: v as BackupFrequency })}
                  options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </Field>
            </div>

            <p className="text-xs text-muted-foreground">
              {settings.lastBackupAt
                ? `${t("backup.lastBackup")}: ${formatDate(settings.lastBackupAt)}`
                : t("backup.noBackupYet")}
              {" · "}
              {t("backup.rotationNote")}
            </p>
            {settings.lastResult && !settings.lastResult.ok && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" />
                {t("backup.lastAttemptFailed")}: {settings.lastResult.message}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={backupNow} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CloudUpload />}
                {busy ? t("backup.backingUp") : t("backup.backupNow")}
              </Button>
              <Button variant="outline" onClick={() => setRestoreOpen(true)}>
                <RotateCcw /> {t("backup.restoreFromBackup")}
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => update({ enabled: false })}
              >
                {t("backup.disable")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("backup.disableNote")}</p>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setWizardOpen(true)}>
              <CloudUpload /> {t("backup.setupBackups")}
            </Button>
            <Button variant="outline" onClick={() => setRestoreOpen(true)}>
              <RotateCcw /> {t("backup.restoreFromBackup")}
            </Button>
          </div>
        )}
      </CardContent>

      {wizardOpen && (
        <SetupWizard
          onClose={() => setWizardOpen(false)}
          onDone={(dest, provider, frequency) => {
            update({ enabled: true, destDir: dest, provider, frequency });
            setWizardOpen(false);
            void backupNow();
          }}
        />
      )}
      {restoreOpen && <RestoreDialog onClose={() => setRestoreOpen(false)} />}
    </Card>
  );
}

// ── setup wizard ────────────────────────────────────────────────────────────

type WizardProps = {
  onClose: () => void;
  onDone: (destDir: string, provider: BackupSettings["provider"], freq: BackupFrequency) => void;
};

function SetupWizard({ onClose, onDone }: WizardProps) {
  const { t } = useI18n();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [detection, setDetection] = React.useState<Detection | null>(null);

  const [destDir, setDestDir] = React.useState("");
  const [provider, setProvider] = React.useState<BackupSettings["provider"]>("custom");
  const [customWarning, setCustomWarning] = React.useState<string | null>(null);
  const [dirError, setDirError] = React.useState<string | null>(null);

  const [pass, setPass] = React.useState("");
  const [pass2, setPass2] = React.useState("");
  const [passSaved, setPassSaved] = React.useState(false);
  const [passError, setPassError] = React.useState<string | null>(null);

  const [frequency, setFrequency] = React.useState<BackupFrequency>("weekly");
  const [finishing, setFinishing] = React.useState(false);

  React.useEffect(() => {
    detectProviders().then(setDetection).catch(console.error);
  }, []);

  const chooseDetected = (id: BackupSettings["provider"], path: string) => {
    setProvider(id);
    setDestDir(path);
    setCustomWarning(null);
    setDirError(null);
  };

  const choosePicked = async (picked: string, viaDialog: boolean) => {
    setDirError(null);
    const check = await verifyBackupDir(picked);
    if (!check.exists) {
      setDirError(t("backup.folderNotExist"));
      return;
    }
    if (!check.writable) {
      setDirError(t("backup.folderNotWritable"));
      return;
    }
    const detected = detection?.providers.find((p) => p.path && picked.startsWith(p.path));
    setProvider(detected ? detected.id : "custom");
    setDestDir(picked);
    setCustomWarning(detected ? null : t("backup.customWarning"));
    if (!viaDialog) setDirError(null);
  };

  const pickFolder = async () => {
    const picked = await open({ directory: true, title: t("backup.chooseFolderDialogTitle") });
    if (typeof picked === "string") await choosePicked(picked, true);
  };

  const submitPassphrase = async () => {
    setPassError(null);
    if (pass.length < 8) {
      setPassError(t("backup.passphraseMinLength"));
      return;
    }
    if (pass !== pass2) {
      setPassError(t("backup.passphraseMismatch"));
      return;
    }
    setStep(3);
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await setPassphrase(pass);
      onDone(destDir, provider, frequency);
    } catch (e) {
      setPassError(e instanceof Error ? e.message : String(e));
      setFinishing(false);
      setStep(2);
    }
  };

  const stepSubmit =
    step === 1
      ? () => {
          if (destDir) setStep(2);
        }
      : step === 2
        ? submitPassphrase
        : finish;
  const stepDisabled =
    step === 1 ? !destDir : step === 2 ? !pass || !pass2 || !passSaved : finishing;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("backup.setupStep", { step: step.toString() })}
      description={
        step === 1
          ? t("backup.step1Description")
          : step === 2
            ? t("backup.step2Description")
            : t("backup.step3Description")
      }
      onSubmit={stepSubmit}
      submitDisabled={stepDisabled}
    >
      {/* key={step} re-mounts the body so each step slides in */}
      <div key={step} className="animate-step-in">
        {step === 1 && (
          <div className="grid gap-2">
            {(detection?.providers ?? []).map((p) => {
              const unavailable = !p.path;
              const reason =
                p.id === "icloud" && detection?.platform !== "macos"
                  ? t("backup.macosOnly")
                  : t("backup.notFoundOnComputer");
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={unavailable}
                  onClick={() => p.path && chooseDetected(p.id, p.path)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    unavailable && "cursor-not-allowed opacity-50",
                    !unavailable && "hover:bg-muted",
                    provider === p.id && destDir === p.path && "border-primary bg-secondary",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{p.label}</span>
                    {unavailable ? (
                      <Badge variant="secondary">{reason}</Badge>
                    ) : (
                      <Badge variant="success">{t("backup.detected")}</Badge>
                    )}
                  </div>
                  {p.path && (
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {p.path}
                    </p>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={pickFolder}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-dashed p-3 text-left text-sm transition-colors hover:bg-muted",
                provider === "custom" && destDir && "border-primary bg-secondary",
              )}
            >
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
              {provider === "custom" && destDir ? (
                <span className="truncate font-mono text-xs">{destDir}</span>
              ) : (
                t("backup.chooseManually")
              )}
            </button>

            {customWarning && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                {customWarning}
              </p>
            )}
            {dirError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" /> {dirError}
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">{t("backup.subfolderNote")}</p>

            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button disabled={!destDir} onClick={() => setStep(2)}>
                {t("common.continue")}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <p className="flex items-start gap-1.5 font-medium">
                <KeyRound className="mt-0.5 size-3.5 shrink-0" />
                {t("backup.passphraseTitle")}
              </p>
              <p className="mt-1.5 text-muted-foreground">{t("backup.passphraseWarning")}</p>
            </div>
            <Field label={t("backup.passphraseLabel")}>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label={t("backup.passphraseRepeat")}>
              <Input
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={passSaved}
                onChange={(e) => setPassSaved(e.target.checked)}
                className="accent-primary"
              />
              {t("backup.passphraseSaved")}
            </label>
            {passError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" /> {passError}
              </p>
            )}
            <div className="mt-1 flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t("common.back")}
              </Button>
              <Button disabled={!pass || !pass2 || !passSaved} onClick={submitPassphrase}>
                {t("common.continue")}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3">
            <Field label={t("backup.backupFrequency")}>
              <SelectMenu
                value={frequency}
                onChange={(v) => setFrequency(v as BackupFrequency)}
                options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Field>
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                {t("backup.destinationSummary")} <span className="font-mono">{destDir}</span>
              </p>
              <p className="mt-1">{t("backup.catchupNote")}</p>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                {t("common.back")}
              </Button>
              <Button onClick={finish} disabled={finishing}>
                {finishing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {t("backup.enableAndBackup")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ── restore ─────────────────────────────────────────────────────────────────

function RestoreDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [filePath, setFilePath] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<RestoreMeta | null>(null);

  const close = () => {
    if (meta) void discardRestoreStaging();
    onClose();
  };

  const pickFile = async () => {
    const picked = await open({
      title: t("backup.chooseBackupDialogTitle"),
      filters: [{ name: t("backup.somaBackupFilter"), extensions: ["somabk"] }],
    });
    if (typeof picked === "string") {
      setFilePath(picked);
      setError(null);
    }
  };

  const inspect = async () => {
    setBusy(true);
    setError(null);
    try {
      setMeta(await inspectBackup(filePath, pass));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await applyRestore(); // restarts the app on success
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const newerThanApp = meta !== null && meta.schemaVersion > currentSchemaVersion;

  return (
    <Dialog
      open
      onClose={close}
      title={t("backup.restoreTitle")}
      description={meta ? t("backup.restoreReviewDescription") : t("backup.restorePickDescription")}
      onSubmit={meta ? undefined : inspect}
      submitDisabled={!filePath || !pass || busy}
    >
      {/* re-mounts on phase change so the review screen slides in */}
      <div key={meta ? "review" : "pick"} className="animate-step-in">
        {!meta ? (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={pickFile}
              className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-left text-sm transition-colors hover:bg-muted"
            >
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
              {filePath ? (
                <span className="truncate font-mono text-xs">{filePath}</span>
              ) : (
                t("backup.chooseBackupFile")
              )}
            </button>
            <Field label={t("backup.passphrase")}>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="off"
              />
            </Field>
            {error && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button disabled={!filePath || !pass || busy} onClick={inspect}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {t("common.continue")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="truncate font-mono">{filePath}</p>
              <p className="mt-1.5 text-muted-foreground">
                {t("backup.decryptedSize")} {formatSize(meta.sizeBytes)}
                {meta.fileModifiedAt && (
                  <>
                    {" "}
                    · {t("backup.fileDate")} {formatDate(meta.fileModifiedAt)}
                  </>
                )}
                {" · "}
                {t("backup.schema")} v{meta.schemaVersion} ({t("backup.appHas")} v
                {currentSchemaVersion})
              </p>
            </div>

            {newerThanApp ? (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" />
                {t("backup.newerVersionError")}
              </p>
            ) : (
              <>
                {meta.schemaVersion < currentSchemaVersion && (
                  <p className="text-xs text-muted-foreground">{t("backup.olderSchemaNote")}</p>
                )}
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                  <p className="flex items-start gap-1.5 font-medium text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {t("backup.replaceWarningTitle")}
                  </p>
                  <p className="mt-1.5 text-muted-foreground">
                    {t("backup.replaceWarningDescription")}
                  </p>
                </div>
              </>
            )}

            {error && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
              </p>
            )}

            <div className="mt-1 flex justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  void discardRestoreStaging();
                  setMeta(null);
                }}
              >
                {t("common.back")}
              </Button>
              <Button variant="destructive" disabled={busy || newerThanApp} onClick={restore}>
                {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                {t("backup.replaceAndRestart")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
