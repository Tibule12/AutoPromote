export const revokeObjectUrlLater = (url, delayMs = 30000) => {
  if (!url || typeof url !== "string" || !url.startsWith("blob:")) return;
  if (
    typeof window === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return;
  }
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, delayMs);
};
