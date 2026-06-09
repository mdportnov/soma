import * as React from "react";
import { initDatabase } from "@/db/client";
import { ensureActiveProfile } from "@/db/repos";
import { Loading } from "@/components/app/Loading";

type AppState = { profileId: number };

const AppContext = React.createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Boots the local database (migrations + seed) and resolves the active profile. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const profileId = await ensureActiveProfile();
        setState({ profileId });
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <p className="font-semibold text-destructive">Failed to open the local database</p>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!state) return <Loading label="Opening local database…" />;

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}
