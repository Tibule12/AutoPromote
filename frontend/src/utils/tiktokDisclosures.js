// Keep the review and submitted API options in agreement with the visible controls.
export function tikTokDisclosureOptions(data = {}) {
  const commercial = data.commercial && typeof data.commercial === "object" ? data.commercial : {};
  const selectedOrganic =
    (data.yourBrand ??
      data.brand_organic_toggle ??
      data.brandOrganic ??
      commercial.yourBrand ??
      commercial.brandOrganic) === true;
  const selectedBranded =
    (data.brandedContent ?? data.brand_content_toggle ?? commercial.brandedContent) === true;
  const commercialContent =
    (data.commercialContent ??
      data.is_commercial_content ??
      data.isCommercial ??
      (typeof data.commercial === "boolean" ? data.commercial : undefined) ??
      commercial.isCommercial ??
      commercial.is_commercial_content ??
      (selectedOrganic || selectedBranded)) === true;
  const yourBrand = commercialContent && selectedOrganic;
  const brandedContent = commercialContent && selectedBranded;
  const aiGenerated = (data.aiGenerated ?? data.is_aigc) === true;
  return {
    commercialContent,
    yourBrand,
    brandedContent,
    aiGenerated,
    brand_organic_toggle: yourBrand,
    brand_content_toggle: brandedContent,
    is_aigc: aiGenerated,
    disclosure: commercialContent || aiGenerated,
    commercial: {
      isCommercial: commercialContent,
      yourBrand,
      brandedContent,
      is_commercial_content: commercialContent,
    },
  };
}

export function tikTokDisclosureLabels(data = {}) {
  const options = tikTokDisclosureOptions(data);
  const labels = [];
  if (options.brandedContent) labels.push("Paid partnership");
  else if (options.yourBrand) labels.push("Promotional content");
  if (options.aiGenerated) labels.push("AI-generated content");
  return labels.length ? labels.join(" · ") : "No disclosure labels selected";
}
