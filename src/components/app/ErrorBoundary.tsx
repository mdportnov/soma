import * as React from "react";
import { log } from "@/lib/logger";

type State = { error: Error | null; info: string | null };

/**
 * Last-resort error surface: render crashes show a readable screen with the
 * stack and a reload button instead of unmounting to a white window. Texts are
 * intentionally not i18n-dependent — the boundary must render even when
 * providers above it are broken.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info: info.componentStack ?? null });
    log.error(error);
    if (info.componentStack) log.error(`Component stack:${info.componentStack}`);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n${error.stack ?? ""}\n${info ?? ""}`;
    return (
      <div className="flex h-screen items-center justify-center bg-background p-8 text-foreground">
        <div className="w-full max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm font-semibold text-destructive">
            Something went wrong / Что-то пошло не так
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The error has been written to the log file (Settings → Open logs).
          </p>
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-background p-3 text-[11px] leading-snug">
            {details}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() => void navigator.clipboard.writeText(details)}
            >
              Copy details
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
