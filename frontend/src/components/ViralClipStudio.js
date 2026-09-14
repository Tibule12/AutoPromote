Warning: truncated output (original token count: 157084)
Total output lines: 15396

/* eslint-disable no-unused-vars, no-control-regex */
import {
  applySafeMediaSource,
  createSecureId,
  getSafeMediaSource,
  sanitizeUrl,
} from "../utils/security";
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { uploadSourceFileViaBackend } from "../utils/sourceUpload";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useSubscription } from "../hooks/useSubscription";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import html2canvas from "html2canvas"; // For rendering styled captions
import { trackClipWorkflowEvent } from "../utils/clipWorkflowAnalytics";
import { playMediaSafely } from "../utils/mediaPlayback";
import toast from "react-hot-toast";
import { SafeAudio, SafeImage, SafeVideo } from "./SafeMedia";
import SoundWaveform from "./motion/SoundWaveform";
import MotionPanel from "./motion/MotionPanel";
import MotionCanvas from "./motion/MotionCanvas";
import { motionCues, cutMotion, normalizeMotion } from "./motion/motionModel";
import { DESIGN_SOUNDS, synthesizeEffect } from "./motion/soundDesign";
import AudioRemixPanel from "./audio/AudioRemixPanel";
import {
  DEFAULT_AUDIO_REMIX,
  audioRemixForRender,
  normalizeAudioRemix,
} from "./audio/audioRemixModel";
import { updateAudioRemixPreview } from "./audio/audioRemixPreview";
import "./audio/audioRemixTimeline.css";
import "./ViralClipStudio.css"; // We'll create this CSS next

const TimelineVideoThumbnail = ({ src, previewTime, style }) => {
  const thumbnailRef = useRef(null);

  useEffect(() => {
    const video = thumbnailRef.current;
    if (!video) return undefined;

    const showRequestedFrame = () => {
      const duration = Number(video.duration || 0);
      const requestedTime = Math.max(0, Number(previewTime || 0));
      const targetTime =
        duration > 0 ? Math.min(requestedTime, Math.max(0, duration - 0.04)) : requestedTime;
      if (!Number.isFinite(targetTime)) return;
      try {
        video.currentTime = targetTime;
      } catch (error) {
        console.log("Timeline thumbnail seek skipped", error);
      }
    };

    video.addEventListener("loadedmetadata", showRequestedFrame);
    video.addEventListener("durationchange", showRequestedFrame);
    if (video.readyState >= 1) showRequestedFrame();

    return () => {
      video.removeEventListener("loadedmetadata", showRequestedFrame);
      video.removeEventListener("durationchange", showRequestedFrame);
    };
  }, [previewTime, src]);

  return (
    <SafeVideo
      ref={thumbnailRef}
      src={src}
      muted
      playsInline
      preload="metadata"
      tabIndex={-1}
      aria-hidden="true"
      className="compact-filmstrip-frame"
      style={style}
    />
  );
};

const RAINBOW_COLORS = [
  "#FF9AA2", // Soft Red
  "#FFB7B2", // Salmon
  "#FFDAC1", // Peach
  "#E2F0CB", // Lime Green
  "#B5EAD7", // Mint
  "#C7CEEA", // Lavender
  "#F4C2C2", // Baby Pink
  "#89CFF0", // Baby Blue
];

const normalizePlainText = value =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim();

const normalizeHookText = value =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const DEFAULT_HOOK_TEXT = "THIS CHANGES FAST";

const HOOK_MIN_SEGMENT_DURATION = 2;
const HOOK_MAX_SEGMENT_DURATION = 5;

const SOUND_EFFECT_PRESETS = [
  ...DESIGN_SOUNDS,
  { id: "whoosh", name: "Whoosh", emoji: "💨", duration: 0.8, tone: "sweep" },
  { id: "impact", name: "Impact", emoji: "💥", duration: 0.65, tone: "impact" },
  { id: "pop", name: "Pop", emoji: "🫧", duration: 0.28, tone: "pop" },
  { id: "click", name: "Click", emoji: "🖱️", duration: 0.16, tone: "click" },
  { id: "riser", name: "Riser", emoji: "🚀", duration: 1.5, tone: "riser" },
];

const GENERIC_HOOK_TEXTS = new Set([
  "WAIT FOR IT...",
  "WAIT FOR IT",
  "THIS CHANGES FAST",
  "WATCH THIS PART",
  "DON'T MISS THIS",
]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const clampAudioControl = (value, minimum, maximum, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
};

const clampNumber = (value, minimum, maximum, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
};

const getAudioFadeGain = (timelineTime, timelineDuration, fadeIn, fadeOut) => {
  const safeTime = Math.max(0, Number(timelineTime) || 0);
  const safeDuration = Math.max(0, Number(timelineDuration) || 0);
  const safeFadeIn = Math.max(0, Number(fadeIn) || 0);
  const safeFadeOut = Math.max(0, Number(fadeOut) || 0);
  const fadeInGain = safeFadeIn > 0 ? Math.min(1, safeTime / safeFadeIn) : 1;
  const remaining = Math.max(0, safeDuration - safeTime);
  const fadeOutGain =
    safeFadeOut > 0 && safeDuration > 0 ? Math.min(1, remaining / safeFadeOut) : 1;
  return Math.max(0, Math.min(fadeInGain, fadeOutGain));
};

const normalizeAudioMode = value => {
  const normalized = String(value || "mix")
    .trim()
    .toLowerCase();
  if (["mix", "replace", "duck_original"].includes(normalized)) return normalized;
  return "mix";
};

const isPresetMusicSelection = value => /\.mp3$/i.test(String(value || "").trim());

const HOOK_TEMPLATES = {
  blur_reveal: {
    label: "Blur Reveal",
    description: "A sharp blur-to-clear reveal with high-contrast text that lands immediately.",
    duration: 3,
    blurBackground: true,
    darkOverlay: true,
    freezeFrame: false,
    zoomScale: 1.1,
    textAnimation: "slide-up",
  },
  zoom_focus: {
    label: "Zoom Focus",
    description: "A fast focal push with extra contrast for energetic spoken openings.",
    duration: 3,
    blurBackground: false,
    darkOverlay: true,
    freezeFrame: false,
    zoomScale: 1.16,
    textAnimation: "fade-in",
  },
  freeze_text: {
    label: "Freeze + Text",
    description: "A confident freeze, headline hit, then a smooth release back into motion.",
    duration: 3.2,
    blurBackground: true,
    darkOverlay: true,
    freezeFrame: true,
    zoomScale: 1.08,
    textAnimation: "fade-in",
  },
};

const BROLL_CADENCE_PRESETS = {
  sparse: {
    label: "Sparse",
    interval: 18,
    maxBeats: 12,
    helper: "Leaves longer stretches on the speaker.",
  },
  balanced: {
    label: "Balanced",
    interval: 10,
    maxBeats: 24,
    helper: "Adds proof without interrupting the conversation.",
  },
  frequent: {
    label: "Frequent",
    interval: 6,
    maxBeats: 32,
    helper: "Keeps a fast visual rhythm for high-energy clips.",
  },
};

const DEFAULT_HOOK_FOCUS_POINT = Object.freeze({ x: 50, y: 42 });

const normalizeHookFocusPoint = point => ({
  x: clampNumber(point?.x, 0, 100, DEFAULT_HOOK_FOCUS_POINT.x),
  y: clampNumber(point?.y, 0, 100, DEFAULT_HOOK_FOCUS_POINT.y),
});

const getHookTemplateConfig = templateKey =>
  HOOK_TEMPLATES[templateKey] || HOOK_TEMPLATES.blur_reveal;

const getHookSuggestion = clip => {
  const reason = normalizePlainText(clip?.reason || "");
  const clipStart = clampNumber(clip?.start, 0, 1.5, 0.8);
  const motionHint = /(movement|motion|energy|laugh|spike|action|impact|fast|reveal)/i.test(reason);
  const staticHint = /(intro|setup|calm|question|talking|story|explains|static)/i.test(reason);

  if (motionHint) {
    return {
      suggestedStart: Math.max(0.5, Math.min(1.1, clipStart || 0.5)),
      templateKey: "zoom_focus",
      message: "Early motion detected in the selected moment. Start quickly and push the frame in.",
    };
  }

  if (clipStart >= 0.5 && clipStart <= 1.5) {
    return {
      suggestedStart: clipStart,
      templateKey: "freeze_text",
      message:
        "There is an early beat change near the opening. Freeze briefly and land the message on it.",
    };
  }

  return {
    suggestedStart: staticHint ? 0.9 : 0.7,
    templateKey: "blur_reveal",
    message: "The opening looks calmer, so add blur and contrast before the reveal.",
  };
};

const getHookCopySuggestions = clip => {
  const reason = normalizePlainText(clip?.reason || "");
  const hasQuestion = /\?/.test(reason) || /(why|how|what|when)/i.test(reason);
  const hasAction =
    /(movement|motion|energy|laugh|spike|action|impact|fast|reveal|switch|flip)/i.test(reason);
  const hasStory = /(story|talking|explains|setup|intro|lesson|mistake|truth|secret)/i.test(reason);

  const suggestions = [];

  if (hasQuestion) {
    suggestions.push("THE ANSWER HITS HERE");
    suggestions.push("WAIT UNTIL THIS PART");
  }

  if (hasAction) {
    suggestions.push("THIS IS WHERE IT FLIPS");
    suggestions.push("DON'T BLINK HERE");
  }

  if (hasStory) {
    suggestions.push("THIS PART CHANGES THE STORY");
    suggestions.push("HERE'S THE PART THAT MATTERS");
  }

  suggestions.push("WATCH WHAT HAPPENS NEXT");
  suggestions.push("THIS CHANGES FAST");
  suggestions.push("THE NEXT 3 SECONDS MATTER");

  return [...new Set(suggestions)].slice(0, 4).map(text => normalizeHookText(text));
};

const getClipDescriptorText = clip =>
  normalizePlainText(
    [clip?.reason, clip?.label, clip?.transcript, clip?.text, clip?.title].filter(Boolean).join(" ")
  );

const getClipDurationSeconds = clip => {
  const explicitDuration = Number(clip?.duration);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) return explicitDuration;

  const start = Number(clip?.start || 0);
  const end = Number(clip?.end || 0);
  return Math.max(0, end - start);
};

