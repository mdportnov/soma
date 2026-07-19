import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Settings as SettingsIcon,
  Sparkles,
  Upload,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { listBiomarkers, listMedications } from "@/db/repos";
import { getConfiguredProvider } from "@/ai";
import { AIProviderError } from "@/ai/types";
import type { AIErrorKind } from "@/ai/types";
import { DOC_TYPE_MODULES, getDocTypeModule } from "@/ai/import/modules";
import type { AnyDocTypeModule, DocType, ImportContext } from "@/ai/import/registry";
import { mimeFromPath, toBase64 } from "@/lib/attachments";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { useToast } from "@/components/app/Toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { settingsPath } from "@/lib/settings-navigation";

/**
 * UI-facing import failure. `affordance` drives which action button (if any) the
 * banner offers; `kind === "empty"` is the "nothing usable found" case that sends
 * the user back to pick a different document type.
 */
type ImportError = {
  kind: AIErrorKind | "empty";
  affordance: "settings" | "retry" | "switchType" | "none";
  message: string;
};

/** Upper bound on a document sent to a provider. Vision models cap request size
 *  (typically ~20–30 MB incl. base64 overhead); reject earlier with guidance. */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

type Step =
  | { name: "selectType" }
  | { name: "pick" }
  | { name: "extracting" }
  // The review step is type-erased over each module's own Draft (contained here).
  | { name: "review"; module: AnyDocTypeModule; draft: any }
  | { name: "saving" };

/**
 * Where the wizard returns to (back link + breadcrumb parent) when launched from
 * a section page via `?type=`. Lets "Import from the Vaccines page" feel like it
 * belongs to vaccines, not labs. Falls back to labs for the generic entry point.
 */
const SECTIONS: Record<DocType, { to: string; navKey: string }> = {
  lab: { to: "/labs", navKey: "nav.labResults" },
  vaccine: { to: "/vaccines", navKey: "nav.vaccines" },
  discharge: { to: "/visits", navKey: "nav.visits" },
  imaging: { to: "/imaging", navKey: "nav.imaging" },
  prescription: { to: "/medications", navKey: "nav.medications" },
  allergy: { to: "/allergies", navKey: "nav.allergies" },
};

