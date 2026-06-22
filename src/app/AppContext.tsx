import * as React from "react";
import { initDatabase } from "@/db/client";
import { ensureActiveProfile, isOnboarded } from "@/db/repos";
import { initBackupScheduler } from "@/lib/backup";
import {
  initVaultCloseHook,
  unlockKeychain,
  unlockPassphrase,
  vaultState,
  verifyPassphrase,
  type VaultState,
} from "@/lib/db-encryption";
import { useI18n } from "@/lib/i18n";
import { Loading } from "@/components/app/Loading";
import { UnlockScreen } from "@/components/app/UnlockScreen";
import { Onboarding } from "@/pages/Onboarding";

type AppState = { profileId: number };

const AppContext = React.createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Boots the local database (migrations + seed) and resolves the active profile. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = React.useState<AppState | null>(null);
  const [onboarded, setOnboarded] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // When the DB is encrypted in passphrase mode it must be unlocked before the
  // SQLite connection opens — render <UnlockScreen> until the user provides it.
  const [unlockNeeded, setUnlockNeeded] = React.useState(false);
  // True when a crash left a newer plaintext DB next to the vault: verify the
  // passphrase (to re-arm the session) instead of decrypting the stale vault.
  const hadPlaintext = React.useRef(false);
  const finishBoot = React.useRef<(() => Promise<void>) | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let stopScheduler: (() => void) | null = null;

    const boot = async () => {
      await initDatabase();
      const profileId = await ensureActiveProfile();
      const onboardedNow = await isOnboarded(profileId);
      if (cancelled) return;
      setOnboarded(onboardedNow);
      setState({ profileId });
      stopScheduler = initBackupScheduler();
      // Re-lock the database on the next clean exit (no-op while encryption off).
      void initVaultCloseHook();
    };
    finishBoot.current = boot;

    (async () => {
      try {
        let vs: VaultState;
        try {
          vs = await vaultState();
        } catch {
          // A vault-state probe failure must never brick startup — fall back to
          // "no encryption" so the app still opens.
          vs = { vaultExists: false, plaintextExists: true, mode: null, keychainKeyPresent: false };
        }
        if (vs.vaultExists && vs.mode === "passphrase") {
          // Passphrase mode always prompts at launch (decrypt, or verify+re-arm
          // when a crash left a plaintext DB behind).
          if (cancelled) return;
          hadPlaintext.current = vs.plaintextExists;
          setUnlockNeeded(true);
          return;
        }
        if (vs.vaultExists && vs.mode === "keychain" && !vs.plaintextExists) {
          await unlockKeychain();
        }
        if (cancelled) return;
        await boot();
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      stopScheduler?.();
    };
  }, []);

  // Called by the unlock screen. A rejection propagates so it can show "wrong
  // passphrase"; once unlocked, boot errors are surfaced as app errors instead.
  const handleUnlock = React.useCallback(async (passphrase: string) => {
    if (hadPlaintext.current) {
      await verifyPassphrase(passphrase);
    } else {
      await unlockPassphrase(passphrase);
    }
    setUnlockNeeded(false);
    try {
      await finishBoot.current?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <p className="font-semibold text-destructive">{t("error.databaseFailed")}</p>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (unlockNeeded) return <UnlockScreen onUnlock={handleUnlock} />;

  if (!state || onboarded === null) return <Loading label={t("loading.openingDatabase")} />;

  if (!onboarded) {
    return <Onboarding profileId={state.profileId} onDone={() => setOnboarded(true)} />;
  }

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}
