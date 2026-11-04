import React, { useEffect, useRef, useState } from "react";
import AutoPromoteLogo from "./AutoPromoteLogo";
import { verificationError } from "../utils/emailVerification";
import "../Auth.css";

export default function EmailVerificationScreen({
  email,
  sent,
  message,
  retryAfterSeconds = 0,
  onResend,
}) {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [delivered, setDelivered] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    setSeconds(retryAfterSeconds);
  }, [retryAfterSeconds]);
  useEffect(() => {
    if (!seconds) return undefined;
    const timer = setTimeout(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  const resend = async () => {
    if (inFlight.current || seconds || !onResend) return;
    inFlight.current = true;
    setSending(true);
    setNotice("");
    try {
      const result = await onResend(email);
      if (result?.sent !== false) {
        setDelivered(true);
        setNotice("A fresh verification email was sent. Check Inbox and Spam.");
      }
      setSeconds(60);
    } catch (error) {
      const failure = verificationError(error);
      setNotice(failure.message);
      setSeconds(failure.retryAfterSeconds);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  return (
    <div className="auth-container auth-container--register auth-container--verification">
      <section className="verification-card" aria-live="polite">
        <div className="auth-brand-lockup auth-brand-lockup--verification">
          <AutoPromoteLogo />
        </div>
        <div className="verification-card__icon" aria-hidden="true">
          ✉
        </div>
        <div className="auth-form__eyebrow">One quick step</div>
        <h2>Verify your email</h2>
        <p>
          Confirm your email address for <strong>{email}</strong>.
        </p>
        <p>
          {sent || delivered
            ? "Open the verification email and tap the link. Check Spam or Promotions too."
            : "If your verification email has not arrived, use resend below."}
        </p>
        <p>
          Return to this tab after verifying. We’ll sign you in automatically once verification is
          confirmed.
        </p>
        {(notice || message) && <div className="helper-message">{notice || message}</div>}
        <button
          type="button"
          className="auth-button"
          onClick={resend}
          disabled={sending || seconds > 0 || !onResend}
        >
          {sending
            ? "Sending..."
            : seconds
              ? `Resend available in ${seconds}s`
              : "Resend verification email"}
        </button>
        <p className="verification-card__note">
          Your workspace stays locked until your email is verified.
        </p>
      </section>
    </div>
  );
}
