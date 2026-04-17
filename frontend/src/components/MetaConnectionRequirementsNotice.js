import React from "react";

function getLinkedInstagramId(page) {
  return (
    page?.instagram_business_account?.id ||
    page?.instagram_business_account_id ||
    page?.ig_business_account_id ||
    null
  );
}

export function getMetaConnectionReadiness({ facebookStatus, pages } = {}) {
  const resolvedPages = Array.isArray(pages)
    ? pages
    : Array.isArray(facebookStatus?.pages)
      ? facebookStatus.pages
      : Array.isArray(facebookStatus?.meta?.pages)
        ? facebookStatus.meta.pages
        : [];

  const hasFacebookPage = resolvedPages.length > 0;
  const hasLinkedInstagramBusiness = Boolean(
    facebookStatus?.ig_business_account_id || resolvedPages.some(page => getLinkedInstagramId(page))
  );
  const connected =
    facebookStatus?.connected === true || hasFacebookPage || hasLinkedInstagramBusiness;

  return {
    connected,
    pages: resolvedPages,
    hasFacebookPage,
    hasLinkedInstagramBusiness,
    isReady: hasFacebookPage && hasLinkedInstagramBusiness,
  };
}

export default function MetaConnectionRequirementsNotice({
  facebookStatus,
  pages,
  title = "Meta publishing requirements",
  compact = false,
  style,
}) {
  const readiness = getMetaConnectionReadiness({ facebookStatus, pages });

  if (readiness.isReady) {
    return null;
  }

  let statusLine = "Connect with the Facebook account that manages your business assets.";
  if (readiness.connected && !readiness.hasFacebookPage) {
    statusLine =
      "This Meta connection does not currently include a Facebook Page you can publish from.";
  } else if (readiness.hasFacebookPage && !readiness.hasLinkedInstagramBusiness) {
    statusLine =
      "A Facebook Page is connected, but no Instagram business account is linked to that Page yet.";
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: compact ? "10px 12px" : "12px 14px",
        borderRadius: 12,
        border: "1px solid rgba(96, 165, 250, 0.35)",
        background: "rgba(15, 23, 42, 0.72)",
        color: "#dbeafe",
        lineHeight: 1.5,
        ...style,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: compact ? 4 : 6 }}>{title}</div>
      <div style={{ color: "#cbd5e1" }}>
        To publish reliably to Facebook and Instagram, Meta requires a Facebook Page and an
        Instagram business account linked to that Page. A personal Facebook profile or a standalone
        Instagram login can still connect, but it will not be publish-ready with our Page-based
        permissions.
      </div>
      <div style={{ color: "#93c5fd", marginTop: compact ? 6 : 8 }}>{statusLine}</div>
    </div>
  );
}
