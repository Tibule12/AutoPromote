import React, { useState, useEffect, useRef } from "react";

/**
 * VoiceOverGuide Component
 *
 * Provides audio explanations for the currently active tab.
 * Uses the Web Speech API (speechSynthesis).
 */
const clipFinderScript =
  "This is Find Viral Clips. Load a video, choose your target clip length, focus topic, and social destinations such as TikTok, YouTube Shorts, or Instagram Reels, run the moment scan to audition ranked hook and payoff candidates, and send any selected moment directly into Viral Clip Studio.";

export const VOICE_OVER_TAB_SCRIPTS = {
  profile:
    "This is your Workspace Overview. Check publishing activity and connected platform status, jump directly into Cam Combiner, Find Viral Clips, or Publisher, and save default timezone, frequency, and destination preferences below.",
  cam_combiner:
    "This is Cam Combiner, your multi-camera podcast and interview sync workspace. Upload two or three camera angles and optional clean master audio, auto-sync the angles, review speaker-switching cuts, and export a finished mix or send it directly to Find Viral Clips.",
  clip_studio: clipFinderScript,
  clips: clipFinderScript,
  viral_clip_studio:
    "This is Viral Clip Studio. Upload your footage, start a design in Logo Workshop, restore a backup, or reopen a recent project. On the full timeline, you can trim with split, ripple, roll, slip, slide, and J or L audio cuts, jump by SMPTE timecode, collaborate with Director proposals, grade and key inside Motion and Flow with live scopes, edit reviewed captions with SRT and VTT exports, mix voiceovers, sound effects, and synced WAV stems, hand off OTIO or EDL timelines, and render in H.264, H.265, or ProRes.",
  upload:
    "This is the Unified Publisher. Upload your video, image, or post copy once, choose your destination platforms, customize per-platform titles, captions, and publishing options, and either publish immediately or schedule the release to your queue.",
  schedules:
    "This is your Publishing Queue and Schedule. Filter upcoming or past releases, preview media and destination statuses in your chosen timezone, edit release copy, pause, resume, reschedule, or manage queued posts in bulk.",
  connections:
    "This is Connections. Link, refresh, or disconnect your publishing channels including YouTube, TikTok, Facebook and Instagram, X, Snapchat, Spotify, Reddit, Discord, LinkedIn, Telegram, and Pinterest, and monitor your live connection readiness before publishing.",
  team:
    "This is Team Workspaces. Create or switch shared workspaces, invite teammates as admins, editors, or viewers within your seat allowance, manage roles and pending invitations, and review studio releases together before they go live.",
  billing:
    "This is Billing and Plans. Review your current subscription, publishing usage, and available credits, compare creator plans, manage your subscription through PayPal, or add credit top-up packs.",
  security:
    "This is Account Security. Change your password, enroll authenticator or SMS two-factor authentication, check your active session details and connected platform access, and adjust your privacy preferences.",
  notifications:
    "This is Notifications. Review recent publishing results, security notices, and account updates, clear items with Mark all read, or open the related workspace section.",
  rewards:
    "This is Growth and Rewards. Track your referral progress, copy your ambassador invite link, earn referral commissions for active paid subscribers, and view earned badges.",
  "admin-audit":
    "This is the Admin Audit Log. Review recorded administrative actions, account updates, and platform security events.",
  "admin-kyc":
    "This is Admin KYC Verification. Review submitted identity verification records and account verification statuses.",
  default:
    "Welcome to AutoPromote. Open any tab in your workspace and press Explain This Tab for an overview of its tools and workflow.",
};

const VoiceOverGuide = ({ activeTab, scripts: customScripts, theme = "dark" }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  // Ref to keep track of the active utterance so stale callbacks cannot clear newer playback
  const utteranceRef = useRef(null);

  const isLight = theme === "light";
  const scripts = customScripts
    ? { ...VOICE_OVER_TAB_SCRIPTS, ...customScripts }
    : VOICE_OVER_TAB_SCRIPTS;

  const stopSpeech = () => {
    utteranceRef.current = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  useEffect(() => {
    // Cancel active speech when switching tabs or unmounting
    stopSpeech();
    setIsPlaying(false);
    return () => {
      stopSpeech();
    };
  }, [activeTab]);

  const toggleSpeech = () => {
    if (isPlaying) {
      stopSpeech();
      setIsPlaying(false);
    } else {
      speak();
    }
  };

  const handleKeyDown = event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSpeech();
    }
  };

  const speak = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      alert("Your browser does not support text-to-speech.");
      return;
    }

    stopSpeech();
    const text = scripts[activeTab] || scripts.default;
    const UtteranceCtor = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
    const utterance = UtteranceCtor ? new UtteranceCtor(text) : { text };

    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setIsPlaying(false);
      }
    };

    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setIsPlaying(false);
      }
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
      onKeyDown={handleKeyDown}
      title={isPlaying ? "Stop Voice Guide" : "Play Voice Guide"}
      role="button"
      tabIndex={0}
      aria-label="Toggle Voice Guide"
      aria-pressed={isPlaying}
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
