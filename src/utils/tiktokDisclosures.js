// Resolve explicit publishing choices only. A settings object, editing workflow,
// filename or use of AI assistance is not itself a disclosure selection.
function firstBoolean(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value !== "boolean") {
      const error = new TypeError("TikTok disclosure settings must be booleans.");
      error.code = "tiktok_disclosure_invalid";
      throw error;
    }
    return value;
  }
  return undefined;
}

function resolveTikTokDisclosures(payload = {}) {
  const options =
    payload.platform_options?.tiktok ||
    payload.platformOptions?.tiktok ||
    payload.platformOptions ||
    payload;
  const commercial =
    typeof options.commercial === "object" && options.commercial !== null
      ? options.commercial
      : typeof payload.commercial === "object" && payload.commercial !== null
        ? payload.commercial
        : {};
  const enabled = firstBoolean(
    options.commercialContent,
    options.is_commercial_content,
    options.isCommercial,
    typeof options.commercial === "boolean" ? options.commercial : undefined,
    commercial.isCommercial,
    commercial.is_commercial_content,
    payload.commercialContent
  );
  const selectedOrganic =
    firstBoolean(
      options.yourBrand,
      options.brand_organic_toggle,
      options.brandOrganic,
      commercial.yourBrand,
      commercial.brandOrganic,
      payload.yourBrand
    ) ?? false;
  const selectedBranded =
    firstBoolean(
      options.brandedContent,
      options.brand_content_toggle,
      commercial.brandedContent,
      payload.brandedContent
    ) ?? false;
  const isCommercial = enabled ?? (selectedOrganic || selectedBranded);
  return {
    isCommercial,
    brandOrganic: isCommercial && selectedOrganic,
    brandedContent: isCommercial && selectedBranded,
    aiGenerated:
      firstBoolean(options.aiGenerated, options.is_aigc, payload.aiGenerated, payload.is_aigc) ??
      false,
  };
}

function tikTokDisclosurePostInfo({ isCommercial, brandOrganic, brandedContent, aiGenerated }) {
  return {
    brand_organic_toggle: isCommercial === true && brandOrganic === true,
    brand_content_toggle: isCommercial === true && brandedContent === true,
    is_aigc: aiGenerated === true,
  };
}

module.exports = { resolveTikTokDisclosures, tikTokDisclosurePostInfo };
