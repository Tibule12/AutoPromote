import React, { useEffect, useRef } from "react";
import "./TelegramConnectDialog.css";

export default function TelegramConnectDialog({ state, onClose, onRetry }) {
  const panel = useRef(null);
  const opened = Boolean(state);
  useEffect(() => {
    if (!opened) return;
    const previous = document.activeElement;
    panel.current?.focus();
    const keydown = event => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = [...panel.current.querySelectorAll("a[href], button:not([disabled])")];
      const first = controls[0],
        last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [opened, onClose]);
  if (!state) return null;
  return (
    <div
      className="telegram-connect-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className="telegram-connect-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-connect-title"
        aria-describedby="telegram-connect-description"
      >
        <button
          className="telegram-connect-close"
          type="button"
          aria-label="Close Telegram connection"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="telegram-connect-title">
          {state.status === "connected" ? "Telegram connected" : "Connect Telegram"}
        </h2>
        <p id="telegram-connect-description">
          {state.status === "connected"
            ? "Your Telegram account is linked to AutoPromote."
            : "Use Telegram in your browser, or open the installed app."}
        </p>
        {state.status === "preparing" && <p role="status">Preparing your connection…</p>}
        {state.status === "ready" && (
          <>
            <ol>
              <li>Open Telegram Web and sign in if needed.</li>
              <li>
                Press <strong>Start</strong> in the bot chat.
              </li>
              <li>Return here. AutoPromote will check the connection automatically.</li>
            </ol>
            <div className="telegram-connect-actions">
              <a
                className="telegram-connect-primary"
                href={state.links.webUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Telegram Web
              </a>
              <a href={state.links.appUrl} target="_blank" rel="noopener noreferrer">
                Open installed Telegram app
              </a>
            </div>
            <p className="telegram-connect-note">
              No desktop app is needed for Telegram Web. This link expires after 10 minutes.
            </p>
          </>
        )}
        {state.status === "error" && (
          <>
            <p role="alert">{state.message}</p>
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          </>
        )}
        {state.status === "connected" && (
          <button className="telegram-connect-primary" type="button" onClick={onClose}>
            Done
          </button>
        )}
      </section>
    </div>
  );
}
