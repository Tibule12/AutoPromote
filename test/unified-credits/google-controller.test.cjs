const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createController, TEST_UNIT } = require("../../sandbox/credits/google-test-controller");
function fixture({ unsupported = false } = {}) {
  const handlers = new Map(),
    reports = [],
    timers = [];
  let slot,
    defined = 0,
    destroyed = 0;
  const pubads = {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type, fn) => {
      if (handlers.get(type) === fn) handlers.delete(type);
    },
  };
  const googletag = {
    cmd: { push: fn => fn() },
    pubads: () => pubads,
    enums: { OutOfPageFormat: { REWARDED: "rewarded" } },
    defineOutOfPageSlot: unit => {
      assert.equal(unit, TEST_UNIT);
      defined++;
      return unsupported ? null : (slot = { addService: () => slot });
    },
    display: () => {},
    enableServices: () => {},
    destroySlots: () => {
      destroyed++;
    },
  };
  const controller = createController({
    googletag,
    report: r => reports.push(r),
    setTimer: fn => (timers.push(fn), fn),
    clearTimer: () => {},
  });
  return {
    controller,
    reports,
    timers,
    handlers,
    emit: (event, data = {}) => handlers.get(event)?.({ slot, ...data }),
    counts: () => ({ defined, destroyed }),
    last: () => reports.at(-1),
  };
}
it("requests no slot without opt-in or for an ad-free subscriber", () => {
  const f = fixture();
  f.controller.request({ optedIn: false });
  f.controller.request({ optedIn: true, adFree: true });
  assert.equal(f.counts().defined, 0);
  assert.equal(f.last().state, "ad_free");
});
it("handles unsupported and unfilled slots without awards", () => {
  const a = fixture({ unsupported: true });
  a.controller.request({ optedIn: true });
  assert.equal(a.last().state, "unsupported");
  const b = fixture();
  b.controller.request({ optedIn: true });
  b.emit("slotRenderEnded", { isEmpty: true });
  assert.equal(b.last().state, "no_fill");
  assert.equal(b.last().creditsAwarded, 0);
});
it("keeps video completion and arbitrary GPT grant payloads outside the wallet", () => {
  const f = fixture();
  f.controller.request({ optedIn: true });
  f.emit("rewardedSlotReady", { makeRewardedVisible: () => true });
  assert.equal(f.last().state, "ready");
  assert.equal(f.controller.show(), true);
  f.emit("rewardedSlotVideoCompleted");
  assert.equal(f.last().state, "video_complete_only");
  f.emit("rewardedSlotGranted", { payload: { amount: 999999, type: "credits" } });
  assert.equal(f.last().state, "client_reward_event");
  f.emit("rewardedSlotClosed");
  assert.equal(f.last().state, "closed_after_client_event");
  assert.ok(f.reports.every(r => r.creditsAwarded === 0));
  assert.equal(f.handlers.size, 0);
});
it("times out blockers and ignores stale callbacks after dismissal", () => {
  const f = fixture();
  f.controller.request({ optedIn: true });
  const stale = f.handlers.get("rewardedSlotGranted");
  f.timers[0]();
  assert.equal(f.last().state, "no_fill_or_blocked");
  f.controller.dismiss();
  const count = f.reports.length;
  stale({ payload: { amount: 1 } });
  assert.equal(f.reports.length, count);
  assert.equal(f.controller.show(), false);
});
it("does not infer completion when the slot cannot become visible or closes early", () => {
  const f = fixture();
  f.controller.request({ optedIn: true });
  f.emit("rewardedSlotReady", { makeRewardedVisible: () => false });
  assert.equal(f.controller.show(), false);
  assert.equal(f.last().state, "not_visible");
  f.controller.request({ optedIn: true });
  f.emit("rewardedSlotClosed");
  assert.equal(f.last().state, "closed_without_reward");
  assert.ok(f.reports.every(r => r.creditsAwarded === 0));
});
