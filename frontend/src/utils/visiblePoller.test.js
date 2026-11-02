import { startVisiblePoller } from "./visiblePoller";

describe("visible UI polling", () => {
  let hidden;
  let stop;
  const advance = async ms => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  };
  const setHidden = value => {
    hidden = value;
    document.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  });
  afterEach(() => {
    stop?.();
    delete document.hidden;
    jest.useRealTimers();
  });

  it("refreshes visible data every minute, pauses hidden reads, and catches up on return", async () => {
    const poll = jest.fn().mockResolvedValue(undefined);
    stop = startVisiblePoller(poll);
    await advance(0);
    await advance(60000);
    expect(poll).toHaveBeenCalledTimes(2);
    setHidden(true);
    await advance(3600000);
    expect(poll).toHaveBeenCalledTimes(2);
    setHidden(false);
    await advance(0);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("does not poll an initially hidden tab or refresh repeatedly on brief tab switches", async () => {
    setHidden(true);
    const poll = jest.fn().mockResolvedValue(undefined);
    stop = startVisiblePoller(poll);
    await advance(60000);
    expect(poll).not.toHaveBeenCalled();
    setHidden(false);
    await advance(0);
    setHidden(true);
    setHidden(false);
    await advance(1000);
    expect(poll).toHaveBeenCalledTimes(1);
    await advance(59000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("does not overlap slow requests and aborts the request on unmount", async () => {
    let finish;
    const poll = jest.fn(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    stop = startVisiblePoller(poll);
    await advance(0);
    const signal = poll.mock.calls[0][0];
    await advance(120000);
    setHidden(true);
    setHidden(false);
    await advance(0);
    expect(poll).toHaveBeenCalledTimes(1);
    stop();
    expect(signal.aborted).toBe(true);
    finish();
    await advance(60000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("retries failures on the normal cadence and removes its visibility handler", async () => {
    const poll = jest.fn().mockRejectedValue(new Error("offline"));
    stop = startVisiblePoller(poll);
    await advance(0);
    await advance(60000);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
    setHidden(true);
    setHidden(false);
    await advance(60000);
    expect(poll).toHaveBeenCalledTimes(2);
  });
});
