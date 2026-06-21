/**
 * The registered AI-import document types, in the order the type picker shows
 * them. Adding a section to AI import = write a module under `docs/` and add it
 * to this list. Everything else (picker, file pick, error banners, attachment
 * storage) is handled by the wizard shell from the `DocTypeModule` contract.
 */

import type { AnyDocTypeModule, DocType } from "./registry";
import { labModule } from "./docs/lab";
import { vaccineModule } from "./docs/vaccine";
import { dischargeModule } from "./docs/discharge";
import { imagingModule } from "./docs/imaging";
import { prescriptionModule } from "./docs/prescription";
import { allergyModule } from "./docs/allergy";

export const DOC_TYPE_MODULES: AnyDocTypeModule[] = [
  labModule,
  vaccineModule,
  dischargeModule,
  imagingModule,
  prescriptionModule,
  allergyModule,
];

export function getDocTypeModule(id: DocType): AnyDocTypeModule | undefined {
  return DOC_TYPE_MODULES.find((m) => m.id === id);
}
