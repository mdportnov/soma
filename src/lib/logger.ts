import { error as logError, info as logInfo, warn as logWarn } from "@tauri-apps/plugin-log";

function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/** Best-effort file logging — never let a logging failure break the app. */
function safe(fn: (msg: string) => Promise<void>, msg: string) {
  void fn(msg).catch(() => {});
}

/**
 * Mirrors console.warn/error and uncaught errors/rejections into the rotating
 * log file (tauri-plugin-log → ~/Library/Logs/<bundle id>/soma.log on macOS),
 * keeping the original console behavior intact.
 */
export function initLogging(): void {
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    safe(logWarn, stringify(args));
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    safe(logError, stringify(args));
  };

  window.addEventListener("error", (e) => {
    safe(logError, `Uncaught: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    safe(logError, `Unhandled rejection: ${stringify([e.reason])}`);
  });

  safe(logInfo, `Soma frontend started (${navigator.language}, ${window.location.hash || "#/"})`);
}

/** Explicit logging API for app code. */
export const log = {
  info: (msg: string) => safe(logInfo, msg),
  warn: (msg: string) => safe(logWarn, msg),
  error: (msg: string | Error) => safe(logError, msg instanceof Error ? stringify([msg]) : msg),
};
