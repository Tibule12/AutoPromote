import React, { useState, useEffect, useCallback } from "react";
import { getAuth } from "firebase/auth";
import { API_ENDPOINTS } from "../config";
import toast from "react-hot-toast";

const STATUS_COLORS = {
  posted: "#22c55e",
  success: "#22c55e",
  completed: "#22c55e",
  processing: "#f59e0b",
  queued: "#f59e0b",
  pending: "#f59e0b",
  failed: "#ef4444",
  error: "#ef4444",
  unknown: "#6b7280",
};

const STATUS_LABELS = {
  posted: "Published",
  success: "Published",
  completed: "Completed",
  processing: "In Progress",
  queued: "Queued",
  pending: "Pending",
  failed: "Failed",
  error: "Error",
  unknown: "Unknown",
};

function formatDate(value) {
  if (!value) return "—";
  try {
    const d = typeof value === "object" && value._seconds
      ? new Date(value._seconds * 1000)
      : new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  const label = STATUS_LABELS[status] || status || "Unknown";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "12px",
      fontSize: "0.75rem",
      fontWeight: 600,
      color: "#fff",
      background: color,
    }}>
      {label}
    </span>
  );
}

function SummaryCard({ label, value, color = "#fff" }) {
  return (
    <div style={{
      flex: 1,
      minWidth: "120px",
      padding: "14px 16px",
      background: "rgba(255,255,255,0.04)",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: "4px" }}>{label}</div>
    </div>
  );
}

