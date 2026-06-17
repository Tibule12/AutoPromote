import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";
import { deleteVideo, getAllVideos, saveVideoToLocal } from "../utils/indexedDB";
import "./IdeaVideoPanel.css";

const STALE_SCRIPT_PATTERNS = [
  /here is the truth/i,
  /most people don't know this secret/i,
  /this changes everything/i,
  /follow for more/i,
  /did you know/i,
];

const VOICE_OPTIONS = [
  { value: "en-US-AriaNeural", label: "Aria - energetic" },
  { value: "en-US-JennyNeural", label: "Jenny - clean" },
  { value: "en-US-GuyNeural", label: "Guy - deep" },
];

const RENDER_COSTS = {
  preview: 5,
  fullBase: 25,
  fullPerScene: 8,
};

function cleanIdeaText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function hasSceneMetadata(scene = {}) {
  return Boolean(
    cleanIdeaText(scene.visual) || cleanIdeaText(scene.caption) || cleanIdeaText(scene.searchQuery)
  );
}

function isStaleTemplateDraft(scenes = [], idea = "", warning = "") {
  const joined = scenes.map(scene => scene.text || "").join(" ");
  const normalizedIdea = cleanIdeaText(idea).toLowerCase();
  const firstScene = cleanIdeaText(scenes[0]?.text || "").toLowerCase();
  const hasStalePhrase = STALE_SCRIPT_PATTERNS.some(pattern => pattern.test(joined));
  const repeatsPrompt =
    normalizedIdea.length > 40 && firstScene.includes(normalizedIdea.slice(0, 40));
  const missingCreativeFields = scenes.every(scene => !hasSceneMetadata(scene));

  return hasStalePhrase || repeatsPrompt || (warning && missingCreativeFields);
}

function summarizeIdea(idea = "") {
  const cleaned = cleanIdeaText(idea)
    .replace(/^make\s+(a\s+)?(\d+\s*second\s+)?video\s+(about|explaining|showing)\s*/i, "")
    .replace(/^create\s+(a\s+)?(\d+\s*second\s+)?video\s+(about|explaining|showing)\s*/i, "");

  if (/creator|copying trends|viral sounds|repeatable content formats?/i.test(cleaned)) {
    return "small creators building repeatable formats instead of chasing random viral sounds";
  }

  return cleaned || "the idea";
}

function buildCreatorSafeDraft(idea, style = "creator", targetSeconds = 30) {
  const subject = summarizeIdea(idea);
  const seconds = Number(targetSeconds) || 30;
  const directResponse = style === "direct_response";
  const cinematic = style === "cinematic";

  if (/small creators building repeatable formats/i.test(subject)) {
    return [
      {
        text: "Stop borrowing trends if nobody can tell the post came from you.",
        visual:
          "A creator scrolling through similar trend videos, then pausing on a blank content plan.",
        caption: "Trends are not a strategy",
        searchQuery: "creator scrolling social media planning content",
        duration: 3,
      },
      {
        text: "A format is the part people remember: the same promise, the same rhythm, a fresh example each time.",
        visual: "Simple notebook or whiteboard showing a repeated content framework.",
        caption: "Build a repeatable format",
        searchQuery: "content creator writing video ideas notebook",
        duration: seconds >= 45 ? 6 : 5,
      },
      {
        text: "The sound can change. The lighting can change. The reason people come back should not.",
        visual: "Quick cuts of filming setups changing while the same creator keeps presenting.",
        caption: "Make the return reason obvious",
        searchQuery: "creator filming short videos different setups",
        duration: seconds >= 45 ? 6 : 5,
      },
      {
        text: "Pick one container this week: one myth, one mistake, one fix, or one before-and-after.",
        visual: "Four sticky notes labeled myth, mistake, fix, before-after.",
        caption: "One container. Four posts.",
        searchQuery: "sticky notes content planning creator desk",
        duration: seconds >= 45 ? 6 : 5,
      },
      {
        text: "When the format works, the audience starts recognizing you before the algorithm decides anything.",
        visual: "Creator reviewing analytics or comments with a small confident smile.",
        caption: "Be recognizable first",
        searchQuery: "creator checking comments analytics phone",
        duration: 4,
      },
    ];
  }

  return [
    {
      text: directResponse
        ? `The fastest way to make ${subject} feel worth watching is to show the problem first.`
        : cinematic
          ? `There is a quiet reason ${subject} keeps pulling people in.`
          : `Start with the part of ${subject} people already feel but rarely say out loud.`,
      visual: cinematic
        ? "A slow, close opening shot that establishes the mood and subject."
        : "A tight opening shot that shows the problem or tension immediately.",
      caption: directResponse ? "Show the problem first" : "Start with the tension",
      searchQuery: subject,
      duration: 3,
    },
    {
      text: "Then make it specific: one mistake, one moment, or one detail the viewer can picture right away.",
      visual: "A clear close-up, comparison, or action shot that makes the idea concrete.",
      caption: "Make it specific",
      searchQuery: `${subject} detail close up`,
      duration: seconds >= 45 ? 6 : 5,
    },
    {
      text: "Give the payoff in plain language, like you are telling a friend what finally clicked.",
      visual: "A simple demonstration, before-and-after, or creator pointing to the key detail.",
      caption: "Here is the useful part",
      searchQuery: `${subject} example demonstration`,
      duration: seconds >= 45 ? 6 : 5,
    },
    {
      text: "End with one next step the viewer can actually try today.",
      visual: "Clean final frame with the result, checklist, or takeaway visible.",
      caption: "Try this today",
      searchQuery: `${subject} result`,
      duration: 4,
    },
  ];
}

