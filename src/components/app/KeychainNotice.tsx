import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { KeychainStatus } from "@/ai/keystore";

/**
 * Warns — with a live re-check — when the OS keychain can't store secrets.
 * Renders nothing while the status is unknown or available, so it's safe to
 * drop in above any keychain-backed control (AI keys, backup passphrase).
 */
export function KeychainNotice({
  status,
  checking,
  onRecheck,
}: {
  status: KeychainStatus | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  const { t } = useI18n();
  if (!status || status.available) return null;

  const isSecretService = status.backend === "Secret Service";

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <p className="flex items-start gap-1.5 font-medium">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
        {t("keychain.unavailableTitle")}
      </p>
      <p className="mt-1.5 text-muted-foreground">
        {isSecretService
          ? t("keychain.unavailableLinux")
          : t("keychain.unavailableGeneric", { backend: status.backend })}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2.5"
        onClick={onRecheck}
        disabled={checking}
      >
        {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {t("keychain.recheck")}
      </Button>
    </div>
  );
}
