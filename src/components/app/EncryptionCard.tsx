import * as React from "react";
import { AlertTriangle, KeyRound, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useKeychainStatus } from "@/hooks/useKeychainStatus";
import { useToast } from "@/components/app/Toast";
import { KeychainNotice } from "@/components/app/KeychainNotice";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disableEncryption,
  enableKeychainEncryption,
  enablePassphraseEncryption,
  loadEncryptionSettings,
  type EncryptionMode,
} from "@/lib/db-encryption";

export function EncryptionCard() {
  const { t } = useI18n();
  const toast = useToast();
  const {
    status: keychain,
    checking: keychainChecking,
    recheck: recheckKeychain,
  } = useKeychainStatus();
  const [settings, setSettings] = React.useState(() => loadEncryptionSettings());
  const [mode, setMode] = React.useState<EncryptionMode>(settings.mode);
  const [busy, setBusy] = React.useState(false);
  const [passOpen, setPassOpen] = React.useState(false);

  const keychainBlocked = keychain?.available === false;

  const run = async (fn: () => Promise<void>, okKey: string) => {
    setBusy(true);
    try {
      await fn();
      setSettings(loadEncryptionSettings());
      toast.show(t(okKey));
      return true;
    } catch (e) {
      console.error(e);
      toast.show(t("dbEncryption.error"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onEnable = () => {
    if (mode === "passphrase") setPassOpen(true);
    else void run(enableKeychainEncryption, "dbEncryption.enabledToast");
  };

  const segment = (active: boolean): "secondary" | "ghost" => (active ? "secondary" : "ghost");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" />
          <CardTitle>{t("dbEncryption.title")}</CardTitle>
        </div>
        <CardDescription>{t("dbEncryption.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <KeychainNotice
          status={keychain}
          checking={keychainChecking}
          onRecheck={() => void recheckKeychain()}
        />

        {settings.enabled ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">
                <ShieldCheck className="size-3" /> {t("dbEncryption.on")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {settings.mode === "passphrase"
                  ? t("dbEncryption.modePassphrase")
                  : t("dbEncryption.modeKeychain")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("dbEncryption.howItWorks")}</p>
            {settings.mode === "passphrase" && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                {t("dbEncryption.warning")}
              </p>
            )}
            <div>
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => void run(disableEncryption, "dbEncryption.disabledToast")}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                {t("dbEncryption.disable")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t("dbEncryption.off")}</p>
            <p className="text-xs text-muted-foreground">{t("dbEncryption.howItWorks")}</p>

            <Field label={t("dbEncryption.modeLabel")}>
              <div className="flex w-fit rounded-lg border p-0.5">
                <Button
                  variant={segment(mode === "keychain")}
                  size="sm"
                  className="h-7 px-3"
                  onClick={() => setMode("keychain")}
                >
                  {t("dbEncryption.modeKeychain")}
                </Button>
                <Button
                  variant={segment(mode === "passphrase")}
                  size="sm"
                  className="h-7 px-3"
                  onClick={() => setMode("passphrase")}
                >
                  {t("dbEncryption.modePassphrase")}
                </Button>
              </div>
            </Field>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {mode === "passphrase"
                ? t("dbEncryption.modePassphraseDesc")
                : t("dbEncryption.modeKeychainDesc")}
            </p>
            {mode === "keychain" && (
              <p className="text-[11px] text-muted-foreground">
                {t("dbEncryption.requiresKeychainNote")}
              </p>
            )}

            <div>
              <Button
                onClick={onEnable}
                disabled={busy || (mode === "keychain" && keychainBlocked)}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Lock />}
                {busy ? t("dbEncryption.enabling") : t("dbEncryption.enable")}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {passOpen && (
        <PassphraseDialog
          busy={busy}
          onClose={() => setPassOpen(false)}
          onConfirm={async (passphrase) => {
            const ok = await run(
              () => enablePassphraseEncryption(passphrase),
              "dbEncryption.enabledToast",
            );
            if (ok) setPassOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function PassphraseDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (passphrase: string) => void;
}) {
  const { t } = useI18n();
  const [pass, setPass] = React.useState("");
  const [pass2, setPass2] = React.useState("");
  const [understood, setUnderstood] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (pass.length < 8) {
      setError(t("dbEncryption.tooShort"));
      return;
    }
    if (pass !== pass2) {
      setError(t("dbEncryption.mismatch"));
      return;
    }
    onConfirm(pass);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("dbEncryption.enable")}
      onSubmit={submit}
      submitDisabled={busy || !pass || !pass2 || !understood}
    >
      <div className="grid gap-3">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="flex items-start gap-1.5 font-medium">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" />
            {t("dbEncryption.modePassphrase")}
          </p>
          <p className="mt-1.5 text-muted-foreground">{t("dbEncryption.warning")}</p>
        </div>
        <Field label={t("dbEncryption.passphrase")} hint={t("dbEncryption.passphraseHint")}>
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t("dbEncryption.passphraseConfirm")}>
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
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t("dbEncryption.warning")}
        </label>
        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !pass || !pass2 || !understood}>
            {busy ? <Loader2 className="animate-spin" /> : <Lock />}
            {t("dbEncryption.enable")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