function buildShotListText(idea, scenes = []) {
  const lines = ["Idea-to-Video Shot List", "", `Idea: ${cleanIdeaText(idea) || "Untitled"}`, ""];

  scenes.forEach((scene, index) => {
    lines.push(`Scene ${index + 1}`);
    lines.push(`Voiceover: ${cleanIdeaText(scene.text)}`);
    lines.push(`Visual: ${cleanIdeaText(scene.visual) || "Add visual direction"}`);
    lines.push(`Caption: ${cleanIdeaText(scene.caption) || "Add caption"}`);
    lines.push(`Asset search: ${cleanIdeaText(scene.searchQuery) || "Add search cue"}`);
    if (scene.duration) lines.push(`Duration: ${scene.duration}s`);
    lines.push("");
  });

  return lines.join("\n");
}

function estimateRenderCredits(sceneCount, renderMode) {
  if (renderMode === "preview") return RENDER_COSTS.preview;
  return Math.max(RENDER_COSTS.fullBase, Math.max(1, sceneCount) * RENDER_COSTS.fullPerScene);
}

function getRenderTargetSeconds(targetSeconds, renderMode) {
  const selectedSeconds = Number(targetSeconds) || 30;
  return renderMode === "preview" ? Math.min(10, selectedSeconds) : selectedSeconds;
}

