import React, { useState } from "react";
import "./SmartFrameOverlay.css";

const SmartFrameOverlay = ({
  src,
  mediaType = "video",
  platform = "generic",
  showSafeZones = true,
  enableHighQuality = true,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  const getWrapperClass = () => {
    switch (platform) {
      case "tiktok":
        return "frame-tiktok";
      case "instagram":
        return "frame-instagram";
      case "youtube":
        return "frame-youtube-shorts"; // Assuming shorts for vertical preview flexibility
      default:
        return "frame-generic";
    }
  };

  return (
    <div className={`smart-frame-container ${getWrapperClass()}`}>
      {/* High Quality Badge - "Frame Intelligence" */}
      {enableHighQuality && (
        <div className="quality-badge" title="Frame Intelligence: High Quality Preview Mode">
          ✨ HQ SMART FRAME
        </div>
      )}

      {/* Media Content */}
      {mediaType === "video" ? (
        <video
          className="smart-content"
          src={src}
          controls={false} // Hide native controls to show overlays nicely
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={() => setIsLoaded(true)}
        />
      ) : (
        <img className="smart-content" src={src} alt="Preview" onLoad={() => setIsLoaded(true)} />
      )}

      {/* Platform UI Simulations (Safe Zones) */}
      {showSafeZones && platform === "tiktok" && (
        <div className="tiktok-ui-overlay">
          <div className="tiktok-sidebar">
            <div className="tiktok-icon"></div>
            <div className="tiktok-icon"></div>
            <div className="tiktok-icon"></div>
          </div>
          <div className="tiktok-bottom">
            <div className="tiktok-handle">@username</div>
            <div className="tiktok-desc-line"></div>
            <div className="tiktok-desc-line" style={{ width: "60%" }}></div>
          </div>
        </div>
      )}

      {showSafeZones && platform === "instagram" && (
        <div className="instagram-ui-overlay">
          <div className="insta-top">
            <div className="insta-icon" style={{ border: "none" }}></div> {/* Back */}
            <div className="insta-icon" style={{ border: "none", marginLeft: "auto" }}></div>{" "}
            {/* Cam */}
          </div>
          <div className="insta-actions">
            <div className="insta-icon"></div>
            <div className="insta-icon"></div>
            <div className="insta-icon"></div>
          </div>
          <div className="insta-bottom">
            <div style={{ color: "white", fontSize: "12px", fontWeight: "bold" }}>username</div>
            <div style={{ color: "white", fontSize: "12px" }}>Original Audio</div>
          </div>
        </div>
      )}

      {showSafeZones && platform === "youtube" && (
        <div className="yt-shorts-overlay">
          <div className="yt-buttons">
            <div className="yt-btn"></div>
            <div className="yt-btn"></div>
            <div className="yt-btn"></div>
          </div>
          <div style={{ position: "absolute", bottom: 20, left: 15, color: "white" }}>
            <div style={{ marginBottom: 5, fontWeight: "bold" }}>Channel Name</div>
            <div
              style={{
                width: 150,
                height: 10,
                background: "rgba(255,255,255,0.2)",
                borderRadius: 5,
              }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartFrameOverlay;
