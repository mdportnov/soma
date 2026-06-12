import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { initLogging } from "./lib/logger";
import { applyTheme, loadTheme } from "./lib/theme";
import "./index.css";

initLogging();
applyTheme(loadTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
