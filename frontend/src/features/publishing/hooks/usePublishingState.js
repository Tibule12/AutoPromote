import { useState, useCallback } from "react";

/**
 * Manages the state for the Unified Publisher.
 *
 * Concepts:
 * 1. Global State: File, Title, Description that applies by default.
 * 2. Platform Overrides: Specific data for a platform (e.g. TikTok privacy settings) that overrides global defaults.
 * 3. Selection: Which platforms are currently active.
 */
export const usePublishingState = (initialPlatforms = []) => {
  // --- Global State ---
  const [globalFile, setGlobalFile] = useState(null);
  const [globalTitle, setGlobalTitle] = useState("");
  const [globalDescription, setGlobalDescription] = useState("");

  // --- Advanced Global Features (Bounty / Protocol 7) ---
  const [bountyAmount, setBountyAmount] = useState(0);
  const [bountyNiche, setBountyNiche] = useState("");
  const [protocol7Enabled, setProtocol7Enabled] = useState(false);
  const [protocol7Volatility, setProtocol7Volatility] = useState("medium");

  // --- Marketing & Growth Features ---
  // Viral Optimization
  const [optimizeViral, setOptimizeViral] = useState(false);

  // A/B Testing (Variants)
  const [variants, setVariants] = useState([]); // Array of strings (alternate titles)

  // --- Scheduling ---
  const [scheduledTime, setScheduledTime] = useState(""); // ISO date string or empty for "Now"
  const [frequency, setFrequency] = useState("once"); // 'once', 'daily', 'weekly'

  // --- Platform Selection ---
  // valid values: "tiktok", "youtube", "instagram", "facebook", "linkedin", "twitter", "pinterest"
  const [selectedPlatforms, setSelectedPlatforms] = useState(initialPlatforms);

  // --- Platform Specific Data (Overrides) ---
  // Structure: { tiktok: { privacy: "public", commercial: false, ... }, youtube: { ... } }
  const [platformData, setPlatformData] = useState({});

  // --- Actions ---

  const togglePlatform = useCallback(platformId => {
    setSelectedPlatforms(prev => {
      if (prev.includes(platformId)) {
        return prev.filter(p => p !== platformId);
      }
      return [...prev, platformId];
    });
  }, []);

  // Update specific data for a platform (e.g. from TikTokForm)
  const updatePlatformData = useCallback((platformId, data) => {
    setPlatformData(prev => ({
      ...prev,
      [platformId]: {
        ...prev[platformId],
        ...data,
      },
    }));
  }, []);

  // Clear a specific field override to revert to global (optional advanced usage)
  const clearPlatformOverride = useCallback((platformId, field) => {
    setPlatformData(prev => {
      const newData = { ...prev[platformId] };
      delete newData[field];
      return { ...prev, [platformId]: newData };
    });
  }, []);

  // Get the effective data for a platform (merging global + override)
  const getPlatformEffectiveData = useCallback(
    platformId => {
      const overrides = platformData[platformId] || {};

      return {
        // 1. Start with global defaults
        file: globalFile,
        title: globalTitle,
        description: globalDescription,
        // 2. Apply existing platform data (which might contain its own title/desc)
        ...overrides,
        // 3. Ensure critical flags exist
        id: platformId,
      };
    },
    [globalFile, globalTitle, globalDescription, platformData]
  );

  return {
    // State
    globalFile,
    globalTitle,
    globalDescription,
    bountyAmount,
    bountyNiche,
    protocol7Enabled,
    protocol7Volatility,

    // Setters
    setGlobalFile,
    setGlobalTitle,
    setGlobalDescription,
    setBountyAmount,
    setBountyNiche,
    setProtocol7Enabled,
    setProtocol7Volatility,

    // Marketing State
    optimizeViral,
    setOptimizeViral,
    variants,
    setVariants,

    // Scheduling
    scheduledTime,
    setScheduledTime,
    frequency,
    setFrequency,

    // State (Selection/Data)
    selectedPlatforms,
    platformData,

    // Actions
    togglePlatform,
    updatePlatformData,
    getPlatformEffectiveData,
  };
};
