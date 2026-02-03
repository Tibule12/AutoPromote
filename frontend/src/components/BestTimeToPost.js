import React, { useState, useEffect } from "react";
import "./BestTimeToPost.css";

const OPTIMAL_TIMES = {
  youtube: { days: ["Thursday", "Friday", "Saturday"], hours: [14, 15, 16, 17, 18] },
  tiktok: { days: ["Tuesday", "Thursday", "Friday"], hours: [15, 16, 17, 18, 19, 20] },
  instagram: { days: ["Wednesday", "Friday"], hours: [11, 13, 14, 17, 18, 19] },
  facebook: { days: ["Wednesday", "Thursday", "Friday"], hours: [13, 14, 15] },
  twitter: { days: ["Monday", "Tuesday", "Wednesday"], hours: [8, 9, 12, 17, 18] },
  linkedin: { days: ["Tuesday", "Wednesday", "Thursday"], hours: [7, 8, 9, 12, 17] },
  reddit: { days: ["Sunday", "Monday"], hours: [6, 7, 8, 9, 20, 21] },
  pinterest: { days: ["Friday", "Saturday"], hours: [20, 21, 22] },
  snapchat: { days: ["Friday", "Saturday", "Sunday"], hours: [19, 20, 21, 22] },
};

export { OPTIMAL_TIMES };

function BestTimeToPost({ selectedPlatforms }) {
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    generateSuggestion();
  }, [selectedPlatforms]);

  const generateSuggestion = () => {
    if (!selectedPlatforms || selectedPlatforms.length === 0) {
      setSuggestion(null);
      return;
    }

    const now = new Date();
    const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
    const currentHour = now.getHours();

    // Find best platform match for current time
    let bestMatch = null;
    let bestScore = 0;

    selectedPlatforms.forEach(platform => {
      const optimal = OPTIMAL_TIMES[platform];
      if (!optimal) return;

      const dayMatch = optimal.days.includes(currentDay) ? 1 : 0;
      const hourMatch = optimal.hours.includes(currentHour) ? 1 : 0;
      const score = dayMatch + hourMatch;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { platform, optimal, score };
      }
    });

    if (bestMatch && bestMatch.score > 0) {
      setSuggestion({
        type: "now",
        platform: bestMatch.platform,
        message: `🔥 Great time to post on ${bestMatch.platform.charAt(0).toUpperCase() + bestMatch.platform.slice(1)}!`,
      });
    } else {
      // Find next best time
      const nextDay = getNextBestDay(selectedPlatforms[0]);
      const nextHour = OPTIMAL_TIMES[selectedPlatforms[0]]?.hours[0] || 12;
      setSuggestion({
        type: "later",
        message: `⏰ Best time: ${nextDay} at ${formatHour(nextHour)}`,
        details: `Optimal engagement window for your selected platforms`,
      });
    }
  };

  const getNextBestDay = platform => {
    const optimal = OPTIMAL_TIMES[platform];
    if (!optimal) return "Tomorrow";
    return optimal.days[0] || "Tomorrow";
  };

  const formatHour = hour => {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  if (!suggestion) return null;

  return (
    <div className={`best-time-to-post ${suggestion.type}`}>
      <div className="best-time-icon">{suggestion.type === "now" ? "🚀" : "📅"}</div>
      <div className="best-time-content">
        <div className="best-time-message">{suggestion.message}</div>
        {suggestion.details && <div className="best-time-details">{suggestion.details}</div>}
      </div>
    </div>
  );
}

export default BestTimeToPost;
