import * as React from "react";
import { getKeychainStatus, type KeychainStatus } from "@/ai/keystore";

/**
 * Live keychain availability with an explicit re-check. Probes on mount and
 * exposes `recheck()` so the UI can re-probe after the user installs a keyring
 * service — the result is never cached, so a previously-failed state clears the
 * moment the backend becomes reachable.
 */
export function useKeychainStatus() {
  const [status, setStatus] = React.useState<KeychainStatus | null>(null);
  const [checking, setChecking] = React.useState(false);

  const recheck = React.useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await getKeychainStatus());
    } catch (e) {
      setStatus({
        available: false,
        backend: "OS keychain",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void recheck();
  }, [recheck]);

  return { status, checking, recheck };
}