export default function RepostPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewingId, setPreviewingId] = useState(null);
  const [expandedContentId, setExpandedContentId] = useState(null);

  const authedFetch = useCallback(async (url, options = {}) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(API_ENDPOINTS.REPOST_ACTIVITY);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Failed to load repost activity:", e);
      setError(e.message || "Failed to load repost data");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGeneratePreview = async (contentId) => {
    setPreviewingId(contentId);
    try {
      const res = await authedFetch(API_ENDPOINTS.REPOST_PREVIEW(contentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Repost preview generation started");
      // Refresh data to see updated preview status
      await loadData();
    } catch (e) {
      console.error("Preview generation failed:", e);
      toast.error("Failed to generate repost preview");
    } finally {
      setPreviewingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#aaa" }}>
        Loading repost activity...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ color: "#ef4444", marginBottom: "12px" }}>{error}</div>
        <button onClick={loadData} style={btnStyle}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, content, repostPosts, repostSchedules, autoRepostEnabled } = data;

  // Group repost posts by contentId for the detail view
  const postsByContent = {};
  repostPosts.forEach(post => {
    const cid = post.contentId || "unknown";
    if (!postsByContent[cid]) postsByContent[cid] = [];
    postsByContent[cid].push(post);
  });

  return (
    <div style={{ padding: "0 4px", maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Repost Manager</h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", opacity: 0.7 }}>
            Track how AutoPromote detects view decay and re-publishes your content with enhancements.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{
            padding: "4px 12px",
            borderRadius: "12px",
            fontSize: "0.78rem",
            fontWeight: 600,
            background: autoRepostEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: autoRepostEnabled ? "#22c55e" : "#ef4444",
            border: `1px solid ${autoRepostEnabled ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}>
            {autoRepostEnabled ? "Auto-Repost ON" : "Auto-Repost OFF"}
          </span>
          <button onClick={loadData} style={{ ...btnStyle, padding: "6px 12px", fontSize: "0.8rem" }}>
            Refresh
          </button>
        </div>
      </div>

      {!autoRepostEnabled && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "0.85rem",
        }}>
          Auto-repost is currently disabled. Enable it in your <strong>Profile settings</strong> to let AutoPromote automatically re-publish content when views decay.
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <SummaryCard label="Content Tracked" value={summary.totalContent} />
        <SummaryCard label="Total Reposts" value={summary.totalReposts} />
        <SummaryCard label="Successful" value={summary.successfulReposts} color="#22c55e" />
        <SummaryCard label="Failed" value={summary.failedReposts} color="#ef4444" />
        <SummaryCard label="Pending" value={summary.pendingSchedules} color="#f59e0b" />
      </div>

      {/* Content with repost activity */}
      {content.length === 0 && repostPosts.length === 0 ? (
        <div style={{
          padding: "40px 20px",
          textAlign: "center",
          background: "rgba(255,255,255,0.02)",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>No Repost Activity Yet</div>
          <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            When AutoPromote detects your content views are slowing down, it will enhance and re-publish automatically.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {content.map(item => {
            const posts = postsByContent[item.id] || [];
            const schedules = repostSchedules.filter(s => s.contentId === item.id);
            const isExpanded = expandedContentId === item.id;
            const state = item.autoRepostState;
            const preview = item.repostPreview;

            return (
              <div key={item.id} style={{
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}>
                {/* Content header row */}
                <div
                  onClick={() => setExpandedContentId(isExpanded ? null : item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseOut={e => e.currentTarget.style.background = "transparent"}
                >
                  {item.thumbnail && (
                    <img
                      src={item.thumbnail}
                      alt=""
                      style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover" }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: "2px" }}>
                      {item.platform ? `${item.platform} · ` : ""}
                      {posts.length} repost{posts.length !== 1 ? "s" : ""}
                      {schedules.length > 0 ? ` · ${schedules.length} scheduled` : ""}
                    </div>
                  </div>

                  {/* Quick status indicators */}
                  {state && state.platforms && (
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {Object.entries(state.platforms).map(([platform, pState]) => (
                        <span key={platform} style={{
                          padding: "2px 8px",
                          borderRadius: "8px",
                          fontSize: "0.7rem",
                          background: "rgba(255,255,255,0.06)",
                          whiteSpace: "nowrap",
                        }}>
                          {platform}: {pState.attemptsScheduled || 0}/{pState.maxAttempts || "?"}
                        </span>
                      ))}
                    </div>
                  )}

                  <span style={{ fontSize: "0.85rem", opacity: 0.5 }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Enhancement info */}
                    {state && state.platforms && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "8px" }}>
                          Decay Detection & Enhancement
                        </div>
                        {Object.entries(state.platforms).map(([platform, pState]) => (
                          <div key={platform} style={{
                            padding: "10px 12px",
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: "8px",
                            marginBottom: "6px",
                            fontSize: "0.82rem",
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <strong style={{ textTransform: "capitalize" }}>{platform}</strong>
                              <span style={{ opacity: 0.6 }}>
                                {pState.attemptsScheduled || 0} of {pState.maxAttempts || "?"} attempts used
                              </span>
                            </div>
                            {pState.lastImpressions != null && (
                              <div style={{ opacity: 0.7 }}>
                                Last check: {pState.lastImpressions?.toLocaleString()} impressions ·{" "}
                                {pState.lastGrowthPerHour?.toFixed(1)} views/hr ·{" "}
                                Score: {((pState.lastOpportunityScore || 0) * 100).toFixed(0)}%
                              </div>
                            )}
                            {pState.lastScheduledAt && (
                              <div style={{ opacity: 0.5, marginTop: "2px" }}>
                                Last scheduled: {formatDate(pState.lastScheduledAt)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Side-by-Side Comparison Viewer */}
                    {preview && (
                      <div style={{
                        marginTop: "12px",
                        padding: "14px",
                        background: "rgba(99,102,241,0.08)",
                        borderRadius: "10px",
                        border: "1px solid rgba(99,102,241,0.15)",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                            Repost Preview {preview.status === "queued" && <StatusBadge status="processing" />}
                            {preview.status === "completed" && <StatusBadge status="success" />}
                          </div>
                          {preview.status === "completed" && (
                            <span style={{ fontSize: "0.72rem", color: "#a5b4fc", opacity: 0.8 }}>
                              Enhanced with hook intro + captions
                            </span>
                          )}
                        </div>

                        {/* Video Comparison */}
                        {(preview.originalUrl || preview.outputUrl) && (
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: preview.originalUrl && preview.outputUrl ? "1fr 1fr" : "1fr",
                            gap: "12px",
                            marginBottom: "12px",
                          }}>
                            {preview.originalUrl && (
                              <div>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "6px", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Original
                                </div>
                                <video
                                  src={preview.originalUrl}
                                  controls
                                  playsInline
                                  style={{
                                    width: "100%",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    background: "#000",
                                    maxHeight: "280px",
                                  }}
                                />
                              </div>
                            )}
                            {preview.outputUrl && (
                              <div>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "6px", color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Enhanced ✨
                                </div>
                                <video
                                  src={preview.outputUrl}
                                  controls
                                  playsInline
                                  style={{
                                    width: "100%",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(99,102,241,0.3)",
                                    background: "#000",
                                    maxHeight: "280px",
                                    boxShadow: "0 0 12px rgba(99,102,241,0.15)",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Enhancement Details */}
                        <div style={{ display: "grid", gap: "6px" }}>
                          {preview.hookText && (
                            <div style={{ fontSize: "0.82rem" }}>
                              <span style={{ fontWeight: 600, color: "#a5b4fc" }}>Hook:</span>{" "}
                            <span style={{ opacity: 0.9 }}>{`"${preview.hookText}"`}</span>
                            </div>
                          )}
                          {preview.caption && (
                            <div style={{ fontSize: "0.82rem", opacity: 0.8 }}>{preview.caption}</div>
                          )}
                          {preview.hashtags && preview.hashtags.length > 0 && (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
                              {preview.hashtags.map((tag, i) => (
                                <span key={i} style={{
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  background: "rgba(99,102,241,0.12)",
                                  fontSize: "0.72rem",
                                  color: "#c4b5fd",
                                }}>
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {preview.status === "queued" && (
                          <div style={{
                            marginTop: "10px",
                            padding: "8px 12px",
                            background: "rgba(245,158,11,0.08)",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            color: "#fbbf24",
                          }}>
                            Enhancement is processing — the comparison will appear once the enhanced version is ready.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Repost history */}
                    {posts.length > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "8px" }}>
                          Repost History
                        </div>
                        {posts.map(post => (
                          <div key={post.id} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "8px 10px",
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: "6px",
                            marginBottom: "4px",
                            fontSize: "0.82rem",
                          }}>
                            <StatusBadge status={post.status} />
                            <span style={{ textTransform: "capitalize" }}>{post.platform}</span>
                            {post.repostMetadata && (
                              <span style={{ opacity: 0.6 }}>
                                Attempt {post.repostMetadata.attemptNumber}/{post.repostMetadata.maxAttempts}
                                {post.repostMetadata.creativeHook ? ` · "${post.repostMetadata.creativeHook}"` : ""}
                              </span>
                            )}
                            <span style={{ marginLeft: "auto", opacity: 0.5 }}>
                              {post.metrics.views > 0 && `${post.metrics.views.toLocaleString()} views · `}
                              {formatDate(post.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Scheduled reposts */}
                    {schedules.length > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "8px" }}>
                          Scheduled Reposts
                        </div>
                        {schedules.map(sched => (
                          <div key={sched.id} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "8px 10px",
                            background: "rgba(245,158,11,0.05)",
                            borderRadius: "6px",
                            marginBottom: "4px",
                            fontSize: "0.82rem",
                          }}>
                            <StatusBadge status={sched.status} />
                            <span style={{ textTransform: "capitalize" }}>{sched.platform}</span>
                            <span style={{ opacity: 0.6 }}>{sched.message}</span>
                            <span style={{ marginLeft: "auto", opacity: 0.5 }}>
                              Scheduled: {formatDate(sched.startTime)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleGeneratePreview(item.id); }}
                        disabled={previewingId === item.id}
                        style={{
                          ...btnStyle,
                          background: previewingId === item.id ? "#555" : "#6366f1",
                        }}
                      >
                        {previewingId === item.id ? "Generating..." : "Generate Repost Preview"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Orphaned repost posts (content may have been deleted) */}
          {repostPosts.filter(p => !content.find(c => c.id === p.contentId)).length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "8px", opacity: 0.7 }}>
                Other Repost Activity
              </div>
              {repostPosts
                .filter(p => !content.find(c => c.id === p.contentId))
                .map(post => (
                  <div key={post.id} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "6px",
                    marginBottom: "4px",
                    fontSize: "0.82rem",
                  }}>
                    <StatusBadge status={post.status} />
                    <span style={{ textTransform: "capitalize" }}>{post.platform}</span>
                    <span style={{ opacity: 0.5 }}>Content: {post.contentId || "unknown"}</span>
                    <span style={{ marginLeft: "auto", opacity: 0.5 }}>{formatDate(post.createdAt)}</span>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "none",
  background: "#6366f1",
  color: "#fff",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};