const IdeaVideoPanel = ({ onPublish }) => {
  const [idea, setIdea] = useState("");
  const [scripts, setScripts] = useState([]); // [{text: "Scene 1..."}]
  const [scriptStyle, setScriptStyle] = useState("creator");
  const [targetSeconds, setTargetSeconds] = useState(30);
  const [renderVoice, setRenderVoice] = useState("en-US-AriaNeural");
  const [renderMode, setRenderMode] = useState("preview");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Input, 2: Scene review, 3: Rendered video
  const [finalVideo, setFinalVideo] = useState(null);
  const [finalVideoDownloadName, setFinalVideoDownloadName] = useState("generated-video.mp4");
  const [lastRenderedVideo, setLastRenderedVideo] = useState(null);
  const [savedVideos, setSavedVideos] = useState([]);

  useEffect(() => {
    loadSavedVideos();
  }, []);

  const loadSavedVideos = async () => {
    try {
      const videos = await getAllVideos();
      const videosWithUrls = videos.map(video => ({
        ...video,
        url: URL.createObjectURL(video.blob),
      }));
      setSavedVideos(videosWithUrls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (e) {
      console.error("Failed to load local videos", e);
    }
  };

  const generateScript = async () => {
    if (!idea) return toast.error("Please enter an idea!");
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      // Call backend AI Script Generator
      const res = await fetch(`${API_BASE_URL}/api/ai-video/script`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          idea,
          style: scriptStyle,
          targetSeconds,
          platform: "short_form",
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Script generation failed");

      if (data.scripts && Array.isArray(data.scripts)) {
        const draftedScripts = data.scripts.map(s => ({
          text: s.text || s.voiceover || s,
          visual: s.visual || "",
          caption: s.caption || "",
          searchQuery: s.searchQuery || "",
          duration: s.duration || null,
        }));

        const finalScripts = isStaleTemplateDraft(draftedScripts, idea, data.warning)
          ? buildCreatorSafeDraft(idea, scriptStyle, targetSeconds)
          : draftedScripts;

        setScripts(finalScripts);
        setStep(2);
        toast.success(
          finalScripts === draftedScripts
            ? "Creator script drafted."
            : "Rebuilt the stale template into creator scenes."
        );
      } else {
        throw new Error("Invalid script format received");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate script: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScriptChange = (index, val) => {
    const newScripts = [...scripts];
    newScripts[index].text = val;
    setScripts(newScripts);
  };

  const handleSceneFieldChange = (index, field, val) => {
    const newScripts = [...scripts];
    newScripts[index] = { ...newScripts[index], [field]: val };
    setScripts(newScripts);
  };

  const addScene = () =>
    setScripts([
      ...scripts,
      {
        text: "Say the next useful beat in plain language.",
        visual: "Describe what should be on screen.",
        caption: "",
        searchQuery: "",
        duration: null,
      },
    ]);
  const removeScene = i => setScripts(scripts.filter((_, idx) => idx !== i));

  const copyShotList = async () => {
    try {
      await navigator.clipboard.writeText(buildShotListText(idea, scripts));
      toast.success("Shot list copied.");
    } catch (e) {
      console.error(e);
      toast.error("Copy failed. Please select the scenes manually.");
    }
  };

  const downloadShotList = () => {
    const blob = new Blob([buildShotListText(idea, scripts)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      cleanIdeaText(idea)
        .slice(0, 48)
        .replace(/[^a-z0-9]+/gi, "-") || "idea-video"
    }-shot-list.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Shot list downloaded.");
  };

  const handleDeleteLocal = async id => {
    if (!window.confirm("Delete this video from your device?")) return;
    await deleteVideo(id);
    loadSavedVideos();
    toast.success("Video deleted from device.");
  };

  const handlePublish = video => {
    if (!onPublish) {
      toast.error("Publishing is not available here.");
      return;
    }

    if (!video?.blob) {
      toast.error("Video file not found.");
      return;
    }

    const mimeType = video.blob.type || "video/mp4";
    const extension = mimeType.includes("webm") ? "webm" : "mp4";
    const fileName =
      (video.title || "generated-video").replace(/[^a-zA-Z0-9]+/g, "-") + `.${extension}`;
    const file = new File([video.blob], fileName, { type: mimeType });
    file.suggestedTitle = video.title || idea || "";
    file.suggestedDescription = video.description || buildShotListText(idea, scripts);

    onPublish(file);
  };

  const generateVideo = async () => {
    if (!scripts.length) return toast.error("Draft scenes first.");

    const renderCreditCost = estimateRenderCredits(scripts.length, renderMode);
    const modeLabel = renderMode === "preview" ? "preview" : "full MP4";
    const confirmed = window.confirm(
      `Render this ${modeLabel} for ${renderCreditCost} credits? Drafting scenes and shot lists stay free.`
    );
    if (!confirmed) return;

    setLoading(true);
    const toastId = toast.loading(`Rendering ${modeLabel} with the Python worker...`);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/ai-video/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic: idea,
          scenes: scripts,
          voice: renderVoice,
          voiceRate: "+8%",
          renderMode,
          targetDuration: getRenderTargetSeconds(targetSeconds, renderMode),
        }),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        const errData = contentType.includes("application/json")
          ? await res.json()
          : { error: await res.text() };
        throw new Error(errData.error || "Video render failed");
      }

      const chargedCredits = res.headers.get("x-autopromote-credits-charged");
      const remainingCredits = res.headers.get("x-autopromote-credits-remaining");
      const videoBlob = await res.blob();
      if (!videoBlob.size) throw new Error("The renderer returned an empty video.");

      const renderedVideo = {
        title: idea || "Generated video",
        description: buildShotListText(idea, scripts),
        blob: videoBlob,
        createdAt: new Date(),
      };

      await saveVideoToLocal(videoBlob, renderedVideo.title, renderedVideo.description);
      await loadSavedVideos();

      const videoUrl = URL.createObjectURL(videoBlob);
      setFinalVideo(videoUrl);
      setFinalVideoDownloadName(
        `${
          cleanIdeaText(idea)
            .slice(0, 48)
            .replace(/[^a-z0-9]+/gi, "-") || "generated-video"
        }.mp4`
      );
      setLastRenderedVideo(renderedVideo);
      setStep(3);
      toast.success(
        remainingCredits
          ? `Professional video render ready. ${remainingCredits} credits left.`
          : `Professional video render ready.${chargedCredits ? ` ${chargedCredits} credits used.` : ""}`,
        { id: toastId }
      );
    } catch (e) {
      console.error(e);
      toast.error("Video render failed: " + e.message, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="idea-video-panel">
      <div className="iv-header">
        <h2>Idea-to-Video Studio</h2>
        <p>Draft creator-style scenes with voiceover, visuals, and captions.</p>
      </div>

      {step === 1 && (
        <div className="iv-step-1">
          <textarea
            className="idea-input"
            placeholder="Drop the real idea. Example: why small creators should stop copying trending sounds and build a repeatable format."
            value={idea}
            onChange={e => setIdea(e.target.value)}
          />
          <div className="script-controls">
            <label>
              Script direction
              <select value={scriptStyle} onChange={e => setScriptStyle(e.target.value)}>
                <option value="creator">Creator voice</option>
                <option value="story">Storytime</option>
                <option value="educational">Teach fast</option>
                <option value="cinematic">Cinematic mini-doc</option>
                <option value="direct_response">Sell without sounding salesy</option>
              </select>
            </label>
            <label>
              Length
              <select
                value={targetSeconds}
                onChange={e => setTargetSeconds(Number(e.target.value))}
              >
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </label>
            <label>
              Voice
              <select value={renderVoice} onChange={e => setRenderVoice(e.target.value)}>
                {VOICE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn-primary" onClick={generateScript} disabled={loading}>
            {loading ? "Writing..." : "Draft Scenes"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="iv-step-2">
          <h3>Review Scenes</h3>
          <div className="script-list">
            {scripts.map((scene, idx) => (
              <div key={idx} className="script-item">
                <div className="scene-head">
                  <span className="scene-num">Scene {idx + 1}</span>
                  <button
                    className="btn-icon"
                    onClick={() => removeScene(idx)}
                    aria-label="Remove scene"
                  >
                    Remove
                  </button>
                </div>
                <label>
                  Voiceover
                  <textarea
                    value={scene.text}
                    onChange={e => handleScriptChange(idx, e.target.value)}
                  />
                </label>
                <label>
                  Visual direction
                  <input
                    value={scene.visual || ""}
                    onChange={e => handleSceneFieldChange(idx, "visual", e.target.value)}
                    placeholder="What should be on screen?"
                  />
                </label>
                <div className="scene-grid">
                  <label>
                    Caption
                    <input
                      value={scene.caption || ""}
                      onChange={e => handleSceneFieldChange(idx, "caption", e.target.value)}
                      placeholder="Short on-screen text"
                    />
                  </label>
                  <label>
                    Asset search
                    <input
                      value={scene.searchQuery || ""}
                      onChange={e => handleSceneFieldChange(idx, "searchQuery", e.target.value)}
                      placeholder="Stock footage cue"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="render-controls">
            <label>
              Render mode
              <select value={renderMode} onChange={e => setRenderMode(e.target.value)}>
                <option value="preview">Preview - {RENDER_COSTS.preview} credits</option>
                <option value="full">
                  Full MP4 - {estimateRenderCredits(scripts.length, "full")} credits
                </option>
              </select>
            </label>
            <label>
              Render voice
              <select value={renderVoice} onChange={e => setRenderVoice(e.target.value)}>
                {VOICE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="iv-actions">
            <button className="btn-secondary" onClick={addScene}>
              + Add Scene
            </button>
            <div className="action-row">
              <button className="btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn-secondary" onClick={copyShotList}>
                Copy Shot List
              </button>
              <button className="btn-secondary" onClick={downloadShotList}>
                Download Shot List
              </button>
              <button className="btn-primary" onClick={generateVideo} disabled={loading}>
                {loading
                  ? "Rendering..."
                  : `Render ${renderMode === "preview" ? "Preview" : "Full Video"} (${estimateRenderCredits(
                      scripts.length,
                      renderMode
                    )} credits)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && finalVideo && (
        <div className="iv-step-3">
          <h3>Video Render Ready</h3>
          <video src={finalVideo} controls className="final-video-preview" />
          <div className="iv-actions">
            <button
              className="btn-primary"
              onClick={() => handlePublish(lastRenderedVideo)}
              disabled={!lastRenderedVideo}
            >
              Publish Now
            </button>
            <a href={finalVideo} download={finalVideoDownloadName} className="btn-secondary">
              Download MP4
            </a>
            <button className="btn-secondary" onClick={() => setStep(2)}>
              Back to Scenes
            </button>
            <button className="btn-secondary" onClick={() => setStep(1)}>
              New Video
            </button>
          </div>
        </div>
      )}

      {savedVideos.length > 0 && (
        <div className="iv-library">
          <h3>Rendered Videos</h3>
          <div className="video-grid">
            {savedVideos.map(video => (
              <div key={video.id} className="video-card">
                <video src={video.url} controls />
                <div className="video-meta">
                  <span>{video.title}</span>
                  <div className="video-card-actions">
                    <button onClick={() => handlePublish(video)}>Publish</button>
                    <button onClick={() => handleDeleteLocal(video.id)}>Delete</button>
                  </div>
                </div>
                <small>{new Date(video.createdAt).toLocaleDateString()}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default IdeaVideoPanel;
