/* The controller never calls a wallet API. GPT browser events are UI evidence only. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoogleRewardedTest = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  const TEST_UNIT = "/22639388115/rewarded_web_example";
  function createController({
    googletag,
    report,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    let slot = null,
      ready = null,
      timer = null,
      generation = 0,
      granted = false,
      showing = false;
    const handlers = [];
    function cleanup() {
      if (timer) clearTimer(timer);
      timer = null;
      ready = null;
      showing = false;
      for (const [type, fn] of handlers.splice(0)) googletag.pubads().removeEventListener(type, fn);
      if (slot) googletag.destroySlots([slot]);
      slot = null;
    }
    function finish(state) {
      generation++;
      cleanup();
      report({ state, creditsAwarded: 0 });
    }
    return {
      request({ optedIn, adFree = false } = {}) {
        if (adFree) return finish("ad_free");
        if (optedIn !== true) return finish("opt_in_required");
        cleanup();
        granted = false;
        const current = ++generation;
        googletag.cmd.push(() => {
          if (current !== generation) return;
          slot = googletag.defineOutOfPageSlot(TEST_UNIT, googletag.enums.OutOfPageFormat.REWARDED);
          if (!slot) return finish("unsupported");
          slot.addService(googletag.pubads());
          function listen(type, fn) {
            const handler = event => {
              if (current === generation && event.slot === slot) fn(event);
            };
            handlers.push([type, handler]);
            googletag.pubads().addEventListener(type, handler);
          }
          listen("rewardedSlotReady", event => {
            if (timer) clearTimer(timer);
            timer = null;
            ready = event;
            report({ state: "ready", creditsAwarded: 0 });
          });
          listen("slotRenderEnded", event => {
            if (event.isEmpty) finish("no_fill");
          });
          listen("rewardedSlotGranted", () => {
            // Never send this untrusted event or its amount/type to a credit issuer.
            if (showing) {
              granted = true;
              report({ state: "client_reward_event", creditsAwarded: 0 });
            }
          });
          listen("rewardedSlotVideoCompleted", () =>
            report({ state: "video_complete_only", creditsAwarded: 0 })
          );
          listen("rewardedSlotClosed", () =>
            finish(granted ? "closed_after_client_event" : "closed_without_reward")
          );
          timer = setTimer(() => finish("no_fill_or_blocked"), 15000);
          googletag.enableServices();
          googletag.display(slot);
          report({ state: "requesting", creditsAwarded: 0 });
        });
      },
      show() {
        if (!ready) return false;
        showing = true;
        if (ready.makeRewardedVisible() !== true) {
          finish("not_visible");
          return false;
        }
        ready = null;
        report({ state: "showing", creditsAwarded: 0 });
        return true;
      },
      dismiss() {
        finish("dismissed");
      },
    };
  }
  return { TEST_UNIT, createController };
});