const CATEGORY_TAG_RULES = [
  {
    label: "High Energy",
    icon: "🔥",
    pattern:
      /(motion|movement|fast|energy|action|impact|laugh|dance|switch|cut|dynamic|spike|reveal)/i,
  },
  {
    label: "Emotional",
    icon: "😳",
    pattern: /(emotional|cry|reaction|heart|shock|confession|surprise|love|angry|fear|dramatic)/i,
  },
  {
    label: "Educational",
    icon: "🎓",
    pattern: /(how|why|lesson|learn|tutorial|guide|tip|explains|education|mistake|truth|secret)/i,
  },
  {
    label: "Funny",
    icon: "😂",
    pattern: /(funny|laugh|joke|prank|comedy|hilarious|meme)/i,
  },
  {
    label: "Promotional",
    icon: "💰",
    pattern: /(promo|promotional|offer|sale|product|launch|brand|ad|subscribe|buy|deal)/i,
  },
];

const NARRATIVE_ROLE_RULES = [
  {
    id: "payoff",
    label: "Payoff",
    pattern:
      /(result|reveal|payoff|before|after|final|ending|turned out|this happened|proof|transformation)/i,
  },
  {
    id: "hook",
    label: "Hook",
    pattern:
      /(\?|why|how|what|wait|watch|secret|mistake|truth|don't|stop|before|until|never|crazy|wild)/i,
  },
  {
    id: "reaction",
    label: "Reaction",
    pattern: /(reaction|laugh|shock|surprise|cry|stunned|face|emotional|crowd|applause)/i,
  },
  {
    id: "proof",
    label: "Proof",
    pattern: /(shows|demo|proves|example|evidence|breakdown|explains|walkthrough|tutorial|guide)/i,
  },
  {
    id: "story",
    label: "Story Beat",
    pattern: /(story|moment|confession|lesson|journey|remember|told me|happened|realized)/i,
  },
];

const AUDIENCE_PROFILE_RULES = [
  {
    id: "performance",
    label: "Performance",
    pattern:
      /(choir|singer|singing|vocal|harmony|chorus|worship|performance|concert|band|stage|music video)/i,
  },
  {
    id: "education",
    label: "Education",
    pattern:
      /(tutorial|lesson|guide|how to|mistake|truth|secret|explains|learn|teaches|education)/i,
  },
  {
    id: "reaction",
    label: "Reaction",
    pattern: /(reaction|laugh|prank|funny|shock|surprise|face|commentary|responding)/i,
  },
  {
    id: "product",
    label: "Product",
    pattern: /(product|offer|sale|brand|launch|ad|promo|review|feature|tool|app)/i,
  },
  {
    id: "story",
    label: "Story",
    pattern: /(story|confession|journey|moment|experience|realized|happened|behind the scenes)/i,
  },
];

const BROLL_SHOT_STYLES = {
  proof: {
    kicker: "PROOF CUTAWAY",
    title: "Show the receipt",
    subtitle: "Use a screen, result, detail, or object that proves the line.",
    tone: "proof",
    bg: "rgba(9, 18, 32, 0.92)",
  },
  detail: {
    kicker: "DETAIL SHOT",
    title: "Get closer",
    subtitle: "Punch into hands, product, face, timeline, or the thing being named.",
    tone: "detail",
    bg: "rgba(12, 17, 24, 0.92)",
  },
  reaction: {
    kicker: "REACTION CUT",
    title: "Catch the face",
    subtitle: "Drop in the look, laugh, pause, or crowd response that sells it.",
    tone: "reaction",
    bg: "rgba(18, 13, 25, 0.92)",
  },
  payoff: {
    kicker: "PAYOFF SHOT",
    title: "Show the outcome",
    subtitle: "Cut to before/after, final reveal, transformation, or the win.",
    tone: "payoff",
    bg: "rgba(26, 13, 10, 0.92)",
  },
};

const MOMENT_TAG_RULES = [
  "reveal",
  "mistake",
  "truth",
  "secret",
  "reaction",
  "laugh",
  "result",
  "proof",
  "lesson",
  "before",
  "after",
  "performance",
  "vocal",
  "energy",
  "switch",
];

const inferRuleMatch = (rules, text, fallback) =>
  rules.find(rule => rule.pattern.test(text)) || fallback;

const getSemanticTokens = text => {
  const normalized = normalizePlainText(text).toLowerCase();
  const matches = MOMENT_TAG_RULES.filter(token => normalized.includes(token));

  if (matches.length) return matches;

  return normalized
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 5)
    .slice(0, 3);
};

const buildTravelReason = (narrativeRole, audienceProfile, signals) => {
  if (audienceProfile.id === "performance") {
    return "This moment can travel because the emotional rise is visual even before captions land.";
  }
  if (narrativeRole.id === "payoff") {
    return "This moment travels because it gets to proof fast and rewards the click quickly.";
  }
  if (signals.hook && signals.motion) {
    return "This moment travels because the promise lands early and the pacing keeps people moving.";
  }
  if (signals.speech) {
    return "This moment travels because the spoken idea is clear enough to package in one sentence.";
  }
  return "This moment travels because it has enough clarity to recut into multiple social angles.";
};

