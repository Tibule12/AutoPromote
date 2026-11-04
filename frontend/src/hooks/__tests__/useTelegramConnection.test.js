import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import useTelegramConnection from "../useTelegramConnection";
import TelegramConnectDialog from "../../components/TelegramConnectDialog";
import {
  telegramConnectionLinks,
  TELEGRAM_PENDING_PREFIX,
  TELEGRAM_LINK_TTL,
} from "../../utils/telegramConnection";

jest.mock("../../firebaseClient", () => ({ auth: { currentUser: null } }));
jest.mock("../../utils/workspace", () => ({ withWorkspaceHeaders: value => value }));
const { auth } = require("../../firebaseClient");
const state = "550e8400-e29b-41d4-a716-446655440000";
const response = { ok: true, state, authUrl: `https://t.me/TestAutoPromoteBot?start=${state}` };
const tick = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};
function Harness({ refresh, uid = "owner", connected = false }) {
  const connection = useTelegramConnection({ uid, connected, refreshStatus: refresh });
  return (
    <>
      <button onClick={connection.prepare}>Connect Telegram</button>
      <TelegramConnectDialog
        state={connection.dialog}
        onClose={connection.close}
        onRetry={connection.prepare}
      />
    </>
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  sessionStorage.clear();
  auth.currentUser = { uid: "owner", getIdToken: jest.fn(async () => "fixture-token") };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => response }));
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("Web K and app links preserve the exact bot-start parameter", () => {
  const links = telegramConnectionLinks(response);
  const web = new URL(links.webUrl);
  expect(web.origin).toBe("https://web.telegram.org");
  expect(web.pathname).toBe("/k/");
  const app = new URL(new URLSearchParams(web.hash.slice(2)).get("tgaddr"));
  expect(app.protocol).toBe("tg:");
  expect(app.hostname).toBe("resolve");
  expect(app.searchParams.get("start")).toBe(state);
  expect(app.searchParams.get("domain")).toBe("TestAutoPromoteBot");
  expect(app.href).toBe(links.appUrl);
});
test.each([
  { ...response, authUrl: `https://t.me.attacker.test/TestBot?start=${state}` },
  { ...response, authUrl: `https://user@t.me/TestBot?start=${state}` },
  { ...response, authUrl: `http://t.me/TestBot?start=${state}` },
  { ...response, authUrl: "https://t.me/TestBot" },
  { ...response, state: "substituted-state" },
])("hostile or substituted connection links fail closed %#", data => {
  expect(() => telegramConnectionLinks(data)).toThrow();
});
test("prepare uses normal authentication and presents explicit Web/App choices without launching an OS handler", async () => {
  const open = jest.spyOn(window, "open").mockImplementation(() => null);
  render(<Harness refresh={jest.fn(async () => ({ connected: false }))} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  expect(screen.getByRole("link", { name: "Open Telegram Web" })).toHaveAttribute(
    "href",
    telegramConnectionLinks(response).webUrl
  );
  expect(screen.getByRole("link", { name: "Open installed Telegram app" })).toHaveAttribute(
    "href",
    telegramConnectionLinks(response).appUrl
  );
  expect(open).not.toHaveBeenCalled();
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer fixture-token");
  expect(sessionStorage.getItem(TELEGRAM_PENDING_PREFIX + "owner")).not.toContain("fixture-token");
});
test("returning to AutoPromote retries a delayed webhook and completes only from authenticated status", async () => {
  const refresh = jest
    .fn()
    .mockResolvedValueOnce({ connected: false })
    .mockResolvedValue({ connected: true });
  render(<Harness refresh={refresh} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  fireEvent(window, new Event("focus"));
  await tick();
  expect(screen.queryByRole("heading", { name: "Telegram connected" })).not.toBeInTheDocument();
  await tick(3000);
  expect(screen.getByRole("heading", { name: "Telegram connected" })).toBeInTheDocument();
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(sessionStorage.getItem(TELEGRAM_PENDING_PREFIX + "owner")).toBeNull();
  await tick(30000);
  expect(refresh).toHaveBeenCalledTimes(2);
});
test("hidden pages do not poll and duplicate focus/visibility events cannot overlap requests", async () => {
  let resolve;
  const refresh = jest.fn(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  render(<Harness refresh={refresh} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  fireEvent(document, new Event("visibilitychange"));
  await tick(20000);
  expect(refresh).not.toHaveBeenCalled();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  fireEvent(window, new Event("focus"));
  fireEvent(document, new Event("visibilitychange"));
  await tick();
  fireEvent(window, new Event("focus"));
  await tick(3000);
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ connected: true }));
});
test("unrelated tab focus does not poll when no Telegram connection is pending", async () => {
  const refresh = jest.fn();
  render(<Harness refresh={refresh} />);
  fireEvent(window, new Event("focus"));
  await tick(20000);
  expect(refresh).not.toHaveBeenCalled();
});
test("each return checks at most five times and does not claim connection on errors", async () => {
  const refresh = jest.fn(async () => {
    throw new Error("offline");
  });
  render(<Harness refresh={refresh} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  for (let i = 0; i < 10; i++) await tick(3000);
  expect(refresh).toHaveBeenCalledTimes(5);
  expect(screen.queryByRole("heading", { name: "Telegram connected" })).not.toBeInTheDocument();
});
test("a reload resumes the pending owner check without another preparation request", async () => {
  sessionStorage.setItem(
    TELEGRAM_PENDING_PREFIX + "owner",
    JSON.stringify({ startedAt: Date.now(), attempts: 2 })
  );
  const refresh = jest.fn(async () => ({ connected: true }));
  render(<Harness refresh={refresh} />);
  await tick(1500);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(TELEGRAM_PENDING_PREFIX + "owner")).toBeNull();
});
test("expired, foreign and exhausted pending requests do not poll", async () => {
  const refresh = jest.fn();
  sessionStorage.setItem(
    TELEGRAM_PENDING_PREFIX + "someone-else",
    JSON.stringify({ startedAt: Date.now(), attempts: 0 })
  );
  sessionStorage.setItem(
    TELEGRAM_PENDING_PREFIX + "owner",
    JSON.stringify({ startedAt: Date.now() - TELEGRAM_LINK_TTL, attempts: 0 })
  );
  const view = render(<Harness refresh={refresh} />);
  await tick(20000);
  expect(refresh).not.toHaveBeenCalled();
  view.unmount();
  sessionStorage.setItem(
    TELEGRAM_PENDING_PREFIX + "owner",
    JSON.stringify({ startedAt: Date.now(), attempts: 20 })
  );
  render(<Harness refresh={refresh} />);
  await tick(20000);
  expect(refresh).not.toHaveBeenCalled();
});
test("a failed preparation offers retry and stores no pending connection", async () => {
  global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "denied" }) });
  render(<Harness refresh={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("could not be prepared");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(sessionStorage.getItem(TELEGRAM_PENDING_PREFIX + "owner")).toBeNull();
});
test("closing the dialog while preparing cannot reopen it from a late response", async () => {
  let resolve;
  global.fetch.mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  render(<Harness refresh={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "Close Telegram connection" }));
  await act(async () => resolve({ ok: true, json: async () => response }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(sessionStorage.getItem(TELEGRAM_PENDING_PREFIX + "owner")).toBeNull();
});
test("the link expires and stops checking even while its dialog remains open", async () => {
  const refresh = jest.fn(async () => ({ connected: false }));
  render(<Harness refresh={refresh} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  await tick(TELEGRAM_LINK_TTL);
  expect(screen.getByRole("alert")).toHaveTextContent("expired");
  expect(sessionStorage.getItem(TELEGRAM_PENDING_PREFIX + "owner")).toBeNull();
  const count = refresh.mock.calls.length;
  fireEvent(window, new Event("focus"));
  await tick(3000);
  expect(refresh).toHaveBeenCalledTimes(count);
});
test("unmounting aborts preparation and removes return listeners and timers", async () => {
  let signal;
  global.fetch.mockImplementation((_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const refresh = jest.fn();
  const view = render(<Harness refresh={refresh} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  view.unmount();
  expect(signal.aborted).toBe(true);
  fireEvent(window, new Event("focus"));
  await tick(30000);
  expect(refresh).not.toHaveBeenCalled();
});
test("the connection dialog supports Escape and keyboard focus without opening external links", async () => {
  render(<Harness refresh={jest.fn()} />);
  screen.getByRole("button", { name: "Connect Telegram" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
  await tick();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect Telegram" })).toHaveFocus();
});
