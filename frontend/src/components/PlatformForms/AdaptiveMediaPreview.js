import React, { useState } from "react";
import { sanitizeUrl } from "../../utils/security";

const getFrameClass = aspectRatio => {
  if (!aspectRatio) return "adaptive-media-preview-shell is-loading";
  if (aspectRatio < 0.85) return "adaptive-media-preview-shell is-portrait";
  if (aspectRatio > 1.35) return "adaptive-media-preview-shell is-wide";
  return "adaptive-media-preview-shell is-square";
};

const AdaptiveMediaPreview = ({ src, mediaType = "video", label = "Media preview" }) => {
  const [aspectRatio, setAspectRatio] = useState(null);

  if (!src) return null;

  const safeSrc = sanitizeUrl(src);
  const isImage = mediaType === "image";
  const shellStyle = aspectRatio ? { "--media-preview-aspect": aspectRatio } : undefined;

  return (
    <div className="adaptive-media-preview" aria-label={label}>
      <div className={getFrameClass(aspectRatio)} style={shellStyle}>
        {isImage ? (
          <img
            src={safeSrc}
            alt={label}
            className="adaptive-media-preview-media"
            onLoad={event => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth && naturalHeight) setAspectRatio(naturalWidth / naturalHeight);
            }}
          />
        ) : (
          <video
            src={safeSrc}
            controls
            className="adaptive-media-preview-media"
            onLoadedMetadata={event => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth && videoHeight) setAspectRatio(videoWidth / videoHeight);
            }}
          />
        )}
      </div>
      <p className="adaptive-media-preview-note">
        Preview fits the full media frame. Platform cropping, if any, happens later only when the
        platform itself requires it.
      </p>
    </div>
  );
};

export default AdaptiveMediaPreview;
