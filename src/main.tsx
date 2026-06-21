import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { initLogging } from "./lib/logger";
import { applyThemePreference, loadThemePreference } from "./lib/theme";
import "./index.css";

initLogging();
// Apply the stored theme before first paint to avoid a flash of the wrong theme.
// The live OS-appearance listener is owned by <App> so it can be cleaned up.
applyThemePreference(loadThemePreference());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
