/* global GoogleRewardedTest, document, window */
"use strict";
if (!["127.0.0.1", "localhost"].includes(window.location.hostname))
  throw new Error("Local test only");
const statusNode = document.getElementById("google-status");
let controller,
  loading = false,
  loadEpoch = 0,
  loadTimer;
function report(result) {
  if (["requesting", "unsupported", "ready", "dismissed"].includes(result.state))
    clearTimeout(loadTimer);
  statusNode.textContent = `${result.state} · 0 credits awarded. Google test inventory only.`;
  statusNode.dataset.state = result.state;
  document.dispatchEvent(
    new window.CustomEvent("google-test-state", {
      detail: { state: result.state, creditsAwarded: 0 },
    })
  );
  document.getElementById("show-test").disabled = result.state !== "ready";
}
document.getElementById("request-test").onclick = () => {
  if (!document.getElementById("test-consent").checked) return report({ state: "opt_in_required" });
  if (controller) return controller.request({ optedIn: true });
  if (loading) return;
  loading = true;
  const epoch = ++loadEpoch;
  window.googletag = window.googletag || { cmd: [] };
  const script = document.createElement("script");
  script.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  loadTimer = setTimeout(() => {
    if (epoch !== loadEpoch) return;
    loadEpoch++;
    loading = false;
    report({ state: "sdk_timeout" });
  }, 15000);
  script.onerror = () => {
    if (epoch !== loadEpoch) return;
    clearTimeout(loadTimer);
    loading = false;
    report({ state: "sdk_blocked" });
  };
  script.onload = () => {
    if (epoch !== loadEpoch) return;
    clearTimeout(loadTimer);
    loading = false;
    loadTimer = setTimeout(() => {
      controller?.dismiss();
      report({ state: "api_ready_timeout" });
    }, 15000);
    controller = GoogleRewardedTest.createController({ googletag: window.googletag, report });
    controller.request({ optedIn: true });
  };
  document.head.append(script);
};
document.getElementById("show-test").onclick = () => controller?.show();
document.getElementById("dismiss-test").onclick = () => {
  loadEpoch++;
  clearTimeout(loadTimer);
  loading = false;
  if (controller) controller.dismiss();
  else report({ state: "dismissed" });
};
