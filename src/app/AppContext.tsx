import * as React from "react";
import { initDatabase } from "@/db/client";
import { ensureActiveProfile, isOnboarded } from "@/db/repos";
import { initBackupScheduler } from "@/lib/backup";
import {
  initVaultCloseHook,
  quarantinePlaintext,
  restoreAttachments,
  unlockKeychain,
  unlockPassphrase,
  unlockWithKey,
  vaultState,
  verifyPassphrase,
} from "@/lib/db-encryption";
import {
  planAfterFailedUnlock,
  planStartup,
  PROBE_FAILED_PLAN,
  type StartupPlan,
  type VaultState,
} from "@/lib/startup-gate";
import { useI18n } from "@/lib/i18n";
import { INTERESTS_EVENT } from "@/lib/interests";
import { DASHBOARD_PREFS_EVENT } from "@/lib/dashboard-prefs";
import { NOTIFICATION_PREFS_EVENT } from "@/lib/notifications";
import { hydratePersonalizationFromDb, syncPersonalizationToDb } from "@/lib/personalization";
import { Loading } from "@/components/app/Loading";
import { UnlockScreen } from "@/components/app/UnlockScreen";
import { VaultBlockedScreen } from "@/components/app/VaultBlockedScreen";
import { Onboarding } from "@/pages/Onboarding";

type AppState = { profileId: number };

const AppContext = React.createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/**
 * Boots the local database (migrations + seed) and resolves the active profile.
 *
 * Before any of that, it consults the startup gate. The one rule that governs
 * this component: **while an encrypted vault exists on disk, Soma never opens a
 * new database.** `initDatabase()` creates `soma.db` if it is missing, so
 * reaching it on a machine that has a vault means silently replacing the user's
 * health record with an empty one and offering them onboarding. Every path that
 * cannot confidently unlock therefore ends at <VaultBlockedScreen>, not at a
 * boot. The decision itself lives in `@/lib/startup-gate`, where it is a pure
 * function with tests.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = React.useState<AppState | null>(null);
  const [onboarded, setOnboarded] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** The current startup plan; null while it is still being worked out. */
  const [plan, setPlan] = React.useState<StartupPlan | null>(null);
  /** Last known on-disk state, so the recovery screen can point at the folder. */
  const [vault, setVault] = React.useState<VaultState | null>(null);
  /** True when a crashed session left a newer plaintext DB next to the vault. */
  const hadPlaintext = React.useRef(false);
  const cancelled = React.useRef(false);
  const stopScheduler = React.useRef<(() => void) | null>(null);

  const boot = React.useCallback(async () => {
    await initDatabase();
    const profileId = await ensureActiveProfile();
    // Pull layout/notification prefs from a restored profile before the shell
    // renders, so the sidebar and dashboard come up already personalized.
    await hydratePersonalizationFromDb(profileId);
    const onboardedNow = await isOnboarded(profileId);
    if (cancelled.current) return;
    setOnboarded(onboardedNow);
    setState({ profileId });
    stopScheduler.current = initBackupScheduler();
    // Re-lock the database on the next clean exit (no-op while encryption off).
    void initVaultCloseHook();
  }, []);

  /** Carries out a plan, or parks on one that needs the user. */
  const execute = React.useCallback(
    async (next: StartupPlan) => {
      setPlan(next);
      switch (next.action) {
        case "boot":
          if (next.restoreAttachments) {
            // Best effort: the ciphertext survives a failure here, and a
            // missing PDF must never stop someone reaching their records.
            await restoreAttachments().catch((e) =>
              console.error("Sealed attachments could not be restored:", e),
            );
          }
          await boot();
          return;
        case "unlockKeychain":
          try {
            await unlockKeychain();
          } catch (e) {
            console.error("Keychain unlock failed:", e);
            setPlan(planAfterFailedUnlock(e));
            return;
          }
          await boot();
          return;
        // Both of these render a screen and wait for the user.
        case "promptPassphrase":
          hadPlaintext.current = next.verifyOnly;
          return;
        case "blocked":
          return;
      }
    },
    [boot],
  );

  /** Re-reads the disk and starts over. Also the "Try again" button. */
  const resolve = React.useCallback(async () => {
    setPlan(null);
    let next: StartupPlan;
    try {
      const vs = await vaultState();
      if (cancelled.current) return;
      setVault(vs);
      next = planStartup(vs);
    } catch (e) {
      // A probe failure is not permission to assume there is no encryption.
      // That assumption is what turned a locked vault into an onboarding
      // screen; the app stops here instead and says it does not know.
      console.error("Could not read the vault state:", e);
      next = PROBE_FAILED_PLAN;
    }
    if (cancelled.current) return;
    try {
      await execute(next);
    } catch (e) {
      if (cancelled.current) return;
      console.error("Startup failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [execute]);

  React.useEffect(() => {
    cancelled.current = false;
    void resolve();
    return () => {
      cancelled.current = true;
      stopScheduler.current?.();
    };
    // Runs once: `resolve` is stable and re-running it would re-boot the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror any personalization change up to the profile so it survives a backup
  // restore / new device. One subscriber covers every screen that edits prefs.
  React.useEffect(() => {
    const profileId = state?.profileId;
    if (profileId == null) return;
    const sync = () => void syncPersonalizationToDb(profileId);
    window.addEventListener(INTERESTS_EVENT, sync);
    window.addEventListener(DASHBOARD_PREFS_EVENT, sync);
    window.addEventListener(NOTIFICATION_PREFS_EVENT, sync);
    return () => {
      window.removeEventListener(INTERESTS_EVENT, sync);
      window.removeEventListener(DASHBOARD_PREFS_EVENT, sync);
      window.removeEventListener(NOTIFICATION_PREFS_EVENT, sync);
    };
  }, [state?.profileId]);

  // Called by the unlock screen. A rejection propagates so it can show "wrong
  // passphrase"; once unlocked, boot errors are surfaced as app errors instead.
  const handleUnlock = React.useCallback(
    async (passphrase: string) => {
      if (hadPlaintext.current) {
        await verifyPassphrase(passphrase);
        // The live database survived, but the attachments are still sealed and
        // would be missing from every record until the next lock/unlock cycle.
        await restoreAttachments(passphrase).catch((e) =>
          console.error("Sealed attachments could not be restored:", e),
        );
      } else {
        await unlockPassphrase(passphrase);
      }
      setPlan({ action: "boot", restoreAttachments: false });
      try {
        await boot();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [boot],
  );

  /** Recovery screen: unlock with a hex key the user pasted. */
  const handleUnlockWithKey = React.useCallback(
    async (keyHex: string) => {
      await unlockWithKey(keyHex);
      setPlan({ action: "boot", restoreAttachments: false });
      await boot();
    },
    [boot],
  );

  /** Recovery screen: move an unexpected plaintext DB aside, then start over. */
  const handleQuarantine = React.useCallback(async () => {
    await quarantinePlaintext();
    await resolve();
  }, [resolve]);

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

  if (plan?.action === "blocked") {
    return (
      <VaultBlockedScreen
        plan={plan}
        dataDir={vault?.dataDir ?? null}
        onRetry={resolve}
        onUnlockWithKey={handleUnlockWithKey}
        onQuarantineAndUnlock={handleQuarantine}
      />
    );
  }

  if (plan?.action === "promptPassphrase") return <UnlockScreen onUnlock={handleUnlock} />;

  if (!state || onboarded === null) return <Loading label={t("loading.openingDatabase")} />;

  if (!onboarded) {
    return <Onboarding profileId={state.profileId} onDone={() => setOnboarded(true)} />;
  }

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}
