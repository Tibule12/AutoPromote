import React, { useState } from "react";
import "./TikTokShareModal.css";

const TIKTOK_BRANDED_POLICY_URL = "https://www.tiktok.com/community-guidelines/en/branded-content/";
const TIKTOK_MUSIC_POLICY_URL = "https://www.tiktok.com/legal/music-usage-policy";

export default function TikTokShareModal({ videoSrc, onPublish, onCancel }) {
  const [disclosureEnabled, setDisclosureEnabled] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [privacy, setPrivacy] = useState("public"); // 'public', 'friends', 'private'
  const [showBrandTooltip, setShowBrandTooltip] = useState(false);
  const [showBrandedTooltip, setShowBrandedTooltip] = useState(false);
  const [showPrivateTooltip, setShowPrivateTooltip] = useState(false);
  const [title, setTitle] = useState("");
  const [hashtags, setHashtags] = useState("");

  // Disable Branded Content if privacy is private
  const brandedDisabled = privacy === "private";
  // Disable Private if Branded Content is checked
  const privateDisabled = disclosureEnabled && brandedContent;

  // Declaration text logic
  let declaration = "";
  if (disclosureEnabled) {
    if (yourBrand && !brandedContent) {
      declaration = "By posting, you agree to TikTok&apos;s Music Usage Confirmation.";
    } else if (brandedContent) {
      declaration =
        "By posting, you agree to TikTok&apos;s Branded Content Policy and Music Usage Confirmation.";
    }
  }

  // Prompt logic
  let prompt = "";
  if (disclosureEnabled) {
    if (yourBrand && brandedContent) {
      prompt = "Your photo/video will be labeled as &apos;Paid partnership&apos;";
    } else if (brandedContent) {
      prompt = "Your photo/video will be labeled as &apos;Paid partnership&apos;";
    } else if (yourBrand) {
      prompt = "Your photo/video will be labeled as &apos;Promotional content&apos;";
    }
  }

  // Publish button enable logic
  const canPublish = !disclosureEnabled || (disclosureEnabled && (yourBrand || brandedContent));

  // Tooltip for disclosure checkboxes
  const showDisclosureTooltip = disclosureEnabled && !yourBrand && !brandedContent;

  // Tooltip for private option
  const privateTooltip = brandedContent
    ? "Branded content visibility cannot be set to private."
    : "";

  // Handle publish
  function handlePublish() {
    if (!canPublish) return;
    onPublish({
      privacy,
      contentDisclosure: {
        enabled: disclosureEnabled,
        yourBrand,
        brandedContent,
      },
      title,
      hashtags,
    });
  }

  return (
    <div className="tiktok-share-modal">
      <h2>Share to TikTok</h2>
      <div className="preview-section">
        <video src={videoSrc} controls width="320" />
      </div>
      <div className="edit-section">
        <label>
          Title (editable):
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={150} />
        </label>
        <label>
          Hashtags (editable):
          <input
            value={hashtags}
            onChange={e => setHashtags(e.target.value)}
            placeholder="#fun #viral"
          />
        </label>
      </div>
      <div className="disclosure-section">
        <label>
          <input
            type="checkbox"
            checked={disclosureEnabled}
            onChange={e => setDisclosureEnabled(e.target.checked)}
          />
          This post promotes a brand, product, or service (Commercial Content)
        </label>
        {disclosureEnabled && (
          <div className="disclosure-options">
            <label
              onMouseEnter={() => setShowBrandTooltip(true)}
              onMouseLeave={() => setShowBrandTooltip(false)}
            >
              <input
                type="checkbox"
                checked={yourBrand}
                onChange={e => setYourBrand(e.target.checked)}
              />
              Your Brand
              {showBrandTooltip && (
                <span className="tooltip">
                  You are promoting yourself or your own business. This content will be classified
                  as Brand Organic.
                </span>
              )}
            </label>
            <label
              onMouseEnter={() => setShowBrandedTooltip(true)}
              onMouseLeave={() => setShowBrandedTooltip(false)}
            >
              <input
                type="checkbox"
                checked={brandedContent}
                onChange={e => setBrandedContent(e.target.checked)}
                disabled={brandedDisabled}
              />
              Branded Content
              {showBrandedTooltip && (
                <span className="tooltip">
                  You are promoting another brand or a third party. This content will be classified
                  as Branded Content.
                </span>
              )}
              {brandedDisabled && (
                <span className="tooltip">Branded content cannot be set to private.</span>
              )}
            </label>
            {showDisclosureTooltip && (
              <span className="tooltip">
                You need to indicate if your content promotes yourself, a third party, or both.
              </span>
            )}
          </div>
        )}
        {prompt && <div className="prompt">{prompt}</div>}
      </div>
      <div className="privacy-section">
        <label>Visibility:</label>
        <label>
          <input
            type="radio"
            name="privacy"
            value="public"
            checked={privacy === "public"}
            onChange={() => setPrivacy("public")}
          />
          Public
        </label>
        <label>
          <input
            type="radio"
            name="privacy"
            value="friends"
            checked={privacy === "friends"}
            onChange={() => setPrivacy("friends")}
          />
          Friends
        </label>
        <label
          onMouseEnter={() => setShowPrivateTooltip(true)}
          onMouseLeave={() => setShowPrivateTooltip(false)}
        >
          <input
            type="radio"
            name="privacy"
            value="private"
            checked={privacy === "private"}
            onChange={() => setPrivacy("private")}
            disabled={privateDisabled}
          />
          Only Me (Private)
          {privateDisabled && showPrivateTooltip && (
            <span className="tooltip">{privateTooltip}</span>
          )}
        </label>
      </div>
      <div className="declaration-section">
        {declaration && (
          <div>
            {declaration.includes("Branded Content Policy") ? (
              <>
                By posting, you agree to{" "}
                <a href={TIKTOK_BRANDED_POLICY_URL} target="_blank" rel="noopener noreferrer">
                  TikTok&apos;s Branded Content Policy
                </a>{" "}
                and{" "}
                <a href={TIKTOK_MUSIC_POLICY_URL} target="_blank" rel="noopener noreferrer">
                  Music Usage Confirmation
                </a>
                .
              </>
            ) : (
              <>
                By posting, you agree to{" "}
                <a href={TIKTOK_MUSIC_POLICY_URL} target="_blank" rel="noopener noreferrer">
                  TikTok&apos;s Music Usage Confirmation
                </a>
                .
              </>
            )}
          </div>
        )}
      </div>
      <div className="notice-section">
        <small>
          Note: After publishing, it may take a few minutes for your content to process and be
          visible on your TikTok profile.
        </small>
      </div>
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={handlePublish} disabled={!canPublish}>
          Publish
        </button>
      </div>
    </div>
  );
}
