import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
import toast from "react-hot-toast";

const AdsPanel = () => {
  const [activeTab, setActiveTab] = useState("platform"); // 'platform' or 'external'
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingAd, setCreatingAd] = useState(false);
  const [launchingAdId, setLaunchingAdId] = useState(null);
  const [confirmLaunch, setConfirmLaunch] = useState({ open: false, adId: null });

  // Ad creation form state
  const [adForm, setAdForm] = useState({
    type: "platform", // 'platform' or 'external'
    adType: "sponsored_content", // sponsored_content, banner, video, product
    title: "",
    description: "",
    imageUrl: "",
    videoUrl: "",
    targetUrl: "",
    callToAction: "Learn More",
    budget: 50,
    duration: 7, // days
    targeting: {
      platforms: [],
      demographics: {
        ageMin: 18,
        ageMax: 65,
        locations: [],
        interests: [],
      },
    },
    externalPlatform: "facebook", // facebook, instagram, google, youtube, tiktok, twitter, linkedin, snapchat, reddit, pinterest, spotify, discord, telegram
    status: "draft",
  });

  // Trigger ads load on tab change; `loadAds` intentionally omitted from deps
  /* mount-only effect (intentional) */
  // eslint-disable-next-line
  useEffect(() => {
    loadAds();
  }, [activeTab]);

  const loadAds = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const res = await fetch(`${API_ENDPOINTS.ADS}?type=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setAds(data.ads || []);
      }
    } catch (err) {
      console.error("Failed to load ads:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAd = async () => {
    if (creatingAd) return;
    setCreatingAd(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Please sign in to create ads");
        return;
      }

      if (!adForm.title || !adForm.description) {
        toast.error("Please fill in all required fields");
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch(API_ENDPOINTS.ADS, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(adForm),
      });

      if (res.ok) {
        await res.json();
        toast.success("Ad created successfully!");
        setShowCreateModal(false);
        resetAdForm();
        loadAds();
      } else {
        const error = await res.json();
        toast.error(error.message || "Failed to create ad");
      }
    } catch (err) {
      console.error("Error creating ad:", err);
      toast.error("Failed to create ad");
    } finally {
      setCreatingAd(false);
    }
  };
  // open confirmation modal first
  const handleLaunchAd = adId => {
    setConfirmLaunch({ open: true, adId });
  };

  const performLaunchAd = async () => {
    const adId = confirmLaunch.adId;
    if (!adId) return;
    if (launchingAdId) return;
    setLaunchingAdId(adId);
    const toastId = toast.loading("Launching ad...");
    try {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const res = await fetch(`${API_ENDPOINTS.ADS}/${adId}/launch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const parsed = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(parsed.message || "Ad launched successfully!", { id: toastId });
        loadAds();
      } else {
        toast.error(parsed.message || "Failed to launch ad", { id: toastId });
      }
    } catch (err) {
      console.error("Error launching ad:", err);
      toast.error("Failed to launch ad");
    } finally {
      setLaunchingAdId(null);
      setConfirmLaunch({ open: false, adId: null });
    }
  };

  const handlePauseAd = async adId => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const res = await fetch(`${API_ENDPOINTS.ADS}/${adId}/pause`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        toast.success("Ad paused");
        loadAds();
      }
    } catch (err) {
      console.error("Error pausing ad:", err);
      toast.error("Failed to pause ad");
    }
  };

  const resetAdForm = () => {
    setAdForm({
      type: activeTab === "platform" ? "platform" : "external",
      adType: "sponsored_content",
      title: "",
      description: "",
      imageUrl: "",
      videoUrl: "",
      targetUrl: "",
      callToAction: "Learn More",
      budget: 50,
      duration: 7,
      targeting: {
        platforms: [],
        demographics: {
          ageMin: 18,
          ageMax: 65,
          locations: [],
          interests: [],
        },
      },
      externalPlatform: "facebook",
      status: "draft",
    });
  };

  const formatCurrency = amount => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getAdStatusBadge = status => {
    const statusColors = {
      draft: "#6b7280",
      active: "#10b981",
      paused: "#f59e0b",
      completed: "#3b82f6",
      rejected: "#ef4444",
    };

    return (
      <span
        style={{
          backgroundColor: statusColors[status] || "#6b7280",
          color: "white",
          padding: "4px 12px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: "600",
          textTransform: "uppercase",
        }}
      >
        {status}
      </span>
    );
  };

  const getPlatformSpecs = platform => {
    // Platform-specific ad specifications
    const specs = {
      facebook: {
        name: "Facebook",
        imageSize: "1200x628px",
        videoSize: "1280x720px",
        textLimit: 125,
        headlineLimit: 40,
        formats: ["Feed", "Stories", "Marketplace"],
      },
      instagram: {
        name: "Instagram",
        imageSize: "1080x1080px",
        videoSize: "1080x1920px (Stories), 1080x1080px (Feed)",
        textLimit: 2200,
        headlineLimit: 30,
        formats: ["Feed", "Stories", "Reels", "Explore"],
      },
      youtube: {
        name: "YouTube",
        imageSize: "1280x720px",
        videoSize: "1920x1080px",
        textLimit: 5000,
        headlineLimit: 100,
        formats: ["In-Stream", "Discovery", "Bumper", "Shorts"],
      },
      tiktok: {
        name: "TikTok",
        imageSize: "1080x1920px",
        videoSize: "1080x1920px (9:16)",
        textLimit: 100,
        headlineLimit: 40,
        formats: ["In-Feed", "TopView", "Brand Takeover"],
      },
      twitter: {
        name: "Twitter/X",
        imageSize: "1200x675px",
        videoSize: "1280x720px",
        textLimit: 280,
        headlineLimit: 50,
        formats: ["Promoted Tweet", "Promoted Trend"],
      },
      linkedin: {
        name: "LinkedIn",
        imageSize: "1200x627px",
        videoSize: "1280x720px",
        textLimit: 600,
        headlineLimit: 70,
        formats: ["Sponsored Content", "Message Ads", "Dynamic Ads"],
      },
      snapchat: {
        name: "Snapchat",
        imageSize: "1080x1920px",
        videoSize: "1080x1920px (9:16)",
        textLimit: 180,
        headlineLimit: 34,
        formats: ["Snap Ads", "Story Ads", "Collection Ads"],
      },
      reddit: {
        name: "Reddit",
        imageSize: "1200x628px",
        videoSize: "1280x720px",
        textLimit: 300,
        headlineLimit: 300,
        formats: ["Promoted Posts", "Display Ads"],
      },
      pinterest: {
        name: "Pinterest",
        imageSize: "1000x1500px (2:3)",
        videoSize: "1000x1500px",
        textLimit: 500,
        headlineLimit: 100,
        formats: ["Standard Pins", "Carousel", "Shopping Ads"],
      },
      google: {
        name: "Google Ads",
        imageSize: "1200x628px",
        videoSize: "1920x1080px",
        textLimit: 90,
        headlineLimit: 30,
        formats: ["Search", "Display", "Video", "Shopping"],
      },
    };
    return specs[platform] || specs.facebook;
  };

  const handleDownloadAdPackage = ad => {
    const specs = getPlatformSpecs(ad.externalPlatform || "facebook");

    // Create ad package document
    const adPackage = {
      platform: specs.name,
      campaign: ad.title,
      description: ad.description,
      callToAction: ad.callToAction,
      targetUrl: ad.targetUrl,
      budget: `$${ad.budget}`,
      duration: `${ad.duration} days`,
      imageUrl: ad.imageUrl,
      videoUrl: ad.videoUrl,
      specifications: specs,
      targeting: ad.targeting,
      createdAt: new Date().toISOString(),
      suggestedHashtags: generateHashtags(ad.title, ad.description),
      platformInstructions: getPlatformInstructions(ad.externalPlatform || "facebook"),
    };

    // Convert to formatted text
    const content = `
═══════════════════════════════════════════════
  AutoPromote Ad Package - ${specs.name}
═══════════════════════════════════════════════

CAMPAIGN: ${ad.title}
PLATFORM: ${specs.name}
CREATED: ${new Date().toLocaleDateString()}

─── AD COPY ───
Headline: ${ad.title}
Description: ${ad.description}
Call to Action: ${ad.callToAction}
Landing Page: ${ad.targetUrl || "Not specified"}

─── CREATIVE ASSETS ───
Image URL: ${ad.imageUrl || "Not provided"}
Video URL: ${ad.videoUrl || "Not provided"}

─── BUDGET & SCHEDULE ───
Budget: $${ad.budget}
Duration: ${ad.duration} days
Suggested Daily Budget: $${(ad.budget / ad.duration).toFixed(2)}

─── PLATFORM SPECIFICATIONS ───
Recommended Image Size: ${specs.imageSize}
Recommended Video Size: ${specs.videoSize}
Text Character Limit: ${specs.textLimit}
Headline Character Limit: ${specs.headlineLimit}
Available Formats: ${specs.formats.join(", ")}

─── TARGETING OPTIONS ───
${ad.targeting.platforms?.length > 0 ? `Target Platforms: ${ad.targeting.platforms.join(", ")}` : "No platform targeting specified"}
Age Range: ${ad.targeting.demographics?.ageMin || 18}-${ad.targeting.demographics?.ageMax || 65}
${ad.targeting.demographics?.locations?.length > 0 ? `Locations: ${ad.targeting.demographics.locations.join(", ")}` : ""}
${ad.targeting.demographics?.interests?.length > 0 ? `Interests: ${ad.targeting.demographics.interests.join(", ")}` : ""}

─── SUGGESTED HASHTAGS ───
${adPackage.suggestedHashtags.join(" ")}

─── UPLOAD INSTRUCTIONS FOR ${specs.name.toUpperCase()} ───
${adPackage.platformInstructions}

═══════════════════════════════════════════════
Generated by AutoPromote - www.autopromote.org
═══════════════════════════════════════════════
`;

    // Create and download file
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autopromote-ad-${ad.id}-${specs.name.toLowerCase().replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Ad package downloaded for ${specs.name}!`);
  };

  const generateHashtags = (title, description) => {
    const text = `${title} ${description}`.toLowerCase();
    const hashtags = [];

    // Common marketing hashtags
    if (text.includes("music")) hashtags.push("#Music", "#NewMusic", "#MusicPromotion");
    if (text.includes("video")) hashtags.push("#Video", "#VideoMarketing", "#VideoContent");
    if (text.includes("product")) hashtags.push("#Product", "#Shopping", "#NewProduct");
    if (text.includes("business")) hashtags.push("#Business", "#Entrepreneur", "#SmallBusiness");
    if (text.includes("art")) hashtags.push("#Art", "#Artist", "#ArtistsOnSocial");

    // Add general hashtags
    hashtags.push("#Marketing", "#SocialMedia", "#DigitalMarketing", "#ContentCreator");

    return hashtags.slice(0, 10);
  };

  const getPlatformInstructions = platform => {
    const instructions = {
      facebook: `1. Go to Facebook Ads Manager (facebook.com/adsmanager)
2. Click "Create" to start a new campaign
3. Choose your objective (Traffic, Engagement, or Conversions)
4. Set your budget and schedule
5. Define your audience (use the targeting options above)
6. Upload your creative assets (image/video)
7. Copy and paste the ad copy from above
8. Set your landing page URL
9. Review and publish your ad`,

      instagram: `1. Use Facebook Ads Manager (instagram ads run through Facebook)
2. Select Instagram as placement when creating your ad
3. Choose format: Feed, Stories, or Reels
4. Upload creative in vertical format (1080x1920px for Stories/Reels)
5. Add your caption (copy from above)
6. Include relevant hashtags
7. Set your landing page URL
8. Preview and publish`,

      youtube: `1. Go to Google Ads (ads.google.com)
2. Create a new Video campaign
3. Choose your campaign goal
4. Upload your video to YouTube first
5. Select video ad format (In-Stream, Discovery, or Bumper)
6. Add headline and description
7. Set targeting options
8. Define budget and schedule
9. Launch campaign`,

      tiktok: `1. Go to TikTok Ads Manager (ads.tiktok.com)
2. Create a new campaign
3. Choose ad objective
4. Set up ad group with targeting
5. Upload video creative (9:16 vertical format)
6. Add ad text and call-to-action
7. Enter landing page URL
8. Set budget and schedule
9. Submit for review`,

      twitter: `1. Go to Twitter Ads (ads.twitter.com)
2. Choose campaign objective
3. Set targeting parameters
4. Upload creative (image or video)
5. Compose tweet text (280 character limit)
6. Add website card with URL
7. Set budget and duration
8. Launch campaign`,

      linkedin: `1. Go to LinkedIn Campaign Manager
2. Create a new campaign
3. Choose objective (Website Visits, Engagement, etc.)
4. Define your audience
5. Upload ad creative
6. Write introductory text and headline
7. Add destination URL
8. Set budget and schedule
9. Launch campaign`,

      snapchat: `1. Go to Snapchat Ads Manager
2. Create a new campaign
3. Select ad format (Snap Ad, Story Ad)
4. Upload vertical creative (9:16 format)
5. Add brand name and headline
6. Set call-to-action
7. Define targeting
8. Set budget
9. Submit for review`,

      reddit: `1. Go to Reddit Ads (ads.reddit.com)
2. Create a new campaign
3. Choose objective
4. Select subreddit targeting
5. Upload creative
6. Write post title and text
7. Add destination URL
8. Set budget and schedule
9. Launch campaign`,

      pinterest: `1. Go to Pinterest Ads Manager
2. Create a new campaign
3. Choose campaign objective
4. Upload Pin creative (2:3 aspect ratio)
5. Add Pin title and description
6. Set destination URL
7. Define targeting
8. Set budget
9. Publish campaign`,

      google: `1. Go to Google Ads (ads.google.com)
2. Create a new campaign
3. Choose campaign type (Search, Display, or Video)
4. Set campaign goal
5. Upload display ads or write search ads
6. Define keywords and targeting
7. Set landing page URL
8. Configure budget and bidding
9. Launch campaign`,
    };

    return instructions[platform] || instructions.facebook;
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h2
          style={{
            color: "#fff",
            marginBottom: "0.5rem",
            fontSize: "1.875rem",
            fontWeight: "bold",
          }}
        >
          Ad Campaign Manager
        </h2>
        <p style={{ color: "#9ca3af", fontSize: "1rem" }}>
          Create and manage ads on AutoPromote or external platforms
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "2rem",
          borderBottom: "2px solid rgba(255,255,255,0.1)",
        }}
      >
        <button
          onClick={() => {
            setActiveTab("platform");
            resetAdForm();
          }}
          style={{
            padding: "0.75rem 1.5rem",
            background: "transparent",
            border: "none",
            color: activeTab === "platform" ? "#3b82f6" : "#9ca3af",
            fontSize: "1rem",
            fontWeight: "600",
            cursor: "pointer",
            borderBottom: activeTab === "platform" ? "3px solid #3b82f6" : "3px solid transparent",
            transition: "all 0.2s",
          }}
        >
          AutoPromote Ads
        </button>
        <button
          onClick={() => {
            setActiveTab("external");
            resetAdForm();
          }}
          style={{
            padding: "0.75rem 1.5rem",
            background: "transparent",
            border: "none",
            color: activeTab === "external" ? "#3b82f6" : "#9ca3af",
            fontSize: "1rem",
            fontWeight: "600",
            cursor: "pointer",
            borderBottom: activeTab === "external" ? "3px solid #3b82f6" : "3px solid transparent",
            transition: "all 0.2s",
          }}
        >
          External Platform Ads
        </button>
      </div>

      {/* Create Ad Button */}
      <div style={{ marginBottom: "2rem" }}>
        <button
          onClick={() => {
            setAdForm({ ...adForm, type: activeTab });
            setShowCreateModal(true);
          }}
          style={{
            padding: "0.75rem 1.5rem",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontSize: "1rem",
            fontWeight: "600",
            cursor: "pointer",
            transition: "transform 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
        >
          + Create New Ad
        </button>
      </div>

      {/* Ads List */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "3rem" }}>Loading ads...</div>
      ) : ads.length === 0 ? (
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            borderRadius: "12px",
            padding: "3rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📢</div>
          <h3 style={{ color: "#fff", marginBottom: "0.5rem" }}>No ads yet</h3>
          <p style={{ color: "#9ca3af" }}>
            {activeTab === "platform"
              ? "Create your first ad to promote on AutoPromote"
              : "Create your first external platform ad campaign"}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {ads.map(ad => (
            <div
              key={ad.id}
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: "12px",
                padding: "1.5rem",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <h3 style={{ color: "#fff", fontSize: "1.25rem", margin: 0 }}>{ad.title}</h3>
                    {getAdStatusBadge(ad.status)}
                  </div>
                  <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>{ad.description}</p>
                  {ad.type === "external" && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <span
                        style={{
                          background: "rgba(59, 130, 246, 0.2)",
                          color: "#60a5fa",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "600",
                        }}
                      >
                        {ad.externalPlatform?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {ad.imageUrl && (
                  <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    style={{
                      width: "120px",
                      height: "80px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      marginLeft: "1rem",
                    }}
                  />
                )}
              </div>

              {/* Ad Stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    Budget
                  </div>
                  <div style={{ color: "#fff", fontSize: "1.125rem", fontWeight: "600" }}>
                    {formatCurrency(ad.budget)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    Spent
                  </div>
                  <div style={{ color: "#fff", fontSize: "1.125rem", fontWeight: "600" }}>
                    {formatCurrency(ad.spent || 0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    Impressions
                  </div>
                  <div style={{ color: "#fff", fontSize: "1.125rem", fontWeight: "600" }}>
                    {(ad.impressions || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    Clicks
                  </div>
                  <div style={{ color: "#fff", fontSize: "1.125rem", fontWeight: "600" }}>
                    {(ad.clicks || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    CTR
                  </div>
                  <div style={{ color: "#fff", fontSize: "1.125rem", fontWeight: "600" }}>
                    {ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : "0.00"}%
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {ad.status === "draft" && (
                  <button
                    onClick={() => handleLaunchAd(ad.id)}
                    disabled={launchingAdId === ad.id}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "#10b981",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {launchingAdId === ad.id ? "Launching..." : "Launch Ad"}
                  </button>
                )}
                {ad.status === "active" && (
                  <button
                    onClick={() => handlePauseAd(ad.id)}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "#f59e0b",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Pause Ad
                  </button>
                )}
                {ad.type === "external" && (
                  <button
                    onClick={() => handleDownloadAdPackage(ad)}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "#3b82f6",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    📥 Download Ad Package
                  </button>
                )}
                <button
                  style={{
                    padding: "0.5rem 1rem",
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "6px",
                    color: "white",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  View Analytics
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Launch confirmation modal */}
      {confirmLaunch.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
        >
          <div
            style={{ background: "#0f1724", padding: 20, borderRadius: 8, width: "min(560px,95%)" }}
          >
            <h3 style={{ marginTop: 0 }}>Confirm Launch</h3>
            <p>
              Are you sure you want to launch this ad? This action will start the campaign and may
              incur charges.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button
                className="btn-secondary"
                onClick={() => setConfirmLaunch({ open: false, adId: null })}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={performLaunchAd}
                disabled={launchingAdId === confirmLaunch.adId}
              >
                {launchingAdId === confirmLaunch.adId ? "Launching..." : "Confirm & Launch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Ad Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius: "12px",
              padding: "2rem",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ color: "#fff", marginBottom: "1.5rem", fontSize: "1.5rem" }}>
              Create {activeTab === "platform" ? "AutoPromote" : "External Platform"} Ad
            </h3>

            {/* Ad Type Selection */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  color: "#9ca3af",
                  fontSize: "0.875rem",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Ad Type *
              </label>
              <select
                value={adForm.adType}
                onChange={e => setAdForm({ ...adForm, adType: e.target.value })}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "1rem",
                }}
              >
                <option value="sponsored_content">Sponsored Content</option>
                <option value="banner">Banner Ad</option>
                <option value="video">Video Ad</option>
                <option value="product">Product Ad</option>
              </select>
            </div>

            {activeTab === "external" && (
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  style={{
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    marginBottom: "0.5rem",
                    display: "block",
                  }}
                >
                  Target Platform *
                </label>
                <select
                  value={adForm.externalPlatform}
                  onChange={e => setAdForm({ ...adForm, externalPlatform: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "1rem",
                  }}
                >
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="google">Google Ads</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="snapchat">Snapchat</option>
                  <option value="reddit">Reddit</option>
                  <option value="pinterest">Pinterest</option>
                  <option value="spotify">Spotify</option>
                  <option value="discord">Discord</option>
                  <option value="telegram">Telegram</option>
                </select>
              </div>
            )}

            {/* Title */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  color: "#9ca3af",
                  fontSize: "0.875rem",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Ad Title *
              </label>
              <input
                type="text"
                value={adForm.title}
                onChange={e => setAdForm({ ...adForm, title: e.target.value })}
                placeholder="Enter ad title"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "1rem",
                }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  color: "#9ca3af",
                  fontSize: "0.875rem",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Description *
              </label>
              <textarea
                value={adForm.description}
                onChange={e => setAdForm({ ...adForm, description: e.target.value })}
                placeholder="Enter ad description"
                rows={3}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "1rem",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Image URL */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  color: "#9ca3af",
                  fontSize: "0.875rem",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Image URL
              </label>
              <input
                type="url"
                value={adForm.imageUrl}
                onChange={e => setAdForm({ ...adForm, imageUrl: e.target.value })}
                placeholder="https://example.com/image.jpg"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "1rem",
                }}
              />
            </div>

            {/* Target URL */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  color: "#9ca3af",
                  fontSize: "0.875rem",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Target URL
              </label>
              <input
                type="url"
                value={adForm.targetUrl}
                onChange={e => setAdForm({ ...adForm, targetUrl: e.target.value })}
                placeholder="https://yoursite.com/landing-page"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "1rem",
                }}
              />
            </div>

            {/* Platform Targeting (for platform ads) */}
            {adForm.type === "platform" && (
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  style={{
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    marginBottom: "0.5rem",
                    display: "block",
                  }}
                >
                  Target Platforms
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                    gap: "0.75rem",
                    marginTop: "0.75rem",
                  }}
                >
                  {[
                    "facebook",
                    "instagram",
                    "youtube",
                    "tiktok",
                    "twitter",
                    "linkedin",
                    "snapchat",
                    "reddit",
                    "pinterest",
                    "spotify",
                    "discord",
                    "telegram",
                  ].map(platform => (
                    <label
                      key={platform}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        padding: "0.5rem",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "6px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={adForm.targeting.platforms.includes(platform)}
                        onChange={e => {
                          const platforms = e.target.checked
                            ? [...adForm.targeting.platforms, platform]
                            : adForm.targeting.platforms.filter(p => p !== platform);
                          setAdForm({ ...adForm, targeting: { ...adForm.targeting, platforms } });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      <span
                        style={{
                          color: "#cbd5e1",
                          fontSize: "0.875rem",
                          textTransform: "capitalize",
                        }}
                      >
                        {platform}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Budget and Duration */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <label
                  style={{
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    marginBottom: "0.5rem",
                    display: "block",
                  }}
                >
                  Budget (USD) *
                </label>
                <input
                  type="number"
                  value={adForm.budget}
                  onChange={e => setAdForm({ ...adForm, budget: parseFloat(e.target.value) })}
                  min="1"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "1rem",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    marginBottom: "0.5rem",
                    display: "block",
                  }}
                >
                  Duration (days) *
                </label>
                <input
                  type="number"
                  value={adForm.duration}
                  onChange={e => setAdForm({ ...adForm, duration: parseInt(e.target.value) })}
                  min="1"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "1rem",
                  }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetAdForm();
                }}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAd}
                disabled={creatingAd}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: creatingAd ? "not-allowed" : "pointer",
                }}
              >
                {creatingAd ? "Creating..." : "Create Ad"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdsPanel;
