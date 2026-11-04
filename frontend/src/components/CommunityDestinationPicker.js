import "./CommunityDestinationPicker.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../firebaseClient";
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { withWorkspaceHeaders } from "../utils/workspace";

export default function CommunityDestinationPicker({
  platform,
  value = "",
  onChange,
  manage = false,
}) {
  const [items, setItems] = useState([]);
  const [chat, setChat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const awaitingDiscord = useRef(false);
  useEffect(() => {
    const returned = () => {
      if (document.visibilityState !== "hidden" && awaitingDiscord.current) {
        awaitingDiscord.current = false;
        setVersion(v => v + 1);
      }
    };
    const workspaceChanged = () => setVersion(v => v + 1);
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    window.addEventListener("autopromote:workspace-change", workspaceChanged);
    return () => {
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
      window.removeEventListener("autopromote:workspace-change", workspaceChanged);
    };
  }, []);
  const endpoint = `${API_BASE_URL}/api/publishing-destinations/${platform}`;
  const request = useCallback(async (url, options = {}, signal) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in to configure publishing.");
    const token = await user.getIdToken();
    const response = await fetch(url, {
      ...options,
      signal,
      headers: withWorkspaceHeaders({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load destinations.");
    return result;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setItems([]);
    request(endpoint, {}, controller.signal)
      .then(d => {
        if (!controller.signal.aborted) setItems(d.destinations || []);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [endpoint, version, request]);
  const verify = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request(endpoint, {
        method: "POST",
        body: JSON.stringify({ chatId: chat.trim() }),
      });
      setItems(current => [
        ...current.filter(d => d.id !== result.destination.id),
        result.destination,
      ]);
      setChat("");
      onChange?.(result.destination);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const authoriseDiscord = async () => {
    setBusy(true);
    setError("");
    const popup = window.open(
      "about:blank",
      "autopromote-discord-publishing",
      "width=650,height=750"
    );
    try {
      const result = await request(
        API_ENDPOINTS.DISCORD_AUTH_START.replace(/\/start$/, "/prepare"),
        { method: "POST", body: "{}" }
      );
      const url = new URL(result.authUrl);
      if (url.origin !== "https://discord.com" || url.pathname !== "/oauth2/authorize")
        throw new Error("Untrusted Discord authorisation URL.");
      awaitingDiscord.current = true;
      if (popup) popup.location.replace(url.href);
      else window.location.assign(url.href);
    } catch (e) {
      popup?.close();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="community-destination-picker">
      <p>
        {platform === "telegram"
          ? "Add AutoPromote Bot to your channel with posting permission, or to a group you administer. Verify its @username or numeric chat ID below."
          : "Authorise a Discord server channel. Upload MP4 videos and images up to 10 MiB, or share a link. Shared links depend on your media's storage availability."}
      </p>
      {!manage && (
        <label>
          Publishing destination
          <select
            aria-label={`${platform} publishing destination`}
            disabled={busy}
            value={value}
            onChange={e => onChange?.(items.find(d => d.id === e.target.value) || null)}
          >
            <option value="">Choose an authorised destination</option>
            {items.map(d => (
              <option key={d.id} value={d.id}>
                {d.label} ({d.targetId})
              </option>
            ))}
          </select>
        </label>
      )}
      {manage && (
        <ul>
          {items.map(d => (
            <li key={d.id}>
              {d.label} · {d.targetId}
            </li>
          ))}
        </ul>
      )}
      {!busy && !items.length && <p>No publishing destination is authorised yet.</p>}
      {platform === "telegram" ? (
        <div>
          <label>
            Telegram channel or group
            <input
              aria-label="Telegram channel or group"
              value={chat}
              placeholder="@mychannel or -100123456789"
              onChange={e => setChat(e.target.value)}
            />
          </label>
          <button type="button" disabled={busy || !chat.trim()} onClick={verify}>
            Verify destination
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={authoriseDiscord}>
          Authorise Discord channel
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => setVersion(v => v + 1)}>
        Refresh destinations
      </button>
      {busy && <p role="status">Checking destinations…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
