/* Local preview only. No ad SDK, payment SDK or production Firebase client. */
const el = id => document.getElementById(id);
const creditLabel = count => `${count} ${count === 1 ? "credit" : "credits"}`;
let account,
  quote,
  session,
  catalogue,
  quoteGeneration = 0;
let busy = false;
async function api(path, body) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Credits-Sandbox": "local",
      "X-Credits-Sandbox-User": el("account").value,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
const messages = {
  INSUFFICIENT_CREDITS:
    "You need more credits for this operation. Keep editing, earn credits, or explore subscriptions.",
  SPEND_BUDGET_EXCEEDED:
    "Processing is paused because the available service budget is exhausted. Your credits are safe.",
  ISSUANCE_BUDGET_EXCEEDED:
    "Additional credits are temporarily unavailable. You can keep editing and saving.",
  REWARD_EXPIRED: "This test ad session expired. Dismiss it and start again.",
  MONTHLY_AD_CAP: "You have reached your monthly rewarded-ad limit.",
  PRICE_CHANGED: "The price changed. Review the updated quote before starting.",
};
function status(message) {
  el("status").textContent = message;
}
function buttons() {
  el("run").disabled = busy || !quote?.canAfford;
  el("fail").disabled = busy || !quote?.canAfford;
  el("watch").disabled =
    busy || !account || account.adFree || account.adsRemaining < 1 || Boolean(account.activeReward);
  el("watch").hidden = Boolean(account?.adFree);
  el("ad-availability").disabled = busy || Boolean(account?.adFree);
  el("account").disabled = busy;
}
async function updateQuote() {
  const generation = ++quoteGeneration;
  quote = null;
  buttons();
  const operation = el("operation").value;
  const price = catalogue.operations[operation];
  el("units-label").firstChild.textContent =
    price.unit === "seconds" ? "Processing seconds (test ceiling)" : "Destinations";
  el("units").max = price.maxUnits;
  try {
    const result = await api("/quote", { operation, units: Number(el("units").value) });
    if (generation !== quoteGeneration) return;
    quote = result;
    el("cost").textContent = creditLabel(result.credits);
    el("affordability").textContent = result.canAfford
      ? "Ready when you are."
      : "More credits needed. You can keep editing and saving.";
  } catch (error) {
    if (generation !== quoteGeneration) return;
    el("cost").textContent = "Unavailable";
    el("affordability").textContent =
      messages[error.message] || "Choose a valid workload within the resource limit.";
  }
  buttons();
}
async function refresh() {
  account = await api("/account");
  el("balance").textContent = account.balance;
  el("plan").textContent = account.adFree ? "Creator" : "Starter";
  const renewalDate = new Date(account.renewsAt).toLocaleDateString("en-ZA", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  el("renewal").textContent =
    `${account.monthlyAllowance} monthly credits · Renews ${renewalDate} (00:00 UTC). Wallet capacity: ${account.maxBalance}.`;
  el("reserved").textContent = account.reserved
    ? `${account.reserved} credits reserved for work in progress.`
    : "No credits reserved.";
  el("reward-copy").textContent = account.adFree
    ? "Your subscription includes ad-free usage."
    : `Complete a simulated ad to earn ${creditLabel(account.rewardCredits)}. Up to ${account.adsRemaining} rewarded ads remaining this cycle. Ad availability varies.`;
  el("watch").textContent = `Watch test ad · Earn ${creditLabel(account.rewardCredits)}`;
  el("resume").hidden = !account.activeReward;
  session = account.activeReward
    ? { sessionId: account.activeReward, credits: account.rewardCredits }
    : null;
  el("activity").replaceChildren();
  for (const name of ["granted", "earned", "purchased", "consumed", "refunded", "expired"]) {
    const entry = document.createElement("div"),
      term = document.createElement("dt"),
      value = document.createElement("dd");
    term.textContent = name[0].toUpperCase() + name.slice(1);
    value.textContent = account.totals[name];
    entry.append(term, value);
    el("activity").append(entry);
  }
  await updateQuote();
}
async function action(work) {
  if (busy) return;
  busy = true;
  buttons();
  try {
    await work();
  } catch (error) {
    status(messages[error.message] || error.message);
  } finally {
    busy = false;
    buttons();
  }
}
el("watch").onclick = () =>
  action(async () => {
    session = await api("/rewards", { consent: true, availability: el("ad-availability").value });
    if (session.status === "unavailable") {
      session = null;
      status(
        "No ad available right now. Your credits and monthly ad allowance are unchanged. Keep editing or explore subscriptions."
      );
      await refresh();
      return;
    }
    el("ad-title").textContent = `Complete this test ad to earn ${creditLabel(session.credits)}`;
    el("ad").showModal();
  });
el("resume").onclick = () => {
  el("ad-title").textContent = `Complete this test ad to earn ${creditLabel(session.credits)}`;
  el("ad").showModal();
};
el("complete").onclick = () =>
  action(async () => {
    const result = await api(`/rewards/${session.sessionId}/mock-completion`, {});
    el("ad").close();
    status(`You earned ${creditLabel(result.earned || account.rewardCredits)}.`);
    await refresh();
  });
async function skip() {
  if (!session) return;
  await api(`/rewards/${session.sessionId}/close`, {});
  el("ad").close();
  status("Ad dismissed. No credits awarded.");
  await refresh();
}
el("skip").onclick = () => action(skip);
el("ad").addEventListener("cancel", event => {
  event.preventDefault();
  action(skip);
});
async function run(simulateFailure) {
  if (!quote) return;
  const result = await api("/operations", {
    operation: quote.operation,
    units: quote.units,
    approvedCredits: quote.credits,
    pricingRevision: quote.pricingRevision,
    requestId: crypto.randomUUID(),
    simulateFailure,
  });
  status(
    result.state === "failed"
      ? "Test operation failed. Your credits were refunded."
      : "Test operation completed. Credits used."
  );
  await refresh();
}
el("run").onclick = () => action(() => run(false));
el("fail").onclick = () => action(() => run(true));
el("operation").onchange = () => {
  el("units").value = "1";
  updateQuote();
};
el("units").oninput = () => updateQuote();
el("account").onchange = () =>
  action(async () => {
    el("ad").close();
    await refresh();
  });
el("save").onclick = () => {
  try {
    localStorage.setItem("autopromote-credit-preview-notes", el("notes").value);
    el("saved").textContent = "Saved on this device.";
  } catch {
    el("saved").textContent = "Device storage is unavailable. Copy your notes to save them.";
  }
};
try {
  el("notes").value = localStorage.getItem("autopromote-credit-preview-notes") || "";
} catch {
  /* Device storage may be disabled. */
}
action(async () => {
  catalogue = await api("/catalogue");
  el("allowances").textContent =
    `Starter: ${catalogue.monthlyCredits.free} · Creator: ${catalogue.monthlyCredits.premium} · Studio: ${catalogue.monthlyCredits.pro} · Agency: ${catalogue.monthlyCredits.enterprise} credits per month.`;
  await refresh();
});
