import * as React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ExternalLink, FileText, FolderOpen, ImageIcon, Paperclip } from "lucide-react";
import type { Attachment } from "@/db/schema";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function isPdf(a: Attachment): boolean {
  return a.mimeType === "application/pdf" || a.filePath.toLowerCase().endsWith(".pdf");
}

function isImage(a: Attachment): boolean {
  return a.mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(a.filePath);
}

/** Filename portion of a stored attachment path (drops the timestamp prefix added at import). */
export function attachmentName(a: Attachment): string {
  const base = a.filePath.split(/[/\\]/).pop() ?? a.filePath;
  return base.replace(/^\d{10,}-/, "");
}

/** Renders the document itself (PDF iframe / image) with a missing-file fallback.
 *  Shared by the modal preview and the side-by-side verify pane. */
function DocBody({
  attachment,
  page,
  className,
}: {
  attachment: Attachment;
  page?: number | null;
  className?: string;
}) {
  const { t } = useI18n();
  const [available, setAvailable] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let active = true;
    setAvailable(null);
    exists(attachment.filePath)
      .then((ok) => active && setAvailable(ok))
      .catch(() => active && setAvailable(false));
    return () => {
      active = false;
    };
  }, [attachment]);

  const src = convertFileSrc(attachment.filePath);
  const name = attachmentName(attachment);

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-muted/30", className)}>
      {available === false ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <FileText className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("sourceFile.missing")}</p>
        </div>
      ) : available === null ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">{t("sourceFile.loading")}</p>
        </div>
      ) : isPdf(attachment) ? (
        <iframe
          key={`${src}#${page ?? ""}`}
          src={page != null ? `${src}#page=${page}` : src}
          title={name}
          className="h-full w-full"
        />
      ) : isImage(attachment) ? (
        <div className="flex h-full items-center justify-center overflow-auto p-2">
          <img src={src} alt={name} className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <FileText className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("sourceFile.previewUnsupported")}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Inline viewer for an imported source document — the heart of the file link.
 * Renders PDFs and images directly inside the app (via the asset protocol) and
 * always offers OS-level "open" / "reveal" as a fallback. Deep-links to the page
 * a value was read from when one is known.
 */
export function SourceFilePreview({
  attachment,
  open,
  onClose,
  page,
}: {
  attachment: Attachment | null;
  open: boolean;
  onClose: () => void;
  page?: number | null;
}) {
  const { t } = useI18n();
  if (!attachment) return null;
  const name = attachmentName(attachment);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={name}
      description={
        page != null ? t("sourceFile.fromPage", { n: String(page) }) : t("sourceFile.title")
      }
      className="max-w-4xl"
    >
      <div className="flex h-[70vh] flex-col">
        <DocBody attachment={attachment} page={page} className="min-h-0 flex-1" />
        <div className="mt-3 flex shrink-0 items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void revealItemInDir(attachment.filePath)}
          >
            <FolderOpen /> {t("sourceFile.revealInFinder")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void openPath(attachment.filePath)}>
            <ExternalLink /> {t("sourceFile.openExternally")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Non-modal document pane for the side-by-side verify screen. */
export function SourceDocPane({
  attachment,
  page,
  className,
}: {
  attachment: Attachment | null;
  page?: number | null;
  className?: string;
}) {
  const { t } = useI18n();
  if (!attachment) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border bg-muted/30 p-6 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">{t("sourceFile.manualEntry")}</p>
      </div>
    );
  }
  return <DocBody attachment={attachment} page={page} className={className} />;
}

/**
 * Compact affordance to view a record's source document. Renders nothing when
 * there is no attachment, so callers can drop it in unconditionally.
 */
export function SourceFileButton({
  attachment,
  page,
  label,
  variant = "outline",
  size = "sm",
  className,
}: {
  attachment: Attachment | null | undefined;
  page?: number | null;
  label?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "iconSm";
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (!attachment) return null;
  const icon = isImage(attachment) ? <ImageIcon /> : <FileText />;
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-label={label ?? t("sourceFile.openInApp")}
      >
        {size === "iconSm" ? <Paperclip /> : icon}
        {size !== "iconSm" && (label ?? t("sourceFile.openInApp"))}
      </Button>
      <SourceFilePreview
        attachment={attachment}
        page={page}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** Small inline "Page N" link that opens the source at that page. */
export function SourcePageLink({
  attachment,
  page,
}: {
  attachment: Attachment | null | undefined;
  page: number | null | undefined;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (!attachment || page == null) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        <Paperclip className="size-3" /> {t("sourceFile.page", { n: String(page) })}
      </button>
      <SourceFilePreview
        attachment={attachment}
        page={page}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