export function ImportWizard() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // A `?type=` query param preselects the document type and skips the picker,
  // so a section page (e.g. Vaccines) can deep-link straight into its own import.
  const preselectParam = searchParams.get("type");
  const preselect = React.useMemo<DocType | null>(
    () =>
      preselectParam && getDocTypeModule(preselectParam as DocType)
        ? (preselectParam as DocType)
        : null,
    [preselectParam],
  );

  const {
    data: boot,
    loading: booting,
    reload: reloadBoot,
  } = useQuery(async () => {
    const [provider, biomarkers, medications] = await Promise.all([
      getConfiguredProvider(),
      listBiomarkers(),
      listMedications(profileId),
    ]);
    return { provider, biomarkers, medications };
  }, [profileId]);

  const [docType, setDocType] = React.useState<DocType | null>(preselect);
  const [filePath, setFilePath] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>(
    preselect ? { name: "pick" } : { name: "selectType" },
  );
  const [error, setError] = React.useState<ImportError | null>(null);

  // The section this import belongs to — drives the back link + breadcrumb.
  const section = SECTIONS[docType ?? preselect ?? "lab"];
  const sectionCrumb = { label: t(section.navKey), to: section.to };

  if (booting || !boot) return <Loading />;

  // §5: stub everywhere an AI feature appears until a key is configured.
  if (!boot.provider) {
    return (
      <>
        <PageHeader
          back={section.to}
          breadcrumbs={crumbs(sectionCrumb, { label: t("breadcrumb.importWizard") })}
          title={t("importWizard.title")}
        />
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
              <Sparkles className="size-5 text-secondary-foreground" />
            </div>
            <p className="text-sm font-medium">{t("importWizard.aiDisabledTitle")}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t("importWizard.aiDisabledDescription")}
            </p>
            <Link to={settingsPath("ai")} className="mt-4">
              <Button>
                <SettingsIcon /> {t("importWizard.openSettings")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const provider = boot.provider;

  const ctx: ImportContext = {
    profileId,
    provider,
    biomarkers: boot.biomarkers,
    medications: boot.medications,
    sourceFilePath: filePath,
    reloadLookups: async () => {
      await reloadBoot();
    },
  };

  // Maps any thrown error onto the typed banner model: AI failures branch on
  // their `kind`, everything else falls back to a generic retry-less message.
  const toImportError = (e: unknown): ImportError => {
    if (e instanceof AIProviderError) {
      switch (e.kind) {
        case "auth":
          return { kind: "auth", affordance: "settings", message: t("importErrors.authBody") };
        case "rate_limit":
          return {
            kind: "rate_limit",
            affordance: "retry",
            message: t("importErrors.rateLimited"),
          };
        case "overloaded":
          return { kind: "overloaded", affordance: "retry", message: t("importErrors.overloaded") };
        case "network":
          return { kind: "network", affordance: "retry", message: t("importErrors.network") };
        case "bad_response":
          return {
            kind: "bad_response",
            affordance: "retry",
            message: t("importErrors.parseFailed"),
          };
        case "too_large":
          return {
            kind: "too_large",
            affordance: "switchType",
            message: t("importErrors.tooLarge"),
          };
        case "bad_request":
          return {
            kind: "bad_request",
            affordance: "none",
            message: t("importErrors.badRequest"),
          };
        default:
          return { kind: "unknown", affordance: "none", message: e.message };
      }
    }
    return {
      kind: "unknown",
      affordance: "none",
      message: e instanceof Error ? e.message : String(e),
    };
  };

  const pickFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Document", extensions: ["pdf", "jpg", "jpeg", "png", "webp"] }],
    });
    if (typeof selected === "string") {
      setFilePath(selected);
      setError(null);
    }
  };

  const runExtraction = async () => {
    if (!filePath || !docType) return;
    const module = getDocTypeModule(docType);
    if (!module) return;
    setStep({ name: "extracting" });
    setError(null);
    try {
      const bytes = await readFile(filePath);
      // Guard before spending an API call: an oversized file is rejected by the
      // provider (413) after a slow upload, so fail fast with clear guidance.
      if (bytes.byteLength > MAX_IMPORT_BYTES) {
        setError({
          kind: "too_large",
          affordance: "switchType",
          message: t("importErrors.fileTooLarge", {
            limit: String(Math.round(MAX_IMPORT_BYTES / (1024 * 1024))),
          }),
        });
        setStep({ name: "pick" });
        return;
      }
      const doc = {
        base64: toBase64(bytes),
        mimeType: mimeFromPath(filePath),
        fileName: filePath.split(/[/\\]/).pop(),
      };
      const draft = await module.prepare(doc, { ...ctx, sourceFilePath: filePath });
      if (module.isEmpty(draft)) {
        setError({
          kind: "empty",
          affordance: "switchType",
          message: t("importErrors.badDocumentBody"),
        });
        setStep({ name: "pick" });
        return;
      }
      setStep({ name: "review", module, draft });
    } catch (e) {
      console.error(e);
      setError(toImportError(e));
      setStep({ name: "pick" });
    }
  };

  const save = async (module: AnyDocTypeModule, draft: any) => {
    setStep({ name: "saving" });
    try {
      const route = await module.save(draft, { ...ctx, sourceFilePath: filePath });
      toast.show(t("toasts.importSaved"));
      navigate(route);
    } catch (e) {
      console.error(e);
      setError(toImportError(e));
      setStep({ name: "review", module, draft });
    }
  };

  const activeLabel = docType ? t(`importWizard.docTypes.${docType}`) : "";

  return (
    <>
      <PageHeader
        back={section.to}
        breadcrumbs={crumbs(sectionCrumb, { label: t("breadcrumb.importWizard") })}
        title={t("importWizard.title")}
        description={t("importWizard.description")}
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {error.kind === "auth"
                ? t("importErrors.authTitle")
                : error.kind === "empty"
                  ? t("importErrors.badDocumentTitle")
                  : t("importErrors.genericTitle")}
            </p>
            <p className="mt-0.5 text-xs opacity-90">{error.message}</p>
            {error.affordance === "settings" && (
              <Link to={settingsPath("ai")} className="mt-2 inline-block">
                <Button size="sm" variant="outline">
                  <SettingsIcon /> {t("importErrors.authAction")}
                </Button>
              </Link>
            )}
            {error.affordance === "retry" && (
              <Button size="sm" variant="outline" className="mt-2" onClick={runExtraction}>
                {t("importErrors.retry")}
              </Button>
            )}
            {error.affordance === "switchType" && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setError(null);
                  setStep({ name: "selectType" });
                }}
              >
                {t("importErrors.switchType")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* key={step.name} re-mounts the stage so transitions slide in */}
      <div key={step.name} className="animate-step-in">
        {step.name === "selectType" && (
          <SelectTypeStep
            value={docType}
            onChange={setDocType}
            onContinue={() => setStep({ name: "pick" })}
          />
        )}

        {step.name === "pick" && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
                {filePath ? (
                  <FileText className="size-5 text-secondary-foreground" />
                ) : (
                  <Upload className="size-5 text-secondary-foreground" />
                )}
              </div>
              {filePath ? (
                <>
                  <p className="max-w-sm truncate text-sm font-medium">
                    {filePath.split(/[/\\]/).pop()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("importWizard.anyLangHint")}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={pickFile}>
                      {t("importWizard.chooseAnother")}
                    </Button>
                    <Button onClick={runExtraction}>
                      <Sparkles /> {t("importWizard.extractResults")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {t("importWizard.choosePrompt", { type: activeLabel.toLowerCase() })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("importWizard.fileFormats")}
                  </p>
                  <Button className="mt-4" onClick={pickFile}>
                    <Upload /> {t("importWizard.chooseFile")}
                  </Button>
                </>
              )}
              <p className="mt-5 max-w-sm text-[11px] leading-snug text-muted-foreground">
                {t("importWizard.privacyNotice")}
              </p>
            </CardContent>
          </Card>
        )}

        {step.name === "extracting" && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Loader2 className="mb-3 size-6 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {docType === "lab"
                  ? t("importWizard.extractingMapping")
                  : t("importWizard.extractingDoc")}
              </p>
              {docType === "lab" && (
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t("importWizard.extractingMappingDetail")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {step.name === "review" && (
          <step.module.Review
            draft={step.draft}
            setDraft={(next) => setStep({ name: "review", module: step.module, draft: next })}
            ctx={ctx}
            onSave={() => save(step.module, step.draft)}
          />
        )}

        {step.name === "saving" && <Loading label={t("importWizard.savingPanel")} />}
      </div>
    </>
  );
}

function SelectTypeStep({
  value,
  onChange,
  onContinue,
}: {
  value: DocType | null;
  onChange: (v: DocType) => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{t("importWizard.selectType.title")}</CardTitle>
        <CardDescription>{t("importWizard.selectType.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {DOC_TYPE_MODULES.map((m) => {
          const Icon = m.icon;
          const selected = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Icon className="size-4.5 text-secondary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t(`importWizard.docTypes.${m.id}`)}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`importWizard.docTypes.${m.id}Description`)}
                </p>
              </div>
            </button>
          );
        })}
        <Button className="mt-2 self-end" disabled={value == null} onClick={onContinue}>
          {t("importWizard.selectType.continue")}
        </Button>
      </CardContent>
    </Card>
  );
}
