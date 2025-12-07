import React from 'react';
import ReactDOM from 'react-dom/client';
import initSentry, { Sentry } from './sentryClient';
import { HashRouter } from 'react-router-dom';
import './App.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
initSentry();
root.render(
  <HashRouter>
    { Sentry ? (
      <Sentry.ErrorBoundary fallback={<div>An error occurred</div>}>
        <App />
      </Sentry.ErrorBoundary>
    ) : (
      <App />
    ) }
  </HashRouter>
);
