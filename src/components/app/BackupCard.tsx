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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
        <CardTitle>Backups</CardTitle>
        <CardDescription>
          Encrypted snapshots of your database, saved into a folder your cloud client (iCloud Drive,
          Google Drive, Dropbox, OneDrive) already syncs. Soma never uploads anything itself and
          stores only encrypted <code>.somabk</code> files there — your live data never leaves this
          device.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {settings.enabled ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Destination">
                <p className="truncate rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs">
                  {settings.destDir}
                </p>
              </Field>
              <Field label="Frequency">
                <Select
                  value={settings.frequency}
                  onChange={(e) => update({ frequency: e.target.value as BackupFrequency })}
                >
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <p className="text-xs text-muted-foreground">
              {settings.lastBackupAt
                ? `Last backup: ${formatDate(settings.lastBackupAt)}`
                : "No backup has run yet."}
              {" · "}Old snapshots are rotated automatically (newest 12 are kept).
            </p>
            {settings.lastResult && !settings.lastResult.ok && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" />
                Last attempt failed: {settings.lastResult.message}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={backupNow} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CloudUpload />}
                {busy ? "Backing up…" : "Back up now"}
              </Button>
              <Button variant="outline" onClick={() => setRestoreOpen(true)}>
                <RotateCcw /> Restore from backup…
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => update({ enabled: false })}
              >
                Disable
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Disabling only stops future backups — existing snapshots and your passphrase are kept,
              so you can re-enable any time.
            </p>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setWizardOpen(true)}>
              <CloudUpload /> Set up backups
            </Button>
            <Button variant="outline" onClick={() => setRestoreOpen(true)}>
              <RotateCcw /> Restore from backup…
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
      setDirError("That folder does not exist.");
      return;
    }
    if (!check.writable) {
      setDirError("Soma cannot write into that folder — pick another one.");
      return;
    }
    const detected = detection?.providers.find((p) => p.path && picked.startsWith(p.path));
    setProvider(detected ? detected.id : "custom");
    setDestDir(picked);
    setCustomWarning(
      detected
        ? null
        : "This folder is not one of the detected cloud folders. Backups saved here will " +
            "only reach a cloud if something on this computer syncs this folder.",
    );
    if (!viaDialog) setDirError(null);
  };

  const pickFolder = async () => {
    const picked = await open({ directory: true, title: "Choose a backup folder" });
    if (typeof picked === "string") await choosePicked(picked, true);
  };

  const submitPassphrase = async () => {
    setPassError(null);
    if (pass.length < 8) {
      setPassError("Use at least 8 characters.");
      return;
    }
    if (pass !== pass2) {
      setPassError("Passphrases don't match.");
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

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Set up backups · step ${step} of 3`}
      description={
        step === 1
          ? "Where should encrypted snapshots be saved?"
          : step === 2
            ? "Protect your backups with a passphrase."
            : "How often should Soma back up?"
      }
    >
      {step === 1 && (
        <div className="grid gap-2">
          {(detection?.providers ?? []).map((p) => {
            const unavailable = !p.path;
            const reason =
              p.id === "icloud" && detection?.platform !== "macos"
                ? "macOS only"
                : "Not found on this computer";
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
                    <Badge variant="success">Detected</Badge>
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
              "Choose a folder manually…"
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

          <p className="text-[11px] text-muted-foreground">
            A <code>Soma Backups</code> subfolder is created inside, with a README explaining the
            files. Only encrypted snapshots go there — never your live data.
          </p>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!destDir} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <p className="flex items-start gap-1.5 font-medium">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" />
              This passphrase encrypts every backup. It is stored only in this device&apos;s
              keychain.
            </p>
            <p className="mt-1.5 text-muted-foreground">
              If you lose this device <em>and</em> the passphrase, your backups cannot be recovered
              — by anyone. Save it in your password manager now.
            </p>
          </div>
          <Field label="Passphrase (min 8 characters)">
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Repeat passphrase">
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
            I saved the passphrase somewhere safe
          </label>
          {passError && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <XCircle className="mt-0.5 size-3.5 shrink-0" /> {passError}
            </p>
          )}
          <div className="mt-1 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button disabled={!pass || !pass2 || !passSaved} onClick={submitPassphrase}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-3">
          <Field label="Backup frequency">
            <Select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as BackupFrequency)}
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p>
              Destination: <span className="font-mono">{destDir}</span>
            </p>
            <p className="mt-1">
              Soma also checks on every launch and catches up if a backup was missed. The newest 12
              snapshots are kept; older ones are deleted automatically.
            </p>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={finish} disabled={finishing}>
              {finishing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Enable & back up now
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── restore ─────────────────────────────────────────────────────────────────

function RestoreDialog({ onClose }: { onClose: () => void }) {
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
      title: "Choose a Soma backup",
      filters: [{ name: "Soma backup", extensions: ["somabk"] }],
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
      title="Restore from backup"
      description={
        meta
          ? "Review the backup before replacing your data."
          : "Pick a .somabk file and enter the passphrase it was encrypted with."
      }
    >
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
              "Choose backup file…"
            )}
          </button>
          <Field label="Passphrase">
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
              Cancel
            </Button>
            <Button disabled={!filePath || !pass || busy} onClick={inspect}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="truncate font-mono">{filePath}</p>
            <p className="mt-1.5 text-muted-foreground">
              Decrypted size: {formatSize(meta.sizeBytes)}
              {meta.fileModifiedAt && <> · file date: {formatDate(meta.fileModifiedAt)}</>}
              {" · schema v"}
              {meta.schemaVersion} (app has v{currentSchemaVersion})
            </p>
          </div>

          {newerThanApp ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <XCircle className="mt-0.5 size-3.5 shrink-0" />
              This backup was made by a newer version of Soma. Update the app first, then restore.
            </p>
          ) : (
            <>
              {meta.schemaVersion < currentSchemaVersion && (
                <p className="text-xs text-muted-foreground">
                  The backup uses an older schema — it will be migrated automatically after the
                  restart.
                </p>
              )}
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <p className="flex items-start gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  This replaces your current database and restarts the app.
                </p>
                <p className="mt-1.5 text-muted-foreground">
                  A timestamped safety copy of the current database is kept next to it, so this can
                  be undone manually if needed.
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
              Back
            </Button>
            <Button variant="destructive" disabled={busy || newerThanApp} onClick={restore}>
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Replace data & restart
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
