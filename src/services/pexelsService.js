const { createClient } = require("pexels");

// Initialize Pexels client if key exists
// This service will search for videos based on keywords for the "Text-to-Video" feature
let client = null;

const initPexels = () => {
  if (client) return client;
  if (process.env.PEXELS_API_KEY) {
    client = createClient(process.env.PEXELS_API_KEY);
  } else {
    console.warn("[PexelsService] No API Key found. Stock footage search will fail.");
  }
  return client;
};

/**
 * Search for videos matching keywords
 * @param {string} query - Search term (e.g. "sunset city")
 * @param {string} orientation - "portrait", "landscape", "square"
 * @param {number} per_page - Number of results
 */
const searchVideos = async (query, orientation = "portrait", per_page = 5, size = "medium") => {
  try {
    const pexels = initPexels();
    if (!pexels) throw new Error("Pexels API Key missing");

    const result = await pexels.videos.search({
      query,
      per_page,
      orientation,
      size,
    });

    if (!result || !result.videos) return [];

    return result.videos.map(v => ({
      id: v.id,
      url:
        v.video_files.find(f => f.quality === "hd" && f.width < 2000)?.link ||
        v.video_files[0]?.link,
      preview: v.image,
      duration: v.duration,
      width: v.width,
      height: v.height,
      photographer: v.user.name,
    }));
  } catch (error) {
    console.error("[PexelsService] Search failed:", error.message);
    return [];
  }
};

/**
 * Find visual concepts for a script segment
 * Uses simple keyword extraction (can be enhanced with AI)
 */
const findVisualsForScript = async scriptText => {
  // Simple heuristic: remove stop words and take longest noun/verb
  // In production, use OpenAI/Gemini to extract "Visual Keywords"
  // For now, let's just use the strict query
  return await searchVideos(scriptText, "portrait", 5);
};

module.exports = {
  searchVideos,
  findVisualsForScript,
};