const buildRecutVariants = (clip, context) => {
  const start = Number(clip?.start || 0);
  const end = Math.max(start + 0.6, Number(clip?.end || start));
  const duration = Math.max(0.6, end - start);
  const hookOptions = getHookCopySuggestions(clip);
  const boundedVariant = (nextStart, nextEnd) => {
    const safeStart = Math.max(start, Math.min(nextStart, end - 0.6));
    const safeEnd = Math.max(safeStart + 0.6, Math.min(end, nextEnd));
    return { start: safeStart, end: safeEnd, duration: safeEnd - safeStart };
  };

  const curiosityBounds = boundedVariant(start, end - Math.min(1.2, duration * 0.06));
  const authorityBounds = boundedVariant(
    start + Math.min(0.55, duration * 0.08),
    end - Math.min(0.4, duration * 0.03)
  );
  const payoffBounds = boundedVariant(
    start + Math.min(Math.max(0.9, duration * 0.18), Math.max(1.2, duration - 2.4)),
    end
  );

  return [
    {
      id: "curiosity",
      label: "Curiosity Cut",
      summary: "Lead with tension and let the answer arrive a beat later.",
      openingMove:
        context.narrativeRole.id === "payoff"
          ? "Hold back the proof for one beat so the viewer leans in."
          : "Start on the question or strange moment before the explanation lands.",
      hookText: hookOptions[0] || "WAIT FOR THIS",
      templateKey: "blur_reveal",
      ...curiosityBounds,
    },
    {
      id: "authority",
      label: "Authority Cut",
      summary: "Trim the setup and open on the clearest confident statement.",
      openingMove:
        context.audienceProfile.id === "education"
          ? "Open directly on the lesson and let the clip prove it."
          : "Use the strongest claim frame first so the clip feels decisive.",
      hookText: hookOptions[1] || "HERE'S WHAT CHANGED",
      templateKey: "freeze_text",
      ...authorityBounds,
    },
    {
      id: "payoff",
      label: "Payoff First",
      summary: "Jump closer to the reward and use contrast to keep it replayable.",
      openingMove:
        context.audienceProfile.id === "performance"
          ? "Start near the vocal lift or emotional swell, then let the room react."
          : "Open close to the visual or spoken payoff and let the rest explain itself.",
      hookText: hookOptions[2] || "THIS IS THE PAYOFF",
      templateKey: "zoom_focus",
      ...payoffBounds,
    },
  ];
};

const getClipMidpoint = clip => {
  const start = Number(clip?.start || 0);
  const end = Number(clip?.end || start);
  return start + Math.max(0, end - start) / 2;
};

const countTokenOverlap = (leftTokens, rightTokens) => {
  const left = new Set(leftTokens || []);
  const right = new Set(rightTokens || []);
  let overlap = 0;
  left.forEach(token => {
    if (right.has(token)) overlap += 1;
  });
  return overlap;
};

const buildMomentFamilies = rankedEntries => {
  const families = [];

  rankedEntries.forEach(entry => {
    const midpoint = getClipMidpoint(entry.clip);
    const semanticTokens = entry.semanticTokens || [];

    const existingFamily = families.find(family => {
      const overlap = countTokenOverlap(family.semanticTokens, semanticTokens);
      const proximity = Math.abs(family.anchorMidpoint - midpoint);
      const sameAudience = family.audienceProfileId === entry.audienceProfile.id;
      const sameNarrative = family.narrativeRoleId === entry.narrativeRole.id;

      return (
        overlap >= 2 ||
        (overlap >= 1 && sameAudience) ||
        (sameAudience && sameNarrative && proximity <= 24) ||
        (sameAudience && proximity <= 12)
      );
    });

    if (existingFamily) {
      existingFamily.members.push(entry);
      existingFamily.semanticTokens = [
        ...new Set([...existingFamily.semanticTokens, ...semanticTokens]),
      ];
      existingFamily.anchorMidpoint =
        (existingFamily.anchorMidpoint * (existingFamily.members.length - 1) + midpoint) /
        existingFamily.members.length;
      if (entry.score > existingFamily.score) {
        existingFamily.topEntry = entry;
        existingFamily.score = entry.score;
      }
      return;
    }

    families.push({
      id: `family-${families.length + 1}`,
      score: entry.score,
      topEntry: entry,
      members: [entry],
      semanticTokens: [...semanticTokens],
      anchorMidpoint: midpoint,
      audienceProfileId: entry.audienceProfile.id,
      audienceProfileLabel: entry.audienceProfile.label,
      narrativeRoleId: entry.narrativeRole.id,
      narrativeRoleLabel: entry.narrativeRole.label,
    });
  });

  return families
    .map(family => {
      const topEntry = family.topEntry;
      const leadToken = family.semanticTokens[0] || family.narrativeRoleLabel.toLowerCase();
      return {
        ...family,
        label: `${family.audienceProfileLabel} • ${family.narrativeRoleLabel}`,
        headline: `${family.narrativeRoleLabel} around ${leadToken}`,
        summary: topEntry.travelReason,
        clipIds: family.members.map(member => member.clip.id),
        members: family.members.sort(
          (left, right) =>
            right.score - left.score ||
            right.backendScore - left.backendScore ||
            left.index - right.index
        ),
      };
    })
    .sort((left, right) => right.score - left.score);
};

const pickCampaignEntry = (entries, preferredIds = [], excludedIds = new Set()) => {
  for (const id of preferredIds) {
    const match = entries.find(entry => entry.clip.id === id && !excludedIds.has(entry.clip.id));
    if (match) return match;
  }
  return entries.find(entry => !excludedIds.has(entry.clip.id)) || null;
};

const buildCampaignSet = (rankedEntries, families) => {
  if (!rankedEntries.length) return [];

  const usedClipIds = new Set();
  const bestOverall = rankedEntries[0];
  if (bestOverall) usedClipIds.add(bestOverall.clip.id);

  const proofCandidate = pickCampaignEntry(
    [...rankedEntries].sort(
      (left, right) =>
        right.scoreBreakdown.find(item => item.label === "Conversion")?.value -
          left.scoreBreakdown.find(item => item.label === "Conversion")?.value ||
        right.semanticArcScore - left.semanticArcScore
    ),
    [],
    usedClipIds
  );
  if (proofCandidate) usedClipIds.add(proofCandidate.clip.id);

  const replayCandidate = pickCampaignEntry(
    [...rankedEntries].sort(
      (left, right) =>
        right.scoreBreakdown.find(item => item.label === "Retention")?.value -
          left.scoreBreakdown.find(item => item.label === "Retention")?.value ||
        right.packagingPotential - left.packagingPotential
    ),
    families[1]?.clipIds || [],
    usedClipIds
  );
  if (replayCandidate) usedClipIds.add(replayCandidate.clip.id);

  return [
    bestOverall
      ? {
          id: "stop-scroll",
          label: "Stop Scroll",
          summary: "Lead with the moment most likely to earn the first pause.",
          entry: bestOverall,
        }
      : null,
    proofCandidate
      ? {
          id: "proof",
          label: "Proof Angle",
          summary: "Use the strongest explanatory or convincing version for trust.",
          entry: proofCandidate,
        }
      : null,
    replayCandidate
      ? {
          id: "replay",
          label: "Replay Angle",
          summary: "Use the most replayable or loop-friendly version for retention.",
          entry: replayCandidate,
        }
      : null,
  ].filter(Boolean);
};

