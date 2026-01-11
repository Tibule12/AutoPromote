import React, { useState, useEffect, useRef } from "react";

/**
 * VoiceOverGuide Component
 *
 * Provides audio explanations for the currently active tab.
 * Uses the Web Speech API (speechSynthesis).
 */
const VoiceOverGuide = ({ activeTab, scripts: customScripts, theme = "dark" }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  // Ref to keep track of the current utterance so we can cancel it
  const utteranceRef = useRef(null);

  const isLight = theme === "light";

  // Default script dictionary for user dashboard
  const defaultScripts = {
    profile:
      "This is your User Profile. View your aggregate stats, manage your account settings, and customize your avatar.",
    upload:
      "This is the Content Upload center. Select your video or image, choose which platforms to post to, and our engines will optimize it for virality.",
    schedules:
      "The Temporal Orchestrator allows you to plan your content calendar. Drag and drop posts to schedule them for the perfect time.",
    analytics:
      "The Analytics Panel shows you deep insights into your performance. Track views, engagement runs, and viral growth across all platforms.",
    rewards:
      "Earn credits by completing tasks and referring friends. Use credits to unlock premium viral features.",
    notifications: "Check your latest alerts, system messages, and engagement notifications here.",
    earnings:
      "This is your Earnings Hub. As a subscriber, you can earn exclusive bonuses for high-performing content. For example, reach 30,000 viral views to earn a $3 bonus. Remember provided you are subscribed, these are extra rewards from us on top of what you already earn directly from platforms like YouTube or TikTok.",
    ads: "Manage your paid ad campaigns here to boost your content even further with targeted promotion.",
    connections:
      "In the Connections tab, you can link your social media accounts like TikTok, YouTube, and Instagram. This is required for auto-posting.",
    "admin-audit":
      "Admin Audit Log. Review all system actions, user changes, and critical security events.",
    "admin-kyc": "Admin KYC Verification. Review and approve user identity documents.",
    security:
      "Manage your account security, two-factor authentication, and privacy settings here to keep your account safe.",
    feed: "The Community Feed. See what others are posting, gather inspiration, and engage with the community.",
    community:
      "The Community Forum. Discuss strategies, join viral squads, and connect with other creators.",
    clips:
      "This is the AI Clip Studio. Use our advanced AI tools to generate clips, remix trends, and create viral short-form content.",
    live: "Live Watch. Verify your stream key and monitor your live stream performance.",
    // Default fallback
    default: "Welcome to AutoPromote. Select a tab to learn more about its features.",
  };

  const scripts = customScripts || defaultScripts;

  useEffect(() => {
    // When tab changes, stop any current speech
    stopSpeech();
    setIsPlaying(false);
  }, [activeTab]);

  const stopSpeech = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const toggleSpeech = () => {
    if (isPlaying) {
      stopSpeech();
      setIsPlaying(false);
    } else {
      speak();
    }
  };

  const speak = () => {
    if (!window.speechSynthesis) {
      alert("Your browser does not support text-to-speech.");
      return;
    }

    const text = scripts[activeTab] || scripts["default"];
    const utterance = new SpeechSynthesisUtterance(text);

    // Optional: Select a voice
    // const voices = window.speechSynthesis.getVoices();
    // utterance.voice = voices.find(v => v.lang === 'en-US') || voices[0];

    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      setIsPlaying(false);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  return (
    <div
      className="voice-guide-control"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        background: isPlaying
          ? isLight
            ? "rgba(25, 118, 210, 0.15)"
            : "rgba(99, 102, 241, 0.2)"
          : isLight
            ? "rgba(0, 0, 0, 0.05)"
            : "rgba(255, 255, 255, 0.05)",
        border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        marginLeft: "10px",
        marginRight: "0",
      }}
      onClick={toggleSpeech}
      title={isPlaying ? "Stop Voice Guide" : "Play Voice Guide"}
      role="button"
      aria-label="Toggle Voice Guide"
    >
      <span style={{ marginRight: "8px", fontSize: "1.2rem" }}>{isPlaying ? "🔊" : "🔈"}</span>
      <span
        style={{
          fontSize: "0.85rem",
          color: isPlaying ? (isLight ? "#1976d2" : "#818cf8") : isLight ? "#555" : "#94a3b8",
          fontWeight: 500,
        }}
      >
        {isPlaying ? "Speaking..." : "Explain This Tab"}
      </span>
    </div>
  );
};

export default VoiceOverGuide;
