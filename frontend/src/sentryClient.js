import * as SentryLib from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";

// Exported binding that will be null when Sentry is not initialized
let Sentry = null;

export function initSentry() {
  try {
    // Only initialize Sentry when explicitly enabled and configured in production
    const dsn = process.env.REACT_APP_SENTRY_DSN;
    const enabled = String(process.env.REACT_APP_ENABLE_SENTRY || "0") === "1";
    const isProd = process.env.NODE_ENV === "production";
    if (!dsn || !enabled || !isProd) return false;

    SentryLib.init({
      dsn,
      integrations: [new BrowserTracing()],
      tracesSampleRate: parseFloat(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || "0.05"),
      environment: process.env.NODE_ENV || "development",
      release:
        process.env.REACT_APP_COMMIT_HASH ||
        process.env.REACT_APP_GIT_SHA ||
        process.env.REACT_APP_VERSION ||
        null,
      sendDefaultPii:
        String(process.env.REACT_APP_SENTRY_SEND_DEFAULT_PII || "false").toLowerCase() === "true" ||
        String(process.env.REACT_APP_SENTRY_SEND_DEFAULT_PII || "0") === "1",
      beforeSend(event) {
        if (event.request && event.request.headers) {
          const headers = { ...event.request.headers };
          if (headers.authorization) delete headers.authorization;
          if (headers.cookie) delete headers.cookie;
          event.request.headers = headers;
        }
        return event;
      },
    });

    // Expose initialized Sentry instance
    Sentry = SentryLib;
    if (typeof window !== "undefined") window.Sentry = Sentry;
    return true;
  } catch (e) {
    // Safe no-op when Sentry package is not installed or init fails

    console.warn("[Sentry] failed to initialize", e && e.message ? e.message : e);
    return false;
  }
}

export default initSentry;
export { Sentry };
