// Original classroom example. No network, personal data, or model calls.
export function explainByte(raw) {
  const text = String(raw).trim();
  if (!/^\d{1,3}$/.test(text)) return { ok: false, message: 'Enter a whole number from 0 to 255.' };
  const value = Number(text);
  if (value > 255) return { ok: false, message: 'A byte holds values from 0 to 255. Try again.' };
  const binary = value.toString(2).padStart(8, '0');
  const weights = [128, 64, 32, 16, 8, 4, 2, 1];
  return { ok: true, value, binary, bits: [...binary].map((bit, i) => ({ bit: Number(bit), weight: weights[i] })),
    check: [...binary].reduce((sum, bit, i) => sum + Number(bit) * weights[i], 0) };
}
