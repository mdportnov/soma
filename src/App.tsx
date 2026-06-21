import * as React from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { watchSystemTheme } from "@/lib/theme";
import { AppProvider } from "@/app/AppContext";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/app/Toast";
import { Shell } from "@/app/Shell";
import { Dashboard } from "@/pages/Dashboard";
import { Timeline } from "@/pages/Timeline";
import { Biomarkers } from "@/pages/Biomarkers";
import { BiomarkerDetail } from "@/pages/BiomarkerDetail";
import { Labs } from "@/pages/Labs";
import { LabPanelNew } from "@/pages/LabPanelNew";
import { LabPanelDetail } from "@/pages/LabPanelDetail";
import { VerifyImport } from "@/pages/VerifyImport";
import { ImportWizard } from "@/pages/ImportWizard";
import { Medications } from "@/pages/Medications";
import { MedicationDetail } from "@/pages/MedicationDetail";
import { Visits } from "@/pages/Visits";
import { VisitDetail } from "@/pages/VisitDetail";
import { Diagnoses } from "@/pages/Diagnoses";
import { DiagnosisDetail } from "@/pages/DiagnosisDetail";
import { Allergies } from "@/pages/Allergies";
import { Vaccines } from "@/pages/Vaccines";
import { EmergencyCard } from "@/pages/EmergencyCard";
import { Journal } from "@/pages/Journal";
import { Imaging } from "@/pages/Imaging";
import { ImagingNew } from "@/pages/ImagingNew";
import { AiAnalysis } from "@/pages/AiAnalysis";
import { Settings } from "@/pages/Settings";

export default function App() {
  // Re-apply the theme when the OS appearance changes (while pref = system);
  // the returned disposer removes the matchMedia listener on unmount.
  React.useEffect(() => watchSystemTheme(), []);

  return (
    <I18nProvider>
      <AppProvider>
        <ToastProvider>
          <HashRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Dashboard />} />
                <Route path="timeline" element={<Timeline />} />
                <Route path="biomarkers" element={<Biomarkers />} />
                <Route path="biomarkers/:id" element={<BiomarkerDetail />} />
                <Route path="labs" element={<Labs />} />
                <Route path="labs/new" element={<LabPanelNew />} />
                <Route path="labs/import" element={<ImportWizard />} />
                <Route path="labs/:id" element={<LabPanelDetail />} />
                <Route path="labs/:id/verify" element={<VerifyImport />} />
                <Route path="medications" element={<Medications />} />
                <Route path="medications/:id" element={<MedicationDetail />} />
                <Route path="visits" element={<Visits />} />
                <Route path="visits/:id" element={<VisitDetail />} />
                <Route path="diagnoses" element={<Diagnoses />} />
                <Route path="diagnoses/:id" element={<DiagnosisDetail />} />
                <Route path="allergies" element={<Allergies />} />
                <Route path="vaccines" element={<Vaccines />} />
                <Route path="emergency" element={<EmergencyCard />} />
                <Route path="journal" element={<Journal />} />
                <Route path="imaging" element={<Imaging />} />
                <Route path="imaging/new" element={<ImagingNew />} />
                <Route path="imaging/:id" element={<ImagingNew />} />
                <Route path="assistant" element={<AiAnalysis />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </HashRouter>
        </ToastProvider>
      </AppProvider>
    </I18nProvider>
  );
}
