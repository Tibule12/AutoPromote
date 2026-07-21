import React from "react";
import ReactDOM from "react-dom/client";
import initSentry, { Sentry } from "./sentryClient";
import { send as frontendLog } from "./utils/frontendLogger";
import { isExpectedMediaPlaybackInterruption } from "./utils/mediaPlayback";
import { HashRouter } from "react-router-dom";
import "./App.css";
import App from "./App";
import { ToastProvider } from "./components/ToastProvider";
import { AuthProvider } from "./contexts/AuthContext";

if (typeof window !== "undefined" && !window.location.hash) {
  const routePath = window.location.pathname || "/";
  if (routePath === "/reset-password" || routePath === "/forgot-password") {
    const hashTarget = `#${routePath}${window.location.search || ""}`;
    window.history.replaceState(null, "", `${window.location.origin}/${hashTarget}`);
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
initSentry();
root.render(
  <HashRouter
    future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    }}
  >
    {Sentry ? (
      <Sentry.ErrorBoundary fallback={<div>An error occurred</div>}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </Sentry.ErrorBoundary>
    ) : (
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    )}
  </HashRouter>
);

// Global error handlers: forward to backend logging endpoint when enabled
window.addEventListener("error", event => {
  try {
    frontendLog("error", event.message || "window error", {
      filename: event.filename,
      lineno: event.lineno,
    });
  } catch (e) {}
});
window.addEventListener("unhandledrejection", event => {
  try {
    const reason = event.reason || {};
    if (isExpectedMediaPlaybackInterruption(reason)) {
      event.preventDefault();
      return;
    }
    frontendLog("error", reason.message || "unhandledrejection", { reason });
  } catch (e) {}
});