const buildClipGuidance = clip => {
  const descriptorText = getClipDescriptorText(clip);
  const duration = getClipDurationSeconds(clip);
  const transcriptText = normalizePlainText(clip?.transcript || clip?.text || "");
  const transcriptWordCount = transcriptText
    ? transcriptText.split(/\s+/).filter(Boolean).length
    : 0;
  const backendScore = clampNumber(clip?.viralScore ?? clip?.viral_score ?? clip?.score, 0, 100, 0);

  const signals = {
    speech:
      transcriptWordCount >= 4 ||
      /(question|asks|says|voice|speaks|talks|explains|dialogue|quote|story|lesson|statement|answer)/i.test(
        descriptorText
      ),
    subject:
      /(face|speaker|person|host|reaction|close[- ]?up|portrait|eye contact|subject|center|centered|framed)/i.test(
        descriptorText
      ),
    motion:
      /(motion|movement|fast|scene|cut|switch|laugh|energy|action|impact|reveal|pace|pacing|dynamic|spike|transition|surprise)/i.test(
        descriptorText
      ),
    idealLength: duration >= 10 && duration <= 25,
    hook:
      /(\?|why|how|what|wait|watch|stop|secret|mistake|truth|never|before|after|until|confession|shocking|emotional|reveal)/i.test(
        descriptorText
      ) ||
      /!/.test(descriptorText) ||
      transcriptWordCount >= 8,
  };

  const narrativeRole = inferRuleMatch(NARRATIVE_ROLE_RULES, descriptorText, {
    id: signals.hook ? "hook" : signals.motion ? "reaction" : "proof",
    label: signals.hook ? "Hook" : signals.motion ? "Reaction" : "Proof",
  });
  const audienceProfile = inferRuleMatch(AUDIENCE_PROFILE_RULES, descriptorText, {
    id: signals.speech ? "education" : signals.motion ? "reaction" : "story",
    label: signals.speech ? "Education" : signals.motion ? "Reaction" : "Story",
  });
  const semanticTokens = getSemanticTokens(descriptorText);
  const familyAnchor = semanticTokens[0] || (signals.motion ? "energy" : "clarity");
  const momentFamilyKey = `${audienceProfile.id}:${narrativeRole.id}:${familyAnchor}`;
  const momentFamilyLabel = `${audienceProfile.label} • ${narrativeRole.label}`;

  const reasons = [];
  if (signals.speech) reasons.push("Strong speech or a spoken setup lands in the opening seconds");
  if (signals.subject)
    reasons.push("Clear face or centered subject gives viewers something to lock onto");
  if (signals.motion) reasons.push("Fast pacing or a scene change adds momentum early");
  if (signals.idealLength) reasons.push("Length sits in the 10-25 second sweet spot for shorts");
  if (signals.hook) reasons.push("The first beats carry curiosity or hook potential");

  const normalizedReason = normalizePlainText(clip?.reason || "");
  if (normalizedReason && reasons.length < 5) {
    reasons.push(normalizedReason);
  }
  if (clip?.strategyIntent && reasons.length < 5) {
    reasons.push(normalizePlainText(clip.strategyIntent));
  }

  while (reasons.length < 3) {
    reasons.push(
      reasons.length === 0
        ? "The moment is already isolated enough to move into editing quickly"
        : "The segment has clean timing boundaries for short-form packaging"
    );
  }

  const improvements = [];
  if (!signals.speech || !signals.hook) {
    improvements.push("Cut the first 2 seconds so the first spoken beat lands faster");
  }
  if (!signals.hook) {
    improvements.push("Add a bold hook to sharpen the opening promise");
  }
  if (!signals.speech) {
    improvements.push("Add captions so the opening still lands on mute");
  }
  if (!signals.subject) {
    improvements.push("Use zoom or smart crop to center the main subject");
  }
  if (!signals.motion) {
    improvements.push("Trim into a faster beat or start after the setup");
  }
  if (!signals.idealLength) {
    improvements.push(
      duration < 10
        ? "Extend the clip toward the payoff if a stronger ending is nearby"
        : "Trim the clip closer to the 10-25 second sweet spot"
    );
  }
  if (clip?.studioMove) {
    improvements.unshift(normalizePlainText(clip.studioMove));
  }

  const categories = CATEGORY_TAG_RULES.filter(rule => rule.pattern.test(descriptorText)).slice(
    0,
    3
  );
  if (categories.length === 0) {
    categories.push({
      label: signals.motion ? "High Energy" : "Educational",
      icon: signals.motion ? "🔥" : "🎓",
    });
  }

  const heuristicScore =
    (signals.speech ? 20 : 0) +
    (signals.subject ? 20 : 0) +
    (signals.motion ? 20 : 0) +
    (signals.idealLength ? 20 : 0) +
    (signals.hook ? 20 : 0);

  const captionReadiness = clampNumber(
    (transcriptWordCount >= 8 ? 42 : transcriptWordCount >= 4 ? 28 : 12) +
      (signals.speech ? 24 : 0) +
      (signals.hook ? 18 : 0) +
      (duration <= 32 ? 16 : 6),
    0,
    100,
    0
  );
  const thumbnailPotential = clampNumber(
    (signals.subject ? 34 : 14) +
      (signals.motion ? 14 : 0) +
      (signals.hook ? 22 : 0) +
      (/(shock|surprise|face|reaction|before|after|truth|secret|mistake|result)/i.test(
        descriptorText
      )
        ? 20
        : 8),
    0,
    100,
    0
  );
  const retentionPotential = clampNumber(
    (signals.hook ? 28 : 10) +
      (signals.motion ? 22 : 6) +
      (signals.idealLength ? 20 : duration < 8 ? 8 : 12) +
      (/(reveal|wait|until|next|watch|switch|flip|turning point|answer)/i.test(descriptorText)
        ? 18
        : 6),
    0,
    100,
    0
  );
  const conversionPotential = clampNumber(
    (signals.speech ? 26 : 10) +
      (/(tutorial|lesson|how|why|product|offer|sale|mistake|truth|secret|guide)/i.test(
        descriptorText
      )
        ? 34
        : 12) +
      (signals.subject ? 16 : 6) +
      (signals.idealLength ? 14 : 8),
    0,
    100,
    0
  );
  const semanticArcScore = clampNumber(
    (signals.hook ? 24 : 10) +
      (signals.speech ? 18 : 8) +
      (/(before|after|then|because|so|when|until|result|lesson|truth|secret|finally|instead)/i.test(
        descriptorText
      )
        ? 26
        : 8) +
      (narrativeRole.id === "payoff" ? 18 : narrativeRole.id === "proof" ? 14 : 10) +
      (audienceProfile.id === "performance" ? 12 : 8),
    0,
    100,
    0
  );
  const packagingPotential = Math.round(
    thumbnailPotential * 0.34 +
      captionReadiness * 0.24 +
      retentionPotential * 0.28 +
      conversionPotential * 0.14
  );
  const editorialScore = Math.round(
    heuristicScore * 0.34 +
      packagingPotential * 0.28 +
      semanticArcScore * 0.22 +
      backendScore * 0.16
  );
  const bestFor = [];
  if (clip?.bestFor) bestFor.push(`Best for ${clip.bestFor}`);
  if (retentionPotential >= 72) bestFor.push("Best for retention");
  if (thumbnailPotential >= 68) bestFor.push("Best for thumbnail-led packaging");
  if (conversionPotential >= 68) bestFor.push("Best for conversion");
  if (captionReadiness >= 68) bestFor.push("Best for caption-first cuts");
  if (!bestFor.length) bestFor.push("Best for balanced publishing");

  const openingMove = clip?.hookText
    ? `Open with "${normalizePlainText(clip.hookText)}" and make the first beat impossible to ignore.`
    : retentionPotential >= 74
      ? "Open on the strongest beat and hit it with a fast curiosity hook."
      : thumbnailPotential >= 72
        ? "Lead with the clearest face or object frame and let the visual promise carry the intro."
        : conversionPotential >= 70
          ? "Use a direct claim-and-proof opening instead of a vague teaser."
          : "Trim the setup and make the payoff arrive faster.";
  const exportFit =
    retentionPotential >= 74
      ? "Shorts and Reels"
      : conversionPotential >= 70
        ? "YouTube and conversion-led clips"
        : "Cross-platform short form";
  const travelReason = buildTravelReason(narrativeRole, audienceProfile, signals);
  const recutVariants = buildRecutVariants(clip, {
    signals,
    duration,
    narrativeRole,
    audienceProfile,
  });

  return {
    descriptorText,
    duration,
    backendScore,
    score: clampNumber(editorialScore, 0, 100, 0),
    heuristicScore,
    semanticArcScore,
    packagingPotential,
    reasons: reasons.slice(0, 5),
    improvements: [...new Set(improvements)].slice(0, 3),
    categories,
    signals,
    narrativeRole,
    audienceProfile,
    semanticTokens,
    momentFamilyKey,
    momentFamilyLabel,
    travelReason,
    bestFor: bestFor.slice(0, 2),
    exportFit,
    openingMove,
    recutVariants,
    scoreBreakdown: [
      {
        label: "Hook",
        value: clampNumber(
          Number(clip?.scoreBreakdown?.hook) ||
            Math.round((signals.hook ? 70 : 34) + retentionPotential * 0.3),
          0,
          100,
          0
        ),
      },
      { label: "Retention", value: retentionPotential },
      { label: "Thumbnail", value: thumbnailPotential },
      {
        label: "Captions",
        value: clampNumber(Number(clip?.scoreBreakdown?.speech) || captionReadiness, 0, 100, 0),
      },
      { label: "Conversion", value: conversionPotential },
      { label: "Story", value: semanticArcScore },
    ],
    hookText: clip?.hookText || getHookCopySuggestions(clip)[0] || DEFAULT_HOOK_TEXT,
    strategyLabel: clip?.strategyLabel || null,
    campaignRole: clip?.campaignRole || null,
  };
};

