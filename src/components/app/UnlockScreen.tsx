import * as React from "react";
import { Loader2, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logo from "@/assets/logo.svg";

/**
 * Full-screen passphrase gate shown at launch when the database is encrypted in
 * passphrase mode, before the SQLite connection is opened. `onUnlock` performs
 * the decrypt/verify and continues boot; a rejection (wrong passphrase) keeps
 * the screen up with an error.
 */
export function UnlockScreen({ onUnlock }: { onUnlock: (passphrase: string) => Promise<void> }) {
  const { t } = useI18n();
  const [pass, setPass] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!pass || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUnlock(pass);
      // On success the parent unmounts this screen; leave `busy` true so the
      // form stays disabled through the transition.
    } catch {
      setError(t("unlock.wrong"));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <img src={logo} alt="Soma" className="size-10" />
          <div className="mt-4 flex size-10 items-center justify-center rounded-full bg-secondary">
            <Lock className="size-5 text-secondary-foreground" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">{t("unlock.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("unlock.description")}</p>
        </div>

        <form
          className="mt-5 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={t("unlock.passphrase")}
            autoFocus
            autoComplete="current-password"
            disabled={busy}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={!pass || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Lock />}
            {busy ? t("unlock.unlocking") : t("unlock.unlock")}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t("unlock.forgot")}</p>
        </form>
      </div>
    </div>
  );
}
