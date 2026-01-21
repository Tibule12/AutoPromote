jest.setTimeout(10000);

describe("slackAlertService", () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete global.fetch;
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  test("returns disabled when ENABLE_SLACK_ALERTS is false", async () => {
    process.env.ENABLE_SLACK_ALERTS = "false";
    const { sendSlackAlert } = require("../slackAlertService");
    const out = await sendSlackAlert({ text: "x" });
    expect(out).toEqual({ ok: false, reason: "disabled" });
  });

  test("returns no_webhook when enabled but webhook missing", async () => {
    process.env.ENABLE_SLACK_ALERTS = "true";
    delete process.env.SLACK_ALERT_WEBHOOK_URL;
    const { sendSlackAlert } = require("../slackAlertService");
    const out = await sendSlackAlert({ text: "x" });
    expect(out).toEqual({ ok: false, reason: "no_webhook" });
  });

  test("sends alert successfully when enabled and webhook present and records event", async () => {
    process.env.ENABLE_SLACK_ALERTS = "true";
    process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T/ABC/XYZ";

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });

    // Mock db.collection(...).add via doMock so we can inspect calls
    const addMock = jest.fn().mockResolvedValue(true);
    const collectionMock = jest.fn(() => ({ add: addMock }));
    jest.doMock("../../firebaseAdmin", () => ({ db: { collection: collectionMock } }));

    const { sendSlackAlert } = require("../slackAlertService");

    const out = await sendSlackAlert({
      text: "Test alert",
      severity: "info",
      extra: { foo: "bar" },
    });
    expect(out).toEqual({ ok: true });
    // ensure fetch was called
    expect(global.fetch).toHaveBeenCalled();
    const firebase = require("../../firebaseAdmin");
    expect(firebase.db.collection).toHaveBeenCalledWith("events");
    const recordedAdd = firebase.db.collection.mock.results[0].value.add;
    expect(recordedAdd).toHaveBeenCalled();
  });

  test("records error event when fetch throws", async () => {
    process.env.ENABLE_SLACK_ALERTS = "true";
    process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T/ABC/XYZ";

    // Mock fetch to throw
    global.fetch = jest.fn().mockRejectedValue(new Error("network failed"));

    // Mock db.collection(...).add via doMock
    const addMock = jest.fn().mockResolvedValue(true);
    const collectionMock = jest.fn(() => ({ add: addMock }));
    jest.doMock("../../firebaseAdmin", () => ({ db: { collection: collectionMock } }));

    const { sendSlackAlert } = require("../slackAlertService");

    const out = await sendSlackAlert({ text: "Test alert" });
    expect(out.ok).toBe(false);
    // ensure an error event was recorded
    const firebase = require("../../firebaseAdmin");
    expect(firebase.db.collection).toHaveBeenCalledWith("events");
    const recordedAdd = firebase.db.collection.mock.results[0].value.add;
    expect(recordedAdd).toHaveBeenCalled();
  });
});
