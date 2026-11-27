const { fail } = require("../unifiedCredits/policy");
async function readCurrentPaymentProof({ subscriptionId, remote, read, now = Date.now() }) {
  const paid = remote?.billing_info?.last_payment;
  const at = Date.parse(paid?.time || "");
  if (!/^I-[A-Z0-9]+$/i.test(subscriptionId || "") || !Number.isFinite(at) || at > now)
    fail("VERIFIED_PAYMENT_REQUIRED", 409);
  const query = new URLSearchParams({start_time:new Date(at - 120000).toISOString(),
    end_time:new Date(Math.min(now, at + 120000)).toISOString()});
  const result = await read(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/transactions?${query}`);
  // Never infer validity from an incomplete financial history.
  if (Number(result.total_pages || 1) > 1 || result.links?.some(l => l.rel === "next"))
    fail("PAYMENT_HISTORY_RECONCILIATION_REQUIRED", 503);
  const rows = (result.transactions || []).filter(t => Math.abs(Date.parse(t.time || "") - at) <= 120000);
  const paidRows = rows.filter(t => t.status === "COMPLETED" && t.amount_with_breakdown?.gross_amount?.currency_code === "USD" &&
    Number(t.amount_with_breakdown?.gross_amount?.value) === 4.99);
  if (paidRows.length !== 1) fail("VERIFIED_PAYMENT_TRANSACTION_REQUIRED", 409);
  const transaction = paidRows[0];
  if (!/^[A-Z0-9-]{5,100}$/i.test(transaction.id || "")) fail("INVALID_PAYMENT_TRANSACTION", 503);
  return { transactionId:transaction.id, paymentTime:paid.time, transactionTime:transaction.time,
    status:transaction.status, amount:"4.99", currency:"USD" };
}
module.exports = {readCurrentPaymentProof};
