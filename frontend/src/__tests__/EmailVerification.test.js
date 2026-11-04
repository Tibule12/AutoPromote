import { reload, sendEmailVerification } from "firebase/auth";
import {
  resendAccountVerification,
  sendFirebaseVerification,
  watchEmailVerification,
} from "../utils/emailVerification";

jest.mock("firebase/auth", () => ({ reload: jest.fn(), sendEmailVerification: jest.fn() }));
const account = () => ({
  uid: "local-only",
  email: "owner@example.test",
  emailVerified: false,
  getIdToken: jest.fn().mockResolvedValue("fresh-verified-token"),
});
const response = (status, body = {}) => ({
  ok: status < 400,
  status,
  json: async () => body,
  headers: { get: () => null },
});
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
let stop;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  global.fetch = jest.fn();
  reload.mockResolvedValue();
  sendEmailVerification.mockResolvedValue();
});
afterEach(() => {
  stop?.();
  stop = null;
  jest.useRealTimers();
});

test("resend uses branded backend delivery first, avoiding the throttled client path", async () => {
  fetch.mockResolvedValue(response(200, { provider: "zeptomail" }));
  await expect(resendAccountVerification("OWNER@example.test", account())).resolves.toEqual({
    sent: true,
    provider: "zeptomail",
  });
  expect(sendEmailVerification).not.toHaveBeenCalled();
});
test("backend rate limits cannot be bypassed using Firebase fallback", async () => {
  fetch.mockResolvedValue(response(429, { retryAfterMinutes: 15 }));
  await expect(resendAccountVerification("owner@example.test", account())).rejects.toMatchObject({
    code: "auth/too-many-requests",
    retryAfterSeconds: 900,
  });
  expect(sendEmailVerification).not.toHaveBeenCalled();
});
test("unavailable provider falls back once for the authenticated owner only", async () => {
  fetch.mockResolvedValue(response(503));
  await expect(resendAccountVerification("owner@example.test", account())).resolves.toMatchObject({
    provider: "firebase",
  });
  expect(sendEmailVerification).toHaveBeenCalledTimes(1);
  await expect(resendAccountVerification("other@example.test", account())).rejects.toThrow();
  expect(sendEmailVerification).toHaveBeenCalledTimes(1);
});
test("Firebase throttling gives a friendly message and cooldown without retrying", async () => {
  sendEmailVerification.mockRejectedValue({ code: "auth/too-many-requests" });
  await expect(sendFirebaseVerification(account())).rejects.toMatchObject({
    retryAfterSeconds: 120,
    message: expect.stringContaining("temporarily limited"),
  });
  expect(sendEmailVerification).toHaveBeenCalledTimes(1);
});
test("a rejected optional continue URL uses the hosted action once", async () => {
  sendEmailVerification.mockRejectedValueOnce({ code: "auth/unauthorized-continue-uri" });
  const user = account();
  await sendFirebaseVerification(user);
  expect(sendEmailVerification.mock.calls[1]).toEqual([user]);
});
test("focus checks Firebase verification and refreshes the signed token before auto sign-in", async () => {
  const user = account(),
    auth = { currentUser: user },
    verified = jest.fn();
  stop = watchEmailVerification(auth, verified);
  await flush();
  expect(verified).not.toHaveBeenCalled();
  reload.mockImplementation(async candidate => {
    candidate.emailVerified = true;
  });
  window.dispatchEvent(new Event("focus"));
  await flush();
  expect(user.getIdToken).toHaveBeenCalledWith(true);
  expect(verified).toHaveBeenCalledWith(user);
  expect(sendEmailVerification).not.toHaveBeenCalled();
});
test("a refresh with unverified Firebase state remains locked regardless of local flags", async () => {
  localStorage.setItem("user", JSON.stringify({ emailVerified: true, isAdmin: true }));
  const user = account(),
    verified = jest.fn();
  stop = watchEmailVerification({ currentUser: user }, verified);
  await flush();
  jest.advanceTimersByTime(45000);
  await flush();
  expect(verified).not.toHaveBeenCalled();
  expect(user.getIdToken).not.toHaveBeenCalled();
  localStorage.clear();
});
test("logout during a pending check cannot resurrect the session", async () => {
  const user = account(),
    auth = { currentUser: user },
    verified = jest.fn();
  let finish;
  reload.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  stop = watchEmailVerification(auth, verified);
  auth.currentUser = null;
  user.emailVerified = true;
  finish();
  await flush();
  expect(verified).not.toHaveBeenCalled();
});
