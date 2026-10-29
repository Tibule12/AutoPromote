// Keep existing hash links working while accepting direct public-page URLs.
// Root invitation links and provider callbacks must keep their original query.
const PUBLIC_PATH =
  /^\/(?:about|contact|features|integrations|metrics|pricing|changelog|careers|partners|security|accessibility|cookies|terms|privacy|support|help|api-docs|(?:docs|blog)(?:\/[a-z0-9_-]+)*|forgot-password|reset-password)\/?$/i;

export function publicEntryRoute({ pathname = "/", search = "", hash = "" }) {
  if (hash.startsWith("#/") || !PUBLIC_PATH.test(pathname)) return null;
  return `/#${pathname.replace(/\/$/, "")}${search}${hash}`;
}
