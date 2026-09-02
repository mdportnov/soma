import * as React from "react";
import { AlertTriangle, FolderOpen, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMacKeychainSigningCase, type BlockedReason, type StartupPlan } from "@/lib/startup-gate";
import logo from "@/assets/logo.svg";

/**
 * Shown when Soma has found encrypted data it cannot open.
 *
 * This screen exists because of what used to happen instead: the app quietly
 * created an empty database and offered onboarding, and the user concluded
 * their medical history was gone. Everything here follows from that.
 *
 *  - It states plainly that the data is still on disk and that Soma has not
 *    deleted or changed anything. That sentence is the most important pixel on
 *    the screen.
 *  - It names the *likely cause* rather than the error code, because for the
 *    common case the cause is specific, unobvious, and not the user's fault:
 *    Soma is ad-hoc signed, so an update is a different application as far as
 *    macOS is concerned, and the keychain will not hand the new one the key.
 *  - It offers ways out in the order a person would try them, and ends with the
 *    one that always works: the offline `soma-recover` tool.
 */
export function VaultBlockedScreen({
  plan,
  dataDir,
  onRetry,
  onUnlockWithKey,
  onQuarantineAndUnlock,
}: {
  plan: Extract<StartupPlan, { action: "blocked" }>;
  dataDir: string | null;
  onRetry: () => Promise<void>;
  onUnlockWithKey: (keyHex: string) => Promise<void>;
  onQuarantineAndUnlock: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [keyHex, setKeyHex] = React.useState("");
  const [busy, setBusy] = React.useState<null | "retry" | "key" | "quarantine">(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (which: "retry" | "key" | "quarantine", fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const cause: Record<BlockedReason, string> = {
    probeFailed: t("vaultBlocked.cause.probeFailed"),
    vaultUnreadable: t("vaultBlocked.cause.vaultUnreadable"),
    keyMissing: t("vaultBlocked.cause.keyMissing"),
    keyUnavailable: t("vaultBlocked.cause.keyUnavailable"),
    plaintextSuspicious: t("vaultBlocked.cause.plaintextSuspicious"),
    unlockFailed: t("vaultBlocked.cause.unlockFailed"),
  };

  const signingCase = isMacKeychainSigningCase(plan);
  const canQuarantine = plan.reason === "plaintextSuspicious";
  const canUseKey = plan.reason !== "vaultUnreadable" && plan.reason !== "probeFailed";

  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto p-6">
      <div className="my-auto w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <img src={logo} alt="Soma" className="size-10" />
          <div className="mt-4 flex size-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">{t("vaultBlocked.title")}</h1>
          {/* The reassurance comes before the diagnosis, deliberately. */}
          <p className="mt-2 text-sm text-muted-foreground">{t("vaultBlocked.safe")}</p>
        </div>

        <div className="mt-5 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">{t("vaultBlocked.likelyCause")}</p>
          <p className="mt-1 text-muted-foreground">{cause[plan.reason]}</p>
          {signingCase && (
            <p className="mt-2 text-muted-foreground">{t("vaultBlocked.adHocSigning")}</p>
          )}
          {plan.detail && (
            <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground">
              {plan.detail}
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-3">
          <Button onClick={() => void run("retry", onRetry)} disabled={busy !== null}>
            {busy === "retry" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("vaultBlocked.retry")}
          </Button>

          {canQuarantine && (
            <Button
              variant="secondary"
              onClick={() => void run("quarantine", onQuarantineAndUnlock)}
              disabled={busy !== null}
            >
              {busy === "quarantine" ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {t("vaultBlocked.quarantine")}
            </Button>
          )}

          {canUseKey && (
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("key", () => onUnlockWithKey(keyHex.trim()));
              }}
            >
              <label className="text-xs font-medium" htmlFor="recovery-key">
                {t("vaultBlocked.keyLabel")}
              </label>
              <Input
                id="recovery-key"
                value={keyHex}
                onChange={(e) => setKeyHex(e.target.value)}
                placeholder={t("vaultBlocked.keyPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
                disabled={busy !== null}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("vaultBlocked.keyHint")}
              </p>
              <code className="select-all rounded bg-muted px-2 py-1.5 text-[11px] break-all">
                security find-generic-password -s com.soma.health -a db-encryption-key -w
              </code>
              <Button
                type="submit"
                variant="secondary"
                disabled={keyHex.trim().length === 0 || busy !== null}
              >
                {busy === "key" ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {t("vaultBlocked.unlockWithKey")}
              </Button>
            </form>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {dataDir && (
            <Button
              variant="ghost"
              onClick={() => void revealItemInDir(dataDir).catch(() => undefined)}
              disabled={busy !== null}
            >
              <FolderOpen />
              {t("vaultBlocked.openFolder")}
            </Button>
          )}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          {t("vaultBlocked.recoverTool")}
        </p>
        {dataDir && (
          <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground select-all">
            {dataDir}
          </p>
        )}
      </div>
    </div>
  );
}
