// complianceService.js - Enforces platform-specific compliance rules
// Ensures uploads respect rules for Commercial/Sponsored content

const VALIDATION_ERRORS = {
  TIKTOK_MUSIC: "TikTok commercial content requiring a music usage agreement must be confirmed.",
  YOUTUBE_DISCLOSURE: "YouTube paid promotion requires the disclosure flag to be checked.",
  MISSING_PARTNER: "Sponsored/Branded content requires a declared Brand Partner.",
  LINKEDIN_ORG: "LinkedIn commercial posts require a valid Organization/Company ID.",
};

/**
 * Check if the upload request complies with platform-specific rules
 * @param {string} platform - 'tiktok', 'youtube', 'instagram', etc.
 * @param {object} options - Platform-specific options object
 * @param {string} intent - 'organic', 'commercial', 'sponsored'
 * @throws {Error} if compliance check fails
 */
function checkPlatformCompliance(platform, options, intent) {
  if (!options) return;

  // 1. TikTok Compliance
  if (platform === "tiktok") {
    // If commercial/sponsored, strict rules apply
    if (intent === "commercial" || intent === "sponsored") {
      // Structure check: options.commercial { yourBrand, brandedContent }
      const comm = options.commercial || {};

      // If intent says Sponsored, we expect Branded Content or Your Brand flag
      if (intent === "sponsored" && !comm.brandedContent && !comm.yourBrand) {
        // Fallback for legacy simple flag if used
        if (!options.brandName) {
          throw new Error(
            `${VALIDATION_ERRORS.MISSING_PARTNER} (TikTok - Select 'Branded Content' or 'Your Brand')`
          );
        }
      }
    }
  }

  // 2. YouTube Compliance
  if (platform === "youtube") {
    const isPaidPromo = options.paidPromotion === true;

    // If intent is determined as commercial/sponsored via the checkbox,
    // we ensure the platform flag that triggers the "Includes Paid Promotion" overlay is set.
    // (In our intent logic, paidPromotion=true IS the trigger for intent=commercial/sponsored, so this is circular but safe)

    if (intent === "sponsored" && !isPaidPromo) {
      // This case happens if system detects sponsorship via other means but user didn't check the box
      throw new Error(VALIDATION_ERRORS.YOUTUBE_DISCLOSURE);
    }
  }

  // 3. Instagram / Facebook Compliance
  if (platform === "instagram" || platform === "facebook") {
    if (intent === "sponsored") {
      // "Paid Partnership" requires a sponsor user/brand
      if (!options.sponsorUser && !options.brandName) {
        throw new Error(`${VALIDATION_ERRORS.MISSING_PARTNER} (${platform})`);
      }
    }
  }

  // 4. LinkedIn Compliance
  if (platform === "linkedin") {
    if (intent === "commercial" || intent === "sponsored") {
      // Commercial posts usually attach to a Company Page, not a personal profile
      if (!options.companyId) {
        throw new Error(VALIDATION_ERRORS.LINKEDIN_ORG);
      }
    }
  }
}

module.exports = {
  checkPlatformCompliance,
  VALIDATION_ERRORS,
};
