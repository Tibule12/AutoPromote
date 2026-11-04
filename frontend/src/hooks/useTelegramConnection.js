import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
import { withWorkspaceHeaders } from "../utils/workspace";
import {
  telegramConnectionLinks,
  readPendingTelegram,
  TELEGRAM_PENDING_PREFIX,
  TELEGRAM_LINK_TTL,
} from "../utils/telegramConnection";

export default function useTelegramConnection({ uid, connected, refreshStatus }) {
  const [dialog, setDialog] = useState(null);
  const [watchVersion, setWatchVersion] = useState(0);
  const pending = useRef(null);
  const preparing = useRef(false);
  const request = useRef(null);
  const sequence = useRef(0);

  const persist = useCallback(
    value => {
      pending.current = value;
      try {
        if (!uid) return;
        const key = TELEGRAM_PENDING_PREFIX + uid;
        if (value) sessionStorage.setItem(key, JSON.stringify(value));
        else sessionStorage.removeItem(key);
      } catch {
        /* A disabled storage area cannot authorize a connection. */
      }
    },
    [uid]
  );

  useEffect(() => {
    pending.current = readPendingTelegram(uid);
    setDialog(null);
    setWatchVersion(value => value + 1);
    return () => {
      request.current?.abort();
      preparing.current = false;
    };
  }, [uid]);

  const prepare = useCallback(async () => {
    if (preparing.current) return;
    const current = auth.currentUser;
    if (!current || current.uid !== uid) return;
    preparing.current = true;
    const attempt = ++sequence.current;
    setDialog({ status: "preparing" });
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const token = await current.getIdToken(true);
      const response = await fetch(API_ENDPOINTS.TELEGRAM_AUTH_PREPARE, {
        method: "POST",
        signal: controller.signal,
        headers: withWorkspaceHeaders({
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({ popup: false }),
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true)
        throw new Error("Telegram connection could not be prepared. Please try again.");
      const links = telegramConnectionLinks(data);
      if (
        auth.currentUser?.uid !== uid ||
        controller.signal.aborted ||
        attempt !== sequence.current
      )
        return;
      persist({ startedAt: Date.now(), attempts: 0 });
      setDialog({ status: "ready", links });
      setWatchVersion(value => value + 1);
    } catch (error) {
      if (auth.currentUser?.uid === uid && attempt === sequence.current)
        setDialog({
          status: "error",
          message:
            error.name === "AbortError"
              ? "Telegram connection timed out. Please try again."
              : error.message,
        });
    } finally {
      clearTimeout(timeout);
      preparing.current = false;
      if (request.current === controller) request.current = null;
    }
  }, [uid, persist]);

  useEffect(() => {
    if (connected) {
      persist(null);
      setDialog(previous =>
        previous && previous.status !== "preparing" ? { status: "connected" } : previous
      );
      return;
    }
    let stopped = false,
      timer,
      inFlight = false,
      returnAttempts = 0;
    const expiryTimer = pending.current
      ? setTimeout(
          () => {
            persist(null);
            setDialog(previous =>
              previous
                ? { status: "error", message: "This connection link expired. Please try again." }
                : null
            );
          },
          Math.max(0, TELEGRAM_LINK_TTL - (Date.now() - pending.current.startedAt))
        )
      : null;
    const valid = () => {
      const value = pending.current;
      return (
        !stopped &&
        value &&
        auth.currentUser?.uid === uid &&
        Date.now() - value.startedAt < TELEGRAM_LINK_TTL &&
        value.attempts < 20
      );
    };
    const schedule = (delay = 1500) => {
      clearTimeout(timer);
      if (valid() && !document.hidden && !inFlight && returnAttempts < 5)
        timer = setTimeout(check, delay);
    };
    const check = async () => {
      if (!valid() || document.hidden || inFlight) return;
      inFlight = true;
      returnAttempts++;
      persist({ ...pending.current, attempts: pending.current.attempts + 1 });
      try {
        // This uncached, authenticated endpoint is authoritative. Browser
        // messages and opening Telegram can never mark a connection complete.
        const status = await refreshStatus("telegram");
        if (!stopped && status?.connected === true) {
          persist(null);
          setDialog(previous => (previous ? { status: "connected" } : null));
        }
      } catch {
        /* A failed refresh never establishes a connection. */
      } finally {
        inFlight = false;
        if (!stopped) schedule(3000);
      }
    };
    const onReturn = () => {
      if (document.hidden) {
        clearTimeout(timer);
        return;
      }
      returnAttempts = 0;
      schedule(0);
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(expiryTimer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [uid, connected, refreshStatus, persist, watchVersion]);

  const close = useCallback(() => {
    sequence.current++;
    request.current?.abort();
    preparing.current = false;
    setDialog(null);
  }, []);
  return { dialog, prepare, close };
}