const isGenericHookText = value => GENERIC_HOOK_TEXTS.has(normalizeHookText(value).toUpperCase());

const formatPreviewTimePrecise = value => {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(totalSeconds >= 10 ? 1 : 2).padStart(4, "0");
  return `${minutes}:${seconds}`;
};

const formatEditorDuration = value => {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondsLabel = seconds.toFixed(seconds % 1 ? 1 : 0).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secondsLabel}`
    : `${minutes}:${secondsLabel}`;
};

const parseEditorDuration = value => {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  if (raw.includes(":")) {
    const parts = raw.split(":").map(Number);
    if (parts.some(part => !Number.isFinite(part) || part < 0) || parts.length > 3) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  const unitPattern = /(\d+(?:\.\d+)?)\s*(hrs|hr|h|mins|min|m|secs|sec|s)/g;
  const unitMatches = [...raw.matchAll(unitPattern)];
  if (unitMatches.length) {
    const remaining = raw.replace(unitPattern, "").trim();
    if (remaining) return null;
    return unitMatches.reduce((total, match) => {
      const amount = Number(match[1]);
      const unit = match[2];
      if (unit.startsWith("h")) return total + amount * 3600;
      if (unit.startsWith("m")) return total + amount * 60;
      return total + amount;
    }, 0);
  }

  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const normalizeBRollEndBehavior = value =>
  ["return", "loop", "hold"].includes(String(value || "").toLowerCase())
    ? String(value).toLowerCase()
    : "return";

const getOverlayAvailableSourceDuration = overlay => {
  if (!overlay || overlay.type !== "video") return Number.POSITIVE_INFINITY;
  const sourceDuration = Math.max(0, Number(overlay.sourceDuration || 0));
  if (!sourceDuration) return Number.POSITIVE_INFINITY;
  const sourceStart = clampNumber(
    overlay.sourceStartTime,
    0,
    Math.max(0, sourceDuration - 0.05),
    0
  );
  return Math.max(0.05, sourceDuration - sourceStart);
};

const getOverlayVisibleDuration = overlay => {
  const configuredDuration = Math.max(0, Number(overlay?.duration || 0));
  if (!overlay || overlay.type !== "video") return configuredDuration;
  if (normalizeBRollEndBehavior(overlay.sourceEndBehavior) !== "return") {
    return configuredDuration;
  }
  return Math.min(configuredDuration, getOverlayAvailableSourceDuration(overlay));
};

const getOverlayAudibleDuration = overlay => {
  const configuredDuration = Math.max(0, Number(overlay?.duration || 0));
  if (!overlay || overlay.type !== "video") return configuredDuration;
  if (normalizeBRollEndBehavior(overlay.sourceEndBehavior) === "loop") {
    return configuredDuration;
  }
  return Math.min(configuredDuration, getOverlayAvailableSourceDuration(overlay));
};

const waitForVideoEvent = (video, successEvent, failureEvent = "error") =>
  new Promise((resolve, reject) => {
    const handleSuccess = () => {
      video.removeEventListener(successEvent, handleSuccess);
      video.removeEventListener(failureEvent, handleFailure);
      resolve();
    };

    const handleFailure = () => {
      video.removeEventListener(successEvent, handleSuccess);
      video.removeEventListener(failureEvent, handleFailure);
      reject(new Error("Video analysis could not read the selected clip."));
    };

    video.addEventListener(successEvent, handleSuccess, { once: true });
    video.addEventListener(failureEvent, handleFailure, { once: true });
  });

const seekAnalysisVideo = async (video, targetTime) => {
  const boundedTime = Math.max(0, Number(targetTime) || 0);

  if (Math.abs((video.currentTime || 0) - boundedTime) < 0.025) {
    return;
  }

  await new Promise((resolve, reject) => {
    const handleSeeked = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      resolve();
    };

    const handleError = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      reject(new Error("Video analysis could not seek to the requested moment."));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = boundedTime;
  });
};

const captureHookAnalysisFrame = (context, video, width, height, previousFrame) => {
  context.drawImage(video, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height).data;
  const grayscale = new Uint8Array(width * height);

  const centerStartX = Math.floor(width * 0.25);
  const centerEndX = Math.ceil(width * 0.75);
  const centerStartY = Math.floor(height * 0.18);
  const centerEndY = Math.ceil(height * 0.82);

  let luminanceTotal = 0;
  let luminanceSquareTotal = 0;
  let frameDeltaTotal = 0;
  let centerDeltaTotal = 0;
  let centerPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const dataIndex = pixelIndex * 4;
      const luminance =
        (imageData[dataIndex] * 77 +
          imageData[dataIndex + 1] * 150 +
          imageData[dataIndex + 2] * 29) >>
        8;

      grayscale[pixelIndex] = luminance;
      luminanceTotal += luminance;
      luminanceSquareTotal += luminance * luminance;

      if (previousFrame) {
        const delta = Math.abs(luminance - previousFrame[pixelIndex]);
        frameDeltaTotal += delta;

        if (x >= centerStartX && x <= centerEndX && y >= centerStartY && y <= centerEndY) {
          centerDeltaTotal += delta;
          centerPixels += 1;
        }
      }
    }
  }

  const pixelCount = width * height;
  const averageLuminance = luminanceTotal / pixelCount;
  const variance = Math.max(
    0,
    luminanceSquareTotal / pixelCount - averageLuminance * averageLuminance
  );
  const contrast = Math.min(1, Math.sqrt(variance) / 72);
  const motion = previousFrame ? frameDeltaTotal / (pixelCount * 255) : 0;
  const centerMotion =
    previousFrame && centerPixels > 0 ? centerDeltaTotal / (centerPixels * 255) : motion;

  return {
    grayscale,
    brightness: averageLuminance / 255,
    contrast,
    motion,
    centerMotion,
  };
};

const buildFallbackHookRange = (clip, clipDuration = 0) => {
  const baseSuggestion = getHookSuggestion(clip);
  const template = getHookTemplateConfig(baseSuggestion.templateKey);
  const minimumDuration = Math.min(
    HOOK_MIN_SEGMENT_DURATION,
    Math.max(0.25, Number(clipDuration) || HOOK_MIN_SEGMENT_DURATION)
  );
  const maximumDuration = Math.min(
    HOOK_MAX_SEGMENT_DURATION,
    Math.max(minimumDuration, Number(clipDuration) || HOOK_MAX_SEGMENT_DURATION)
  );
  const boundedStart = clampNumber(
    baseSuggestion.suggestedStart,
    0,
    Math.max(0, Number(clipDuration || 0) - minimumDuration),
    0.7
  );
  const duration = clampNumber(template.duration, minimumDuration, maximumDuration, 3);
  const endTime =
    Number(clipDuration) > 0
      ? Math.min(Number(clipDuration), boundedStart + duration)
      : boundedStart + duration;

  return {
    ...baseSuggestion,
    startTime: boundedStart,
    endTime: Math.max(boundedStart + minimumDuration, endTime),
    duration: Math.max(minimumDuration, endTime - boundedStart),
    confidenceLabel: "Quick read",
    analysisSource: "metadata",
    score: 0,
  };
};

const getWatermarkPreviewRegions = mode => {
  switch (
    String(mode || "adaptive")
      .trim()
      .toLowerCase()
  ) {
    case "top_right":
      return [{ top: "4%", right: "4%", width: "24%", height: "8%", rotation: -2, opacity: 0.88 }];
    case "bottom_left":
      return [
        { bottom: "6%", left: "4%", width: "28%", height: "8%", rotation: 1.5, opacity: 0.9 },
      ];
    case "all":
      return [
        { top: "4%", left: "4%", width: "24%", height: "8%", rotation: 1, opacity: 0.84 },
        { top: "4%", right: "4%", width: "24%", height: "8%", rotation: -2, opacity: 0.88 },
        { bottom: "6%", left: "4%", width: "28%", height: "8%", rotation: 1.5, opacity: 0.9 },
        { bottom: "6%", right: "4%", width: "28%", height: "8%", rotation: -1.5, opacity: 0.86 },
      ];
    case "corners":
      return [
        { top: "4%", right: "4%", width: "24%", height: "8%", rotation: -2, opacity: 0.88 },
        { bottom: "6%", left: "4%", width: "28%", height: "8%", rotation: 1.5, opacity: 0.9 },
      ];
    case "adaptive":
    default:
      return [
        { top: "4%", right: "4%", width:…137084 tokens truncated…                    </button>
                      <button
                        type="button"
                        className={`mini-toggle-btn ${hookPreviewLoop ? "active" : ""}`}
                        onClick={() => previewHookSegment(!hookPreviewLoop)}
                      >
                        {hookPreviewLoop ? "Stop hook loop" : "Loop hook segment"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="ai-settings-card music-settings-card">
                <h5
                  style={{
                    ...sidebarSectionTitleStyle,
                    cursor: "pointer",
                    userSelect: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => toggleSection("musicAudio")}
                >
                  <span>🎵 Music &amp; Audio</span>
                  <span style={{ fontSize: "12px", opacity: 0.6 }}>
                    {collapsedSections.musicAudio ? "▶" : "▼"}
                  </span>
                </h5>
                {!collapsedSections.musicAudio && (
                  <>
                    {/* ── Original Audio ── */}
                    <label style={{ ...sidebarCheckboxLabelStyle, marginBottom: "6px" }}>
                      <input
                        type="checkbox"
                        checked={muteOriginalAudio}
                        onChange={e => setMuteOriginalAudio(e.target.checked)}
                        style={{ marginRight: "8px" }}
                      />
                      Mute Original Audio
                    </label>

                    {/* ── Background Music ── */}
                    <div
                      style={{
                        marginTop: "12px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        paddingTop: "10px",
                      }}
                    >
                      <label style={{ ...sidebarCheckboxLabelStyle, marginBottom: "4px" }}>
                        <input
                          type="checkbox"
                          checked={addMusic}
                          onChange={e => {
                            if (e.target.checked) {
                              if (!musicTrack) {
                                selectPresetMusic(MUSIC_PRESETS[0]);
                              } else {
                                setAddMusic(true);
                              }
                            } else {
                              setAddMusic(false);
                            }
                          }}
                          style={{ marginRight: "8px" }}
                        />
                        Background Music
                      </label>

                      {addMusic && (
                        <div style={{ marginTop: "8px", paddingLeft: "4px" }}>
                          {/* Current track info */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "6px 8px",
                              background: "rgba(16,185,129,0.1)",
                              borderRadius: "8px",
                              marginBottom: "8px",
                              fontSize: "0.75rem",
                              color: "#d1fae5",
                            }}
                          >
                            <span>🎵</span>
                            <span style={{ flex: 1, fontWeight: 600 }}>
                              {musicTrack?.name || musicSelection?.replace(".mp3", "") || "Custom"}
                            </span>
                            <button
                              type="button"
                              onClick={removeMusic}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#f87171",
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                padding: "0 4px",
                              }}
                              title="Remove music"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Music Library toggle */}
                          <button
                            type="button"
                            className="mini-toggle-btn"
                            onClick={() => setMusicLibraryOpen(!musicLibraryOpen)}
                            style={{ width: "100%", marginBottom: "6px", fontSize: "0.75rem" }}
                          >
                            {musicLibraryOpen ? "📁 Close Library" : "📁 Browse Music Library"}
                          </button>

                          {/* Preset Library */}
                          {musicLibraryOpen && (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "4px",
                                marginBottom: "8px",
                                maxHeight: "160px",
                                overflowY: "auto",
                                paddingRight: "2px",
                              }}
                            >
                              {MUSIC_PRESETS.map(preset => (
                                <button
                                  key={preset.file}
                                  type="button"
                                  className="mini-toggle-btn"
                                  onClick={() => selectPresetMusic(preset)}
                                  style={{
                                    fontSize: "0.65rem",
                                    padding: "5px 6px",
                                    textAlign: "left",
                                    background:
                                      musicSelection === preset.file
                                        ? "rgba(16,185,129,0.25)"
                                        : undefined,
                                  }}
                                >
                                  {preset.emoji} {preset.name}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Custom Upload */}
                          <input
                            ref={musicFileInputRef}
                            type="file"
                            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                            onChange={handleMusicFileUpload}
                            style={{ display: "none" }}
                          />
                          <button
                            type="button"
                            className="mini-toggle-btn"
                            onClick={() => musicFileInputRef.current?.click()}
                            style={{ width: "100%", marginBottom: "8px", fontSize: "0.75rem" }}
                          >
                            📤 Upload Custom Music
                          </button>

                          {/* Music Volume */}
                          <label className="studio-slider-label" style={{ marginBottom: "6px" }}>
                            <span>
                              🎚️ Music Vol: {Math.round((musicTrack?.volume ?? musicVolume) * 100)}%
                            </span>
                            <input
                              type="range"
                              min={1}
                              max={60}
                              step={1}
                              value={Math.round((musicTrack?.volume ?? musicVolume) * 100)}
                              onChange={e => {
                                const v = Number(e.target.value) / 100;
                                setMusicVolume(v);
                                if (musicTrack) setMusicTrackField("volume", v);
                              }}
                              style={{ width: "100%" }}
                            />
                          </label>

                          {/* Fade In/Out */}
                          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                            <label className="studio-slider-label" style={{ flex: 1 }}>
                              <span>↗ Fade In: {(musicTrack?.fadeIn ?? 0.5).toFixed(1)}s</span>
                              <input
                                type="range"
                                min={0}
                                max={3}
                                step={0.1}
                                value={musicTrack?.fadeIn ?? 0.5}
                                onChange={e => setMusicTrackField("fadeIn", Number(e.target.value))}
                                style={{ width: "100%" }}
                              />
                            </label>
                            <label className="studio-slider-label" style={{ flex: 1 }}>
                              <span>↘ Fade Out: {(musicTrack?.fadeOut ?? 0.5).toFixed(1)}s</span>
                              <input
                                type="range"
                                min={0}
                                max={3}
                                step={0.1}
                                value={musicTrack?.fadeOut ?? 0.5}
                                onChange={e =>
                                  setMusicTrackField("fadeOut", Number(e.target.value))
                                }
                                style={{ width: "100%" }}
                              />
                            </label>
                          </div>

                          {/* Loop */}
                          <label
                            style={{
                              ...sidebarCheckboxLabelStyle,
                              marginBottom: "6px",
                              fontSize: "0.75rem",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={musicTrack?.loop ?? true}
                              onChange={e => setMusicTrackField("loop", e.target.checked)}
                              style={{ marginRight: "6px" }}
                            />
                            🔁 Loop Music
                          </label>

                          {/* Ducking */}
                          <div
                            style={{
                              marginTop: "8px",
                              borderTop: "1px solid rgba(255,255,255,0.08)",
                              paddingTop: "8px",
                            }}
                          >
                            <span
                              style={{ fontSize: "0.73rem", color: "#94a3b8", fontWeight: 700 }}
                            >
                              🔊 Auto-Ducking
                            </span>

                            <label
                              style={{
                                ...sidebarCheckboxLabelStyle,
                                marginTop: "4px",
                                fontSize: "0.75rem",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={musicTrack?.ducking ?? true}
                                onChange={e => setMusicTrackField("ducking", e.target.checked)}
                                style={{ marginRight: "6px" }}
                              />
                              Enable Ducking
                            </label>

                            {musicTrack?.ducking && (
                              <>
                                {/* Ducking Mode */}
                                <div style={{ display: "flex", gap: "4px", margin: "4px 0 6px 0" }}>
                                  {[
                                    { value: "speech", label: "🗣 Speech-Aware" },
                                    { value: "constant", label: "📏 Constant" },
                                  ].map(mode => (
                                    <button
                                      key={mode.value}
                                      type="button"
                                      className={`mini-toggle-btn ${(musicTrack?.duckingMode || "speech") === mode.value ? "active" : ""}`}
                                      onClick={() => setMusicTrackField("duckingMode", mode.value)}
                                      style={{ flex: 1, fontSize: "0.65rem", padding: "4px 6px" }}
                                    >
                                      {mode.label}
                                    </button>
                                  ))}
                                </div>

                                <label
                                  className="studio-slider-label"
                                  style={{ marginBottom: "4px" }}
                                >
                                  <span>
                                    Duck Strength:{" "}
                                    {Math.round((musicTrack?.duckingStrength ?? 0.4) * 100)}%
                                  </span>
                                  <input
                                    type="range"
                                    min={10}
                                    max={90}
                                    step={5}
                                    value={Math.round((musicTrack?.duckingStrength ?? 0.4) * 100)}
                                    onChange={e =>
                                      setMusicTrackField(
                                        "duckingStrength",
                                        Number(e.target.value) / 100
                                      )
                                    }
                                    style={{ width: "100%" }}
                                  />
                                </label>

                                <div
                                  style={{
                                    ...sidebarBodyTextStyle,
                                    fontSize: "0.65rem",
                                    marginTop: "2px",
                                  }}
                                >
                                  {musicTrack?.duckingMode === "speech"
                                    ? "Music lowers smoothly when speech is detected and rises during silence."
                                    : "Music stays at a constant reduced level throughout the clip."}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Original audio context */}
                    <div
                      style={{ ...sidebarBodyTextStyle, marginTop: "10px", fontSize: "0.68rem" }}
                    >
                      {muteOriginalAudio
                        ? "Only background music will be heard."
                        : addMusic
                          ? "Voice + music mixed with auto-ducking."
                          : "Only original audio — no background music."}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="studio-panel export-panel">
              <div className="panel-heading compact">
                <div>
                  <span className="panel-kicker">Publish</span>
                  <h4>Render and export</h4>
                </div>
              </div>
              <p className="panel-description">
                Final export uses the hook treatment and B-roll layers you approved in Studio.
              </p>
              {renderedOutputUrl ? (
                <div
                  className="rendered-output-ready"
                  role="status"
                  data-testid="rendered-output-ready"
                >
                  <div>
                    <strong>Rendered video ready</strong>
                    <span>The finished file is loaded in After above.</span>
                  </div>
                  <div className="rendered-output-actions">
                    <button type="button" onClick={onDownloadRendered}>
                      Download Rendered Clip
                    </button>
                    <button type="button" onClick={onUseRendered}>
                      Use in Publisher
                    </button>
                  </div>
                </div>
              ) : null}
              <div
                className="render-destination-row"
                role="radiogroup"
                aria-label="Export destination"
              >
                {[
                  { value: "general", label: "Download" },
                  { value: "tiktok", label: "TikTok" },
                  { value: "reels", label: "Reels" },
                  { value: "shorts", label: "Shorts" },
                ].map(destination => (
                  <button
                    key={destination.value}
                    type="button"
                    role="radio"
                    aria-checked={selectedExportDestination === destination.value}
                    className={selectedExportDestination === destination.value ? "is-active" : ""}
                    onClick={() => setSelectedExportDestination(destination.value)}
                    disabled={isExporting}
                  >
                    {destination.label}
                  </button>
                ))}
              </div>
              <button
                className="export-btn"
                onClick={() => void handleExportRender(selectedExportDestination)}
                disabled={isExporting}
              >
                {exportStatusLabel}
              </button>
              {isExporting && (
                <button
                  className="export-btn cancel-export-btn"
                  onClick={() => {
                    if (window.confirm("Cancel this render? You can retry after.")) {
                      onCancel();
                    }
                  }}
                  style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    marginTop: "8px",
                  }}
                >
                  ✕ Cancel Render
                </button>
              )}
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "#94a3b8",
                  margin: "6px 0 0 0",
                  textAlign: "center",
                }}
              >
                One render includes your hook, B-roll, audio rules, captions, and selected
                destination.
              </p>
            </section>

            {overlays.length > 0 && (
              <section className="studio-panel layer-panel">
                <h5 style={{ margin: "0 0 10px 0" }}>Clips in edit</h5>
                <p
                  style={{
                    fontSize: "12px",
                    color: "rgba(247, 248, 251, 0.68)",
                    margin: "0 0 8px 0",
                  }}
                >
                  Select a clip to adjust when it appears.
                </p>
                <div className="layer-list">
                  {[...overlays].reverse().map((overlay, reversedIndex) => {
                    const actualIndex = overlays.length - 1 - reversedIndex;
                    const isActive = activeOverlayId === overlay.id;
                    const isTimedLayer =
                      overlay.startTime !== undefined && overlay.duration !== undefined;
                    const isVideoBRoll = isTimedLayer && overlay.type === "video";
                    const overlayStart = Number(overlay.startTime || 0);
                    const overlayEnd = overlayStart + Number(overlay.duration || 0);
                    const overlayName =
                      overlay.file?.name ||
                      overlay.name ||
                      (overlay.type === "text"
                        ? overlay.text || "Text layer"
                        : `${overlay.type === "image" ? "Image" : "Video"} layer`);
                    const modeLabel = isVideoBRoll
                      ? "Cutaway"
                      : isTimedLayer
                        ? "Timed layer"
                        : "Free layer";
                    const label = isVideoBRoll
                      ? `B-roll: ${overlayName}`
                      : overlay.type === "text"
                        ? `Text: ${(overlay.text || "").slice(0, 16) || "Untitled"}`
                        : `${overlay.type === "image" ? "Image" : "Video"} Overlay`;
                    const detail = isTimedLayer
                      ? `${modeLabel} - ${overlayStart.toFixed(1)}s to ${overlayEnd.toFixed(1)}s`
                      : overlay.type === "text"
                        ? "Edit copy and position"
                        : "Edit size and position";

                    return (
                      <div
                        key={overlay.id}
                        onClick={() => setActiveOverlayId(overlay.id)}
                        draggable
                        onDragStart={() => setDraggedOverlayId(overlay.id)}
                        onDragEnd={() => setDraggedOverlayId(null)}
                        onDragOver={e => {
                          e.preventDefault();
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          if (draggedOverlayId === null || draggedOverlayId === overlay.id) return;
                          moveOverlayToIndex(draggedOverlayId, actualIndex);
                          setDraggedOverlayId(null);
                        }}
                        className={`layer-row ${isActive ? "active" : ""}`}
                        style={
                          draggedOverlayId === overlay.id
                            ? { borderStyle: "dashed", borderColor: "#e52e71" }
                            : undefined
                        }
                      >
                        <div className="layer-row-copy">
                          <span className="layer-row-label">{label}</span>
                          <span className="layer-row-detail">{detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeOverlay && (
              <section
                className={`studio-panel active-overlay-panel ${activeOverlayIsVideoBRoll ? "broll-layer-controls" : ""} ${activeOverlayIsFullscreenBRoll ? "fullscreen-broll-controls" : ""}`}
              >
                <div className="active-layer-header">
                  <div>
                    <span className="panel-kicker">
                      {activeOverlayIsVideoBRoll ? "B-roll" : "Selected layer"}
                    </span>
                    <h5>{activeOverlayIsVideoBRoll ? "Selected Clip" : "Layer Controls"}</h5>
                  </div>
                  <span className="layer-type-pill">
                    {activeOverlayIsVideoBRoll ? "Cutaway" : activeOverlay.type}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "rgba(247, 248, 251, 0.68)",
                    margin: "0 0 10px 0",
                  }}
                >
                  {activeOverlayIsVideoBRoll
                    ? "Choose when this uploaded clip appears in the preview."
                    : "Fine-tune the selected layer here. Arrow keys nudge it, and Shift nudges faster."}
                </p>
                {activeOverlayIsVideoBRoll && (
                  <div className="broll-layer-summary">
                    <div className="broll-layer-preview">
                      {activeOverlaySafeSrc ? (
                        <video
                          ref={element => {
                            applySafeMediaSource(element, activeOverlaySafeSrc);
                          }}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <span>Video</span>
                      )}
                    </div>
                    <div className="broll-layer-copy">
                      <strong title={activeOverlayDisplayName}>{activeOverlayDisplayName}</strong>
                      <span>
                        {activeOverlayStartTime.toFixed(1)}s to {activeOverlayEndTime.toFixed(1)}s
                      </span>
                      <div className="broll-layer-chip-row">
                        <span>Cutaway</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="slider-stack">
                  {/* ── B-Roll Time Range ── */}
                  {activeOverlayHasTiming && (
                    <>
                      <label
                        className="studio-slider-label"
                        style={{ fontWeight: 700, color: "#fbbf24" }}
                      >
                        <span>⏱ Start: {Number(activeOverlay.startTime).toFixed(1)}s</span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0, liveTimelineDuration - (activeOverlay.duration || 0.5))}
                          step={0.1}
                          value={activeOverlay.startTime}
                          onChange={e =>
                            updateOverlayTimeRange(
                              activeOverlay.id,
                              Number(e.target.value),
                              activeOverlay.duration
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </label>
                      <label
                        className="studio-slider-label"
                        style={{ fontWeight: 700, color: "#fbbf24" }}
                      >
                        <span>⏱ Duration: {Number(activeOverlay.duration).toFixed(1)}s</span>
                        <input
                          type="range"
                          min={0.3}
                          max={Math.max(0.5, liveTimelineDuration - (activeOverlay.startTime || 0))}
                          step={0.1}
                          value={activeOverlay.duration}
                          onChange={e =>
                            updateOverlayTimeRange(
                              activeOverlay.id,
                              activeOverlay.startTime,
                              Number(e.target.value)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </label>
                    </>
                  )}

                  {!activeOverlayIsFullscreenBRoll && (
                    <>
                      <label className="studio-slider-label">
                        <span>Left: {Math.round(activeOverlay.x || 0)}%</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={activeOverlay.x || 0}
                          onChange={e =>
                            updateOverlayPosition(
                              activeOverlay.id,
                              "x",
                              Number(e.target.value) - Number(activeOverlay.x || 0)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </label>
                      <label className="studio-slider-label">
                        <span>Top: {Math.round(activeOverlay.y || 0)}%</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={activeOverlay.y || 0}
                          onChange={e =>
                            updateOverlayPosition(
                              activeOverlay.id,
                              "y",
                              Number(e.target.value) - Number(activeOverlay.y || 0)
                            )
                          }
                          style={{ width: "100%" }}
                        />
                      </label>

                      {(activeOverlay.type === "video" || activeOverlay.type === "image") && (
                        <>
                          <label className="studio-slider-label">
                            <span>Width: {Math.round(activeOverlay.width || 0)}%</span>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              step={1}
                              value={activeOverlay.width || 35}
                              onChange={e =>
                                updateOverlaySize(
                                  activeOverlay.id,
                                  "width",
                                  Number(e.target.value) - Number(activeOverlay.width || 35)
                                )
                              }
                              style={{ width: "100%" }}
                            />
                          </label>
                          <label className="studio-slider-label">
                            <span>Height: {Math.round(activeOverlay.height || 0)}%</span>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              step={1}
                              value={activeOverlay.height || 35}
                              onChange={e =>
                                updateOverlaySize(
                                  activeOverlay.id,
                                  "height",
                                  Number(e.target.value) - Number(activeOverlay.height || 35)
                                )
                              }
                              style={{ width: "100%" }}
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}

                  {/* ── Opacity ── */}
                  {activeOverlayHasTiming && !activeOverlayIsVideoBRoll && (
                    <label className="studio-slider-label" style={{ marginTop: "8px" }}>
                      <span>🔅 Opacity: {Math.round((activeOverlay.opacity ?? 1) * 100)}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round((activeOverlay.opacity ?? 1) * 100)}
                        onChange={e =>
                          setOverlayOpacity(activeOverlay.id, Number(e.target.value) / 100)
                        }
                        style={{ width: "100%" }}
                      />
                    </label>
                  )}

                  {/* ── Animation ── */}
                  {activeOverlayHasTiming &&
                    !activeOverlayIsVideoBRoll &&
                    activeOverlay.animation && (
                      <div style={{ marginTop: "8px" }}>
                        <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
                          ✨ Animation
                        </span>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            marginTop: "4px",
                            flexWrap: "wrap",
                          }}
                        >
                          <select
                            value={activeOverlay.animation.enter || "fade"}
                            onChange={e =>
                              setOverlayAnimation(activeOverlay.id, "enter", e.target.value)
                            }
                            style={{
                              padding: "3px 6px",
                              borderRadius: "6px",
                              border: "1px solid #444",
                              background: "#1a1a2e",
                              color: "#fff",
                              fontSize: "11px",
                              flex: 1,
                            }}
                          >
                            <option value="none">No Enter</option>
                            <option value="fade">Fade In</option>
                            <option value="slideLeft">Slide ←</option>
                            <option value="slideRight">Slide →</option>
                            <option value="slideUp">Slide ↑</option>
                            <option value="slideDown">Slide ↓</option>
                            <option value="zoom">Zoom In</option>
                          </select>
                          <select
                            value={activeOverlay.animation.exit || "fade"}
                            onChange={e =>
                              setOverlayAnimation(activeOverlay.id, "exit", e.target.value)
                            }
                            style={{
                              padding: "3px 6px",
                              borderRadius: "6px",
                              border: "1px solid #444",
                              background: "#1a1a2e",
                              color: "#fff",
                              fontSize: "11px",
                              flex: 1,
                            }}
                          >
                            <option value="none">No Exit</option>
                            <option value="fade">Fade Out</option>
                            <option value="slideLeft">Slide ←</option>
                            <option value="slideRight">Slide →</option>
                            <option value="slideUp">Slide ↑</option>
                            <option value="slideDown">Slide ↓</option>
                            <option value="zoom">Zoom Out</option>
                          </select>
                        </div>
                      </div>
                    )}

                  {/* ── Audio Options ── */}
                  {activeOverlayHasTiming && activeOverlay.type === "video" && (
                    <div className="broll-control-group">
                      <span className="broll-control-label">Audio rules</span>
                      <label className="broll-check-label">
                        <input
                          type="checkbox"
                          checked={activeOverlay.muteMainAudio || false}
                          onChange={e =>
                            setOverlayAudioOption(
                              activeOverlay.id,
                              "muteMainAudio",
                              e.target.checked
                            )
                          }
                        />
                        Mute main audio during overlay
                      </label>
                      <label className="broll-check-label">
                        <input
                          type="checkbox"
                          checked={activeOverlay.useOverlayAudio || false}
                          onChange={e =>
                            setOverlayAudioOption(
                              activeOverlay.id,
                              "useOverlayAudio",
                              e.target.checked
                            )
                          }
                        />
                        Use overlay audio
                      </label>
                      {activeOverlay.useOverlayAudio && (
                        <>
                          <label className="broll-check-label">
                            <input
                              type="checkbox"
                              checked={activeOverlay.audioDucking || false}
                              onChange={e =>
                                setOverlayAudioOption(
                                  activeOverlay.id,
                                  "audioDucking",
                                  e.target.checked
                                )
                              }
                            />
                            Duck main audio
                          </label>
                          <label className="studio-slider-label" style={{ marginTop: "4px" }}>
                            <span>
                              Overlay Vol:{" "}
                              {Math.round((activeOverlay.overlayAudioVolume ?? 0.7) * 100)}%
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={Math.round((activeOverlay.overlayAudioVolume ?? 0.7) * 100)}
                              onChange={e =>
                                setOverlayAudioOption(
                                  activeOverlay.id,
                                  "overlayAudioVolume",
                                  Number(e.target.value) / 100
                                )
                              }
                              style={{ width: "100%" }}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: "10px" }}>
                    <button
                      type="button"
                      className="mini-toggle-btn layer-remove-btn"
                      onClick={() => {
                        deleteOverlay(activeOverlay.id);
                        setActiveOverlayId(null);
                      }}
                    >
                      Remove Layer
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViralClipStudio;
