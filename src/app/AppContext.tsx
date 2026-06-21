import * as React from "react";
import { initDatabase } from "@/db/client";
import { ensureActiveProfile, isOnboarded } from "@/db/repos";
import { initBackupScheduler } from "@/lib/backup";
import { useI18n } from "@/lib/i18n";
import { Loading } from "@/components/app/Loading";
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

  React.useEffect(() => {
    let cancelled = false;
    let stopScheduler: (() => void) | null = null;
    (async () => {
      try {
        await initDatabase();
        const profileId = await ensureActiveProfile();
        const onboardedNow = await isOnboarded(profileId);
        if (cancelled) return;
        setOnboarded(onboardedNow);
        setState({ profileId });
        stopScheduler = initBackupScheduler();
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

  if (!state || onboarded === null) return <Loading label={t("loading.openingDatabase")} />;

  if (!onboarded) {
    return <Onboarding profileId={state.profileId} onDone={() => setOnboarded(true)} />;
  }

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}
