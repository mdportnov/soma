import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/**
 * Tiny brand signature — mirrors the Punto Cero breathing tool's footer.
 * Deliberately understated so it never competes with the screen's content;
 * the two names open in the system browser (never the app webview).
 */
export function PoweredBy({ className }: { className?: string }) {
  const { t } = useI18n();
  const link =
    "font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer";
  return (
    <p
      className={cn(
        "select-none text-center text-[10px] leading-none tracking-[0.12em] text-muted-foreground/70",
        className,
      )}
    >
      {t("poweredBy.prefix")}{" "}
      <button
        type="button"
        className={link}
        onClick={() => void openUrl("https://puntocero.space")}
      >
        Punto Cero
      </button>
      <span className="mx-1 opacity-60">&amp;</span>
      <button
        type="button"
        className={link}
        onClick={() => void openUrl("https://mikeportnov.com")}
      >
        Mike Portnov
      </button>
      <span className="ml-1.5 opacity-60">w/ ❤️</span>
    </p>
  );
}
