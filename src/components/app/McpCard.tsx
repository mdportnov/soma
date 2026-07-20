import * as React from "react";
import { Cable, Check, Copy, Download, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  buildMcpSnippets,
  getMcpServerInfo,
  mcpClientsStatus,
  mcpInstall,
  type McpClientStatus,
  type McpServerInfo,
} from "@/lib/mcp";
import { Collapsible } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleRow } from "@/components/app/ToggleRow";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function CopyButton({
  text,
  label,
  copiedLabel,
}: {
  text: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5" onClick={copy}>
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

type RowState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

export function McpCard() {
  const { t } = useI18n();
  const [info, setInfo] = React.useState<McpServerInfo | null>(null);
  const [clients, setClients] = React.useState<McpClientStatus[] | null>(null);
  const [rows, setRows] = React.useState<Record<string, RowState>>({});
  const [manual, setManual] = React.useState(false);
  const [writesEnabled, setWritesEnabled] = React.useState(false);
  const [confirmWrites, setConfirmWrites] = React.useState(false);
  const writesInitialized = React.useRef(false);

  const serverPath = info?.path ?? "";

  const refreshClients = React.useCallback(async (path: string) => {
    try {
      const next = await mcpClientsStatus(path);
      setClients(next);
      // Seed the toggle from whatever's already on disk, once — so re-opening
      // Settings reflects reality instead of always resetting to "off".
      if (!writesInitialized.current) {
        writesInitialized.current = true;
        setWritesEnabled(next.some((c) => c.configured && c.writesEnabled));
      }
    } catch {
      setClients([]);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getMcpServerInfo()
      .then((i) => {
        if (cancelled) return;
        setInfo(i);
        void refreshClients(i.path);
      })
      .catch(() => !cancelled && setInfo(null));
    return () => {
      cancelled = true;
    };
  }, [refreshClients]);

  const install = async (c: McpClientStatus, withWrites: boolean) => {
    setRows((r) => ({ ...r, [c.id]: { kind: "busy" } }));
    try {
      const res = await mcpInstall(c.id, serverPath, withWrites);
      setRows((r) => ({
        ...r,
        [c.id]: {
          kind: "done",
          message: t("settings.mcp.installedToast", { path: res.configPath, client: c.label }),
        },
      }));
      await refreshClients(serverPath);
    } catch (e) {
      setRows((r) => ({
        ...r,
        [c.id]: {
          kind: "error",
          message: t("settings.mcp.installErr", {
            msg: e instanceof Error ? e.message : String(e),
          }),
        },
      }));
    }
  };

  const installAllDetected = async () => {
    if (!clients) return;
    for (const c of clients.filter((x) => x.detected)) {
      await install(c, writesEnabled);
    }
  };

  /** Re-writes every already-configured client's config with the new flag —
   * so flipping the switch takes effect without re-running install by hand. */
  const applyWritesToggle = async (next: boolean) => {
    setWritesEnabled(next);
    if (!clients) return;
    for (const c of clients.filter((x) => x.configured)) {
      await install(c, next);
    }
  };

  const snippets = React.useMemo(
    () => buildMcpSnippets(serverPath, writesEnabled),
    [serverPath, writesEnabled],
  );
  const detectedCount = clients?.filter((c) => c.detected).length ?? 0;

  return (
    <Collapsible
      title={t("settings.mcp.title")}
      description={t("settings.mcp.description")}
      defaultOpen={false}
      icon={<Cable className="size-4" />}
    >
      <div className="grid gap-4 p-5 pt-0">
        {info && !info.exists && (
          <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {t("settings.mcp.notBuilt")}
          </p>
        )}

        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          {t("settings.mcp.intro")}
        </p>

        {/* Write access toggle */}
        <div className="rounded-lg border bg-muted/30 p-1">
          <ToggleRow
            icon={ShieldAlert}
            label={t("settings.mcp.writesTitle")}
            description={t("settings.mcp.writesDesc")}
            checked={writesEnabled}
            onChange={(next) => {
              if (next) setConfirmWrites(true);
              else void applyWritesToggle(false);
            }}
          />
        </div>

        {/* One-click install list */}
        <div className="grid gap-2">
          {detectedCount > 1 && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                onClick={installAllDetected}
              >
                <Download className="size-3.5" /> {t("settings.mcp.installAllDetected")}
              </Button>
            </div>
          )}

          {clients?.map((c) => {
            const row = rows[c.id] ?? { kind: "idle" };
            const buttonLabel = c.configured
              ? t("settings.mcp.reinstall")
              : t("settings.mcp.install");
            return (
              <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{c.label}</p>
                      {c.configured ? (
                        <Badge variant="success">
                          <Check className="size-3" /> {t("settings.mcp.installed")}
                        </Badge>
                      ) : c.detected ? (
                        <Badge variant="secondary">{t("settings.mcp.detected")}</Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {t("settings.mcp.notFound")}
                        </span>
                      )}
                      {c.configured && (
                        <Badge variant={c.writesEnabled ? "warning" : "secondary"}>
                          {c.writesEnabled
                            ? t("settings.mcp.readWrite")
                            : t("settings.mcp.readOnly")}
                        </Badge>
                      )}
                    </div>
                    <code className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">
                      {c.configPath}
                    </code>
                  </div>
                  <Button
                    variant={c.configured ? "ghost" : "default"}
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={row.kind === "busy" || !serverPath}
                    onClick={() => install(c, writesEnabled)}
                  >
                    {row.kind === "busy" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    {buttonLabel}
                  </Button>
                </div>
                {row.kind === "done" && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-success">
                    <Check className="mt-0.5 size-3 shrink-0" /> {row.message}
                  </p>
                )}
                {row.kind === "error" && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-destructive">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" /> {row.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Server path */}
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">{t("settings.mcp.serverPath")}</p>
            <code className="mt-1 block break-all font-mono text-[11px] text-muted-foreground">
              {serverPath || "—"}
            </code>
          </div>
          {serverPath && (
            <CopyButton
              text={serverPath}
              label={t("settings.mcp.copyPath")}
              copiedLabel={t("settings.mcp.copied")}
            />
          )}
        </div>

        {/* Manual fallback */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={() => setManual((m) => !m)}
          >
            {manual ? t("settings.mcp.manualHide") : t("settings.mcp.manualShow")}
          </Button>
        </div>

        {manual && (
          <div className="grid gap-3">
            {snippets.map((s) => (
              <div key={s.id} className="grid gap-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{s.label}</span>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {s.location}
                  </Badge>
                </div>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 pr-20 font-mono text-[11.5px] leading-relaxed">
                    <code>{s.code}</code>
                  </pre>
                  <div className="absolute right-2 top-2">
                    <CopyButton
                      text={s.code}
                      label={t("settings.mcp.copy")}
                      copiedLabel={t("settings.mcp.copied")}
                    />
                  </div>
                </div>
                {s.cli && (
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 pr-20 font-mono text-[11.5px]">
                      <code>{s.cli}</code>
                    </pre>
                    <div className="absolute right-2 top-2">
                      <CopyButton
                        text={s.cli}
                        label={t("settings.mcp.copy")}
                        copiedLabel={t("settings.mcp.copied")}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmWrites}
        title={t("settings.mcp.writesConfirm.title")}
        description={t("settings.mcp.writesConfirm.body")}
        confirmLabel={t("settings.mcp.writesConfirm.confirm")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          setConfirmWrites(false);
          void applyWritesToggle(true);
        }}
        onClose={() => setConfirmWrites(false)}
      />
    </Collapsible>
  );
}
