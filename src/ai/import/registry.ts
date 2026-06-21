/**
 * Doc-type module registry — the contract every AI-import pipeline implements.
 *
 * The wizard shell (`ImportWizard.tsx`) owns the cross-cutting concerns: the
 * type picker, file pick, the "extracting…/saving…" states, typed error banners,
 * and storing the source file as an attachment. Each *document type* plugs in a
 * `DocTypeModule` that owns only what is specific to it: the extraction prompt,
 * validation, controlled-vocabulary resolution, the review UI and the save.
 *
 * Adding a section to AI import = write one module + list it in `modules.ts`.
 */

import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import type { AIProvider, DocumentInput } from "../types";
import type { Biomarker, Medication } from "@/db/schema";

/** Every document type the wizard can import. */
export type DocType = "lab" | "vaccine" | "discharge" | "imaging" | "prescription" | "allergy";

/**
 * Shared lookups + services threaded into every module at extract and save time,
 * so modules never re-read the same things from the DB layer themselves.
 */
export type ImportContext = {
  profileId: number;
  provider: AIProvider;
  /** Biomarker dictionary — lab resolution; harmless for other modules. */
  biomarkers: Biomarker[];
  /** Existing medications — prescription module dedupes against these. */
  medications: Medication[];
  /** Absolute path of the picked source file (null only in degenerate cases). */
  sourceFilePath: string | null;
  /** Re-fetch shared lookups, e.g. after a module creates a custom biomarker. */
  reloadLookups: () => Promise<void>;
};

/** Props the shell passes to a module's review component. */
export type ReviewProps<Draft> = {
  draft: Draft;
  /** Replace the draft; the review component drives all in-place edits through this. */
  setDraft: (next: Draft) => void;
  ctx: ImportContext;
  /** Persist the draft. The shell shows the saving state and maps errors to a banner. */
  onSave: () => void;
};

/**
 * A self-contained import pipeline for one document type.
 * `Draft` is the module's review-ready state — extracted, resolved, and editable
 * by the user before anything is written to the database.
 */
export interface DocTypeModule<Draft> {
  readonly id: DocType;
  readonly icon: LucideIcon;
  /**
   * i18n key prefix under `importWizard`. The type picker reads
   * `importWizard.docTypes.<id>` / `.<id>Description`; review strings live under
   * `importWizard.<i18nKey>`.
   */
  readonly i18nKey: string;

  /**
   * Phase 1 (extract) + phase 2 (resolve) → a review-ready draft. Nothing is
   * written here. Throws `AIProviderError` on provider failure; the shell maps
   * the error kind to the right banner + affordance.
   */
  prepare(doc: DocumentInput, ctx: ImportContext): Promise<Draft>;

  /**
   * True when extraction parsed fine but found nothing usable. The shell then
   * shows the "is this the right document type?" affordance instead of a hard
   * error, routing the user back to the type picker.
   */
  isEmpty(draft: Draft): boolean;

  /** Review + edit UI, rendered inside the wizard shell. */
  Review: React.ComponentType<ReviewProps<Draft>>;

  /**
   * Persist the confirmed draft (phase 3). Returns the route to navigate to on
   * success. Throws on failure; the shell restores the review step + banner.
   */
  save(draft: Draft, ctx: ImportContext): Promise<string>;
}

/** Type-erased module as held by the registry (each has its own `Draft`). */
export type AnyDocTypeModule = DocTypeModule<any>;
