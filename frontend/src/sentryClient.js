import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

export function initSentry() {
  try {
    // Use env var if present, otherwise fall back to a provided DSN
    const defaultDsn = 'https://63a1444835dbfbbc9500d15fb0afdba4@o4510494724980736.ingest.us.sentry.io/4510494731141120';
    const dsn = process.env.REACT_APP_SENTRY_DSN || defaultDsn;
    if (!dsn) return;
    Sentry.init({
      dsn,
      integrations: [new BrowserTracing()],
      tracesSampleRate: parseFloat(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || '0.05'),
      environment: process.env.NODE_ENV || 'development',
      // sendDefaultPii can be toggled via REACT_APP_SENTRY_SEND_DEFAULT_PII (set to '1' or 'true')
      sendDefaultPii: ((String(process.env.REACT_APP_SENTRY_SEND_DEFAULT_PII || 'false')).toLowerCase() === 'true') || String(process.env.REACT_APP_SENTRY_SEND_DEFAULT_PII || '0') === '1',
      // Sanitize PII by default: remove Authorization header and cookies from event payloads
      beforeSend(event) {
        if (event.request && event.request.headers) {
          const headers = { ...event.request.headers };
          if (headers.authorization) delete headers.authorization;
          if (headers.cookie) delete headers.cookie;
          event.request.headers = headers;
        }
        return event;
      }
    });
    if (typeof window !== 'undefined') window.Sentry = Sentry;
  } catch (e) {
    // Safe no-op when Sentry package is not installed in test env
    // eslint-disable-next-line no-console
    console.warn('[Sentry] failed to initialize', e.message || e);
  }
}

export default initSentry;
export { Sentry };
