// Lightweight frontend helper (placeholder) to poll payments status
import { API_BASE_URL } from "./config";

export async function fetchPaymentsStatus(token) {
  const res = await fetch(`${API_BASE_URL}/api/payments/status`, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (!res.ok) throw new Error("status_fetch_failed");
  return res.json();
}
export async function fetchBalance(token) {
  const res = await fetch(`${API_BASE_URL}/api/payments/balance`, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (!res.ok) throw new Error("balance_fetch_failed");
  return res.json();
}
