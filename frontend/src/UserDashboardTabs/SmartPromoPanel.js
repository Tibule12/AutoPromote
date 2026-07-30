import React, { useEffect, useMemo, useState } from "react";
import SmartPromoSummaryPanel from "../components/SmartPromoSummaryPanel";
import { SafeVideo } from "../components/SafeMedia";
import { useSubscription } from "../hooks/useSubscription";
import { sanitizeUrl } from "../utils/security";

const resolveSourceUrl = source => {
  if (typeof source === "string") return sanitizeUrl(source);
  return source?.url ? sanitizeUrl(source.url) : "";
};

const createPromoPublishFile = clip => {
  const baseName = (clip?.promoCaption || clip?.title || "smart-promo-clip")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    name: `${baseName || "smart-promo-clip"}.mp4`,
    type: "video/mp4",
    url: clip.url,
    isRemote: true,
    suggestedTitle: clip.promoCaption || clip.title || "Smart Promo Clip",
    promoVisualAssets: clip.visualAssets || [],
    selectedPromoVisual: clip.selectedVisual || null,
    thumbnailUrl: clip.selectedThumbnailUrl || clip.selectedVisual?.url || null,
    workflowAction: "smart-promo",
  };
};

function SmartPromoPanel({ initialFile = null, onOpenPublisher, onUpgrade }) {
  const { credits, editing, canUseFeature } = useSubscription();
  const [sourceFile, setSourceFile] = useState(initialFile);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [studioOpen, setStudioOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setSourceFile(initialFile || null);
    setStudioOpen(false);
    setStatusMessage("");
  }, [initialFile]);

  useEffect(() => {
    if (!(sourceFile instanceof Blob)) {
      setLocalPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(sourceFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [sourceFile]);

  const previewUrl = localPreviewUrl || resolveSourceUrl(sourceFile);
  const sourceName = useMemo(
    () => sourceFile?.name || sourceFile?.fileName || "No source video selected",
    [sourceFile]
  );
  const promoCost = editing?.features?.smartPromoSummary?.creditCost || 18;

  if (studioOpen) {
    return (
      <SmartPromoSummaryPanel
        sourceFile={sourceFile}
        sourceUrl={previewUrl}
        creditBalance={credits?.remaining ?? null}
        creditCosts={{ "promo-summary": promoCost }}
        onClose={() => setStudioOpen(false)}
        onStatusChange={setStatusMessage}
        onUseClip={clip => {
          if (!clip?.url) return;
          setStudioOpen(false);
          onOpenPublisher?.(createPromoPublishFile(clip));
        }}
      />
    );
  }

  return (
    <section className="find-viral-clips-panel smart-promo-entry-panel">
      <div className="viral-clips-workspace">
        <article className="viral-source-card">
          <div className="viral-card-heading">
            <div>
              <span>Source video</span>
              <h3>Choose the recording to promote</h3>
            </div>
            <label className="btn-secondary viral-file-picker">
              Choose video
              <input
                type="file"
                accept="video/*"
                onChange={event => {
                  const [file] = Array.from(event.target.files || []);
                  if (!file) return;
                  setSourceFile(file);
                  setStatusMessage("");
                }}
              />
            </label>
          </div>

          <div className={`viral-source-preview ${previewUrl ? "has-video" : ""}`}>
            {previewUrl ? (
              <SafeVideo src={previewUrl} controls preload="metadata" />
            ) : (
              <div className="viral-source-empty">
                <span>✦</span>
                <strong>Drop in a finished video</strong>
                <small>Create a master edit, social previews, and promotional visuals</small>
              </div>
            )}
          </div>

          <div className="viral-source-meta">
            <span aria-hidden="true">▣</span>
            <div>
              <strong>{sourceName}</strong>
              <small>{sourceFile ? "Ready for Smart Promo" : "Select a source to begin"}</small>
            </div>
          </div>
        </article>

        <aside className="viral-settings-card">
          <div className="viral-card-heading">
            <div>
              <span>Smart Promo Studio</span>
              <h3>Build the promotional package</h3>
            </div>
          </div>
          <div className="viral-destination-field">
            <span>Output package</span>
            <div>
              <span>Master edit</span>
              <span>Social previews</span>
              <span>Visual assets</span>
            </div>
          </div>
          <button
            type="button"
            className="check-quality viral-analyse-button"
            disabled={!sourceFile}
            onClick={() => {
              if (!canUseFeature("smartPromoSummary")) {
                onUpgrade?.();
                return;
              }
              setStudioOpen(true);
            }}
          >
            ✦ Open Smart Promo Studio
          </button>
          <small className="viral-settings-note">
            Studio confirms the output package and credit cost before generation starts.
          </small>
          {statusMessage ? <small className="viral-settings-note">{statusMessage}</small> : null}
        </aside>
      </div>
    </section>
  );
}

export default SmartPromoPanel;
