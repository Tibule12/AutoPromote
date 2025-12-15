import React from "react";
import ReactDOM from "react-dom/client";
import initSentry, { Sentry } from "./sentryClient";
import { send as frontendLog } from "./utils/frontendLogger";
import { HashRouter } from "react-router-dom";
import "./App.css";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
initSentry();
root.render(
  <HashRouter>
    {Sentry ? (
      <Sentry.ErrorBoundary fallback={<div>An error occurred</div>}>
        <App />
      </Sentry.ErrorBoundary>
    ) : (
      <App />
    )}
  </HashRouter>
);

// Global error handlers: forward to backend logging endpoint when enabled
window.addEventListener("error", event => {
  try {
    frontendLog("error", event.message || "window error", { filename: event.filename, lineno: event.lineno });
  } catch (e) {}
});
window.addEventListener("unhandledrejection", event => {
  try {
    const reason = event.reason || {};
    frontendLog("error", reason.message || "unhandledrejection", { reason });
  } catch (e) {}
});
