// contentModerationService.js
// Service for detecting sensitive, adult, or banned content.
// Simulates AI moderation for files and uses keyword blocking for text.

const BANNED_KEYWORDS = [
  "adult",
  "nsfw",
  "xxx",
  "porn",
  "violence",
  "hate",
  "racist",
  "kill",
  "suicide",
  "nudity",
  // Add more as needed
];

/**
 * Check if text contains banned content
 * @param {string} text - The text to check (title, description, etc.)
 * @returns {object} - { safe: boolean, flags: string[] }
 */
function checkTextForSafety(text) {
  if (!text) return { safe: true, flags: [] };

  const lower = text.toLowerCase();
  const flags = [];

  BANNED_KEYWORDS.forEach(word => {
    // Simple word boundary check to avoid false positives (e.g., "kill" in "skill")
    // Note: This is basic. Production would use partial matching carefully or AI.
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) {
      flags.push(word);
    }
  });

  return {
    safe: flags.length === 0,
    flags,
  };
}

/**
 * Simulate file content moderation (Video/Image)
 * In production, this would call AWS Rekognition, Google Cloud Vision, or Azure Content Safety.
 * @param {string} filePath - Path to the file
 * @returns {Promise<object>} - { safe: boolean, reason: string|null }
 */
async function checkFileForSafety(filePath) {
  // 1. Check if file exists
  if (!filePath) return { safe: true, reason: null };

  // 2. Simulate AI Analysis Delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // 3. (Mock) If filename contains 'unsafe', fail it.
  if (filePath.toLowerCase().includes("unsafe") || filePath.toLowerCase().includes("adult")) {
    return { safe: false, reason: "Automated visual analysis detected restricted content." };
  }

  // Default: Pass
  return { safe: true, reason: null };
}

module.exports = {
  checkTextForSafety,
  checkFileForSafety,
};
