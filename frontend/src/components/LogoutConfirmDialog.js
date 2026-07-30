import React from "react";
import "./LogoutConfirmDialog.css";

const getInitials = user => {
  const source = user?.name || user?.displayName || user?.email || "AP";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
};

const LogoutConfirmDialog = ({ user, isWorking = false, onCancel, onConfirm }) => {
  const displayName = user?.name || user?.displayName || "AutoPromote creator";
  const displayEmail = user?.email || "Current workspace session";

  return (
    <div
      className="logout-dialog-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isWorking) onCancel?.();
      }}
    >
      <section
        className="logout-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
      >
        <header className="logout-dialog__header">
          <a href="/" className="logout-dialog__brand" aria-label="AutoPromote home">
            <span aria-hidden="true">▶</span>
            <strong>AutoPromote</strong>
          </a>
          <button
            type="button"
            className="logout-dialog__close"
            onClick={onCancel}
            disabled={isWorking}
            aria-label="Close sign out confirmation"
          >
            ×
          </button>
        </header>

        <div className="logout-dialog__body">
          <span className="logout-dialog__eyebrow">Session control</span>
          <div className="logout-dialog__icon" aria-hidden="true">
            ↗
          </div>
          <h2 id="logout-dialog-title">Sign out of your workspace?</h2>
          <p id="logout-dialog-description">
            You’ll return to the AutoPromote welcome page. Sign in again whenever you want to reopen
            your creator tools and workspace.
          </p>

          <div className="logout-dialog__session">
            <span className="logout-dialog__avatar">{getInitials(user)}</span>
            <span>
              <strong>{displayName}</strong>
              <small>{displayEmail}</small>
            </span>
            <i>Active now</i>
          </div>

          <div className="logout-dialog__notice">
            <span aria-hidden="true">✓</span>
            <p>
              This signs out the current browser session. It does not delete your account or
              workspace.
            </p>
          </div>
        </div>

        <footer className="logout-dialog__actions">
          <button type="button" onClick={onCancel} disabled={isWorking}>
            Stay signed in
          </button>
          <button
            type="button"
            className="logout-dialog__confirm"
            onClick={onConfirm}
            disabled={isWorking}
          >
            {isWorking ? "Signing out…" : "Sign out safely"}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default LogoutConfirmDialog;
