import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { initLogging } from "./lib/logger";
import { applyThemePreference, loadThemePreference, watchSystemTheme } from "./lib/theme";
import "./index.css";

initLogging();
applyThemePreference(loadThemePreference());
watchSystemTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
