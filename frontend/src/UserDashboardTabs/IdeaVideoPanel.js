import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";
import { saveVideoToLocal, getAllVideos, deleteVideo } from "../utils/indexedDB";
import "./IdeaVideoPanel.css";

const IdeaVideoPanel = ({ onPublish }) => {
  const [idea, setIdea] = useState("");
  const [scripts, setScripts] = useState([]); // [{text: "Scene 1..."}]
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Input, 2: Script Review, 3: Generatin
  const [finalVideo, setFinalVideo] = useState(null);
  const [savedVideos, setSavedVideos] = useState([]);

  useEffect(() => {
    loadSavedVideos();
  }, []);

  const loadSavedVideos = async () => {
    try {
      const videos = await getAllVideos();
      // Convert blobs to URLs
      const videosWithUrls = videos.map(v => ({
        ...v,
        url: URL.createObjectURL(v.blob),
      }));
      setSavedVideos(videosWithUrls.sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      console.error("Failed to load local videos", e);
    }
  };

  const handleDeleteLocal = async id => {
    if (window.confirm("Delete this video from your device?")) {
      await deleteVideo(id);
      loadSavedVideos();
      toast.success("Video deleted from device");
    }
  };

  const handlePublish = video => {
    if (!onPublish) {
      toast.error("Publishing not available yet.");
      return;
    }

    // Convert Blob to File to pass to Upload Form
    // We assume video.blob is set. If not, fetch it from url? (IndexedDB stores Blob directly)
    if (video.blob) {
      const fileName = (video.title || "generated-video").replace(/[^a-zA-Z0-9]/g, "-") + ".mp4";
      const file = new File([video.blob], fileName, { type: "video/mp4" });

      // Attach metadata directly to the file object for the Upload Form to consume
      file.suggestedTitle = video.title || "";
      // Use the stored description (which contains the script) or fall back
      file.suggestedDescription = video.description || `AI Generated Video about ${video.title}`;

      onPublish(file);
    } else {
      toast.error("Video file not found in storage.");
    }
  };

  const generateScript = async () => {
    if (!idea) return toast.error("Please enter an idea!");
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      // Mock script generation for now (or use your existing AI text endpoint)
      // In a real implementation, you'd call a /api/generate-script endpoint
      // Here we simulate a simple breakdown based on the user's prompt

      // SIMULATION: Splitting valuable keywords
      const rawScenes = [
        `Intro: Welcome to this video about ${idea}.`,
        `Concept: ${idea} is really fascinating because it changes lives.`,
        `Detail: Imagine achieving success with ${idea} every single day.`,
        `Outro: Thanks for watching, don't forget to subscribe!`,
      ];

      setScripts(rawScenes.map(s => ({ text: s, duration: null })));
      setStep(2);
      toast.success("Script generated!");
    } catch (e) {
      toast.error("Failed to generate script");
    } finally {
      setLoading(false);
    }
  };

  const handleScriptChange = (index, val) => {
    const newScripts = [...scripts];
    newScripts[index].text = val;
    setScripts(newScripts);
  };

  const addScene = () => setScripts([...scripts, { text: "New scene...", duration: null }]);
  const removeScene = i => setScripts(scripts.filter((_, idx) => idx !== i));

  const generateVideo = async () => {
    setLoading(true);
    const toastId = toast.loading("AI is crafting your video...(This may take ~2 mins)");

    try {
      const token = await auth.currentUser?.getIdToken();

      // 1. We need to find videos for each scene (Pexels)
      // We'll do this on the frontend or backend?
      // Let's do a quick search here to show the user "Searching assets..."
      // Better: Send the script to backend, let backend do Pexels + TTS + Stitch
      // We implemented /render-idea-video in Python, but we need a Node wrapper or call Python directly?
      // Usually we call Main Backend (Node) -> Python.
      // Let's assume we have a Node route /api/ai-video/generate that proxies to Python
      // Or call Python directly if URL is exposed (unlikely).

      // We need to implement the Node route in `mediaRoutes.js` or `videoRoutes.js`
      // Current assumption: We will create a direct request to the Media Service
      // via the main API proxy we're about to build.

      // Prepare payload
      // We need to fetch video URLs first?
      // The Python endpoint expects `video_url` in the scene object.
      // So we MUST search Pexels here or in Node.
      // Let's do it in step 2.5 (Asset matching) or let Node do it.
      // Let's let Node do it to keep Frontend light.

      const response = await fetch(`${API_BASE_URL}/api/ai-video/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic: idea,
          scenes: scripts.map(s => s.text),
          style: "cinematic",
        }),
      });

      if (!response.ok) throw new Error("Generation failed");

      // Stream the video blob directly (no cloud storage involved)
      const videoBlob = await response.blob();

      // Save to Local IndexedDB
      try {
        await saveVideoToLocal(videoBlob, idea, scripts.map(s => s.text).join(" "));
        loadSavedVideos();
        toast.success("Saved to your local library!");
      } catch (e) {
        console.error("Local save failed", e);
      }

      const videoUrl = URL.createObjectURL(videoBlob);
      setFinalVideo(videoUrl);
      setStep(3);
      toast.success("Video Ready!", { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("Video creation failed: " + e.message, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="idea-video-panel">
      <div className="iv-header">
        <h2>✨ Idea-to-Video AI</h2>
        <p>Turn text into viral videos with stock footage & voiceover (Free)</p>
      </div>

      {step === 1 && (
        <div className="iv-step-1">
          <textarea
            className="idea-input"
            placeholder="e.g. Top 10 reasons to visit Japan..."
            value={idea}
            onChange={e => setIdea(e.target.value)}
          />
          <button className="btn-primary" onClick={generateScript} disabled={loading}>
            {loading ? "Writing Script..." : "Generate Script 📝"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="iv-step-2">
          <h3>Review Script & Scenes</h3>
          <div className="script-list">
            {scripts.map((scene, idx) => (
              <div key={idx} className="script-item">
                <span className="scene-num">#{idx + 1}</span>
                <textarea
                  value={scene.text}
                  onChange={e => handleScriptChange(idx, e.target.value)}
                />
                <button className="btn-icon" onClick={() => removeScene(idx)}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
          <div className="iv-actions">
            <button className="btn-secondary" onClick={addScene}>
              + Add Scene
            </button>
            <div className="action-row">
              <button className="btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn-primary" onClick={generateVideo} disabled={loading}>
                {loading ? "Rendering (this takes time)..." : "🎬 Generate Video"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && finalVideo && (
        <div className="iv-step-3">
          <h3>🎉 Your Video is Ready!</h3>
          <video src={finalVideo} controls className="final-video-preview" />
          <div className="iv-actions">
            <button
              className="btn-primary"
              style={{ marginRight: "1rem" }}
              onClick={() => {
                if (savedVideos.length > 0) {
                  // The newest video is at index 0 because of sort order in loadSavedVideos
                  handlePublish(savedVideos[0]);
                } else {
                  toast.error("Please try publishing from the library below.");
                }
              }}
            >
              🚀 Publish Now
            </button>
            <a
              href={finalVideo}
              download="generated-video.mp4"
              className="btn-secondary"
              style={{ marginRight: "1rem" }}
            >
              ⬇️ Download
            </a>
            <button className="btn-secondary" onClick={() => setStep(1)}>
              New Video
            </button>
          </div>
        </div>
      )}

      {/* Saved Videos Library */}
      {savedVideos.length > 0 && (
        <div
          className="iv-library"
          style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}
        >
          <h3>
            📚 Your Local Library{" "}
            <span style={{ fontSize: "0.8rem", fontWeight: "normal", color: "#666" }}>
              (Saved on this device)
            </span>
          </h3>
          <p style={{ fontSize: "0.85rem", color: "#888", marginBottom: "1rem" }}>
            ⚠️ Videos are stored in your browser.{" "}
            <span style={{ fontWeight: "bold" }}>Download them</span> to keep them permanently or
            share them!
          </p>
          <div
            className="video-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: "1rem",
            }}
          >
            {savedVideos.map(v => (
              <div
                key={v.id}
                className="video-card"
                style={{ background: "#f8f9fa", padding: "0.5rem", borderRadius: "8px" }}
              >
                <video src={v.url} controls style={{ width: "100%", borderRadius: "4px" }} />
                <div
                  className="video-meta"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.9rem", fontWeight: "bold" }}>{v.title}</span>
                  <div>
                    <button
                      onClick={() => handlePublish(v)}
                      style={{
                        background: "#0d6efd",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        padding: "0.25rem 0.5rem",
                        marginRight: "0.5rem",
                        fontSize: "0.85rem",
                      }}
                      title="Publish to Social Media"
                    >
                      🚀 Publish
                    </button>
                    <button
                      onClick={() => handleDeleteLocal(v.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "1.2rem",
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#666" }}>
                  {new Date(v.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default IdeaVideoPanel;
