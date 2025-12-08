import React from 'react';
import initSentry, { Sentry } from '../sentryClient';

initSentry();

export default function TestSentryButton() {
  const triggerManual = async () => {
    try {
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.configureScope((scope) => {
          scope.setTag('test-button', 'true');
          scope.addBreadcrumb({ category: 'ui.test', message: 'User clicked test manual capture', level: 'info' });
        });
        Sentry.captureException(new Error('Sentry UI test: manual capture from Test Sentry Button'));
      } else {
        console.warn('Sentry not initialized.');
      }
    } catch (e) {
      console.warn('Failed to capture Sentry event:', e.message || e);
    }
  };

  const triggerServer = async () => {
    try {
      // Trigger a server-side Sentry test event (if server has SENTRY enabled)
      await fetch('/api/test/sentry', { method: 'GET', credentials: 'include' });
    } catch (e) {
      console.warn('Failed to call /api/test/sentry', e.message || e);
    }
  };

  const triggerThrow = () => {
    // This intentionally throws to be observed by ErrorBoundary
    throw new Error('Sentry UI test: intentional throw from Test Sentry Button');
  };

  return (
    <div style={{ padding: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button type="button" onClick={triggerManual} style={{ padding: '6px 10px' }}>Test Sentry (manual)</button>
      <button type="button" onClick={triggerServer} style={{ padding: '6px 10px' }}>Test Sentry (server)</button>
      <button type="button" onClick={triggerThrow} style={{ padding: '6px 10px' }}>Test Sentry (throw)</button>
    </div>
  );
}
