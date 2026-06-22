import * as React from "react";
import { dismissHint, isHintDismissed, restoreHint } from "@/lib/hints";

/**
 * Reactive wrapper over the localStorage hint store. Each hint `id` is
 * independent; the value is read once on mount and kept in sync locally on
 * dismiss/restore (localStorage itself isn't reactive, which is fine — a hint is
 * only ever toggled from its own card).
 */
export function useDismissed(id: string) {
  const [dismissed, setDismissed] = React.useState(() => isHintDismissed(id));

  // Re-sync if the id changes (e.g. one card reused across a list of hints).
  React.useEffect(() => setDismissed(isHintDismissed(id)), [id]);

  const dismiss = React.useCallback(() => {
    dismissHint(id);
    setDismissed(true);
  }, [id]);

  const restore = React.useCallback(() => {
    restoreHint(id);
    setDismissed(false);
  }, [id]);

  return { dismissed, dismiss, restore };
}
