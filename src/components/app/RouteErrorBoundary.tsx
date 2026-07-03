import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { log } from "@/lib/logger";
import { useI18n } from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
  /** Changing this value resets the boundary — pass the route path so a broken
   *  page recovers automatically once the user navigates elsewhere. */
  resetKey?: string;
  onRetry: () => void;
};

type State = { error: Error | null };

/**
 * Per-route error surface. Unlike the app-root `ErrorBoundary` (a last-resort
 * full-screen fallback), this isolates a single page: a render throw — including
 * one re-thrown by `useQuery` on a failed load — shows an inline "couldn't load"
 * card with a Retry button instead of tearing down the whole shell. Retry
 * re-mounts the page (via `onRetry`) so its queries run again.
 */
class RouteErrorBoundaryInner extends React.Component<
  Props & { retryLabel: string; title: string; body: string },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error(error);
    if (info.componentStack) log.error(`Component stack:${info.componentStack}`);
  }

  componentDidUpdate(prev: Props) {
    // Auto-clear when navigating to a different route.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <div className="w-full max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-destructive" />
          <p className="mt-3 text-sm font-semibold text-foreground">{this.props.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{this.props.body}</p>
          <button
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry();
            }}
          >
            <RotateCw className="size-3.5" />
            {this.props.retryLabel}
          </button>
        </div>
      </div>
    );
  }
}

/** i18n wrapper so the class boundary can use translated copy. */
export function RouteErrorBoundary(props: Props) {
  const { t } = useI18n();
  return (
    <RouteErrorBoundaryInner
      {...props}
      title={t("errors.pageTitle")}
      body={t("errors.pageBody")}
      retryLabel={t("errors.retry")}
    />
  );
}
