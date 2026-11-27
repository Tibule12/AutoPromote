'use strict';

// Promoting the creator's own business is commercial. A paid partnership is
// sponsored. Preserve this distinction across multi-platform account checks.
function determineContentIntent(platformOptions = {}) {
  let intent = 'organic';
  for (const [platform, options] of Object.entries(platformOptions || {})) {
    if (!options) continue;
    const commercial = options.commercial || {};
    if ((platform === 'tiktok' && (commercial.brandedContent || options.brandedContent)) ||
        (['instagram', 'facebook', 'pinterest'].includes(platform) && options.isPaidPartnership) ||
        (platform === 'youtube' && options.paidPromotion)) return 'sponsored';
    if ((platform === 'tiktok' && (options.commercialContent || commercial.isCommercial || commercial.yourBrand || options.yourBrand)) ||
        (['linkedin', 'reddit'].includes(platform) && options.isPromotional)) intent = 'commercial';
  }
  return intent;
}

module.exports = { determineContentIntent };
