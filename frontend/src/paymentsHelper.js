// Lightweight frontend helper (placeholder) to poll payments status
export async function fetchPaymentsStatus(token) {
  const res = await fetch('/api/payments/status', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) throw new Error('status_fetch_failed');
  return res.json();
}
export async function fetchBalance(token) {
  const res = await fetch('/api/payments/balance', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) throw new Error('balance_fetch_failed');
  return res.json();
}
