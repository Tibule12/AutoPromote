import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";
import { parseJsonSafe } from "../utils/parseJsonSafe";
import toast from "react-hot-toast";

function ContentApprovalPanel() {
  const [content, setContent] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState([]);
  const [indexLink, setIndexLink] = useState(null);
  // filter not used yet; left for future enhancement

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();

      const [contentRes, statsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/approval/pending`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/admin/approval/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const [contentParsed, statsParsed] = await Promise.all([
        parseJsonSafe(contentRes),
        parseJsonSafe(statsRes),
      ]);

      const contentData = contentParsed.json || null;
      const statsData = statsParsed.json || null;

      if (contentParsed.ok && contentData && contentData.success) {
        setContent(contentData.content || contentData.pending || []);
        setIndexLink(null);
      } else if (!contentParsed.ok) {
        console.warn("Content approval pending endpoint returned non-OK status", {
          status: contentParsed.status,
          preview: contentParsed.textPreview || contentParsed.error,
          json: contentData,
        });
        if (contentData && contentData.indexLink) {
          setIndexLink(contentData.indexLink);
          toast.error("Content approval query requires a Firestore index; see admin link");
        } else {
          toast.error("Content approval service unavailable (pending list)");
        }
      }

      if (statsParsed.ok && statsData && statsData.success) setStats(statsData.stats);
      else if (!statsParsed.ok) {
        console.warn("Content approval stats endpoint returned non-OK status", {
          status: statsParsed.status,
          preview: statsParsed.textPreview || statsParsed.error,
        });
        toast.error("Content approval stats currently unavailable");
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching approval data:", error);
      setLoading(false);
    }
  };

  const handleApprove = async contentId => {
    const notes = prompt("Add approval notes (optional):");
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_BASE_URL}/api/admin/approval/${contentId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });
      alert("Content approved!");
      fetchData();
    } catch (error) {
      console.error("Error approving content:", error);
    }
  };

  const handleReject = async contentId => {
    const reason = prompt("Rejection reason (required):");
    if (!reason) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_BASE_URL}/api/admin/approval/${contentId}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });
      alert("Content rejected");
      fetchData();
    } catch (error) {
      console.error("Error rejecting content:", error);
    }
  };

  const handleRequestChanges = async contentId => {
    const changes = prompt("What changes are needed?");
    if (!changes) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_BASE_URL}/api/admin/approval/${contentId}/request-changes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ changes }),
      });
      alert("Change request sent");
      fetchData();
    } catch (error) {
      console.error("Error requesting changes:", error);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedContent.length === 0) {
      alert("Please select content first");
      return;
    }

    if (!window.confirm(`Approve ${selectedContent.length} items?`)) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_BASE_URL}/api/admin/approval/bulk-approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentIds: selectedContent }),
      });
      alert(`${selectedContent.length} items approved`);
      setSelectedContent([]);
      fetchData();
    } catch (error) {
      console.error("Error bulk approving:", error);
    }
  };

  const handleScan = async contentId => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/approval/${contentId}/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        alert(data.flagged ? "Content flagged as unsafe!" : "Content appears safe");
        fetchData();
      }
    } catch (error) {
      console.error("Error scanning content:", error);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>Loading content approval queue...</div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Stats */}
      {stats && (
        <div style={{ display: "flex", gap: 15, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: "#ed6c02" }}>{stats.pending}</div>
            <div style={statLabelStyle}>Pending</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: "#2e7d32" }}>{stats.approved}</div>
            <div style={statLabelStyle}>Approved (Total)</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: "#d32f2f" }}>{stats.rejected}</div>
            <div style={statLabelStyle}>Rejected (Total)</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: "#1976d2" }}>{stats.approvedToday}</div>
            <div style={statLabelStyle}>Approved Today</div>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedContent.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={handleBulkApprove} style={successButtonStyle}>
            Bulk Approve ({selectedContent.length})
          </button>
        </div>
      )}

      {/* Index warning if present */}
      {indexLink && (
        <div
          style={{
            padding: 12,
            backgroundColor: "#fff3e0",
            border: "1px solid #ffd180",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <strong style={{ color: "#bf360c" }}>Notice:</strong> Administrator query requires a
          Firestore composite index to show pending content.
          <div style={{ marginTop: 8 }}>
            <a href={indexLink} target="_blank" rel="noopener noreferrer">
              Open index creation link in Firebase Console
            </a>
          </div>
        </div>
      )}

      {/* Content List */}
      <div style={containerStyle}>
        <h3>Pending Approval ({content.length})</h3>
        {content.map(item => (
          <div key={item.id} style={contentCardStyle}>
            <div style={{ display: "flex", gap: 15 }}>
              <input
                type="checkbox"
                checked={selectedContent.includes(item.id)}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedContent([...selectedContent, item.id]);
                  } else {
                    setSelectedContent(selectedContent.filter(id => id !== item.id));
                  }
                }}
                style={{ cursor: "pointer" }}
              />

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <strong>{item.title}</strong>
                    <div style={{ fontSize: "0.9rem", color: "#666" }}>
                      By: {item.user?.name} ({item.user?.email})
                    </div>
                  </div>
                  <span
                    style={{
                      ...badgeStyle,
                      backgroundColor: item.type === "video" ? "#e3f2fd" : "#f3e5f5",
                      color: item.type === "video" ? "#1976d2" : "#7b1fa2",
                    }}
                  >
                    {item.type}
                  </span>
                </div>

                {item.description && (
                  <p style={{ margin: "10px 0", color: "#555" }}>{item.description}</p>
                )}

                {item.url && (
                  <div style={{ margin: "10px 0" }}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#1976d2" }}
                    >
                      View Content →
                    </a>
                  </div>
                )}

                {item.moderationScan && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      backgroundColor: item.autoFlagged ? "#ffebee" : "#e8f5e9",
                      borderRadius: 6,
                    }}
                  >
                    <strong>Safety Scan:</strong> {item.autoFlagged ? "⚠️ Flagged" : "✅ Safe"}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 15, flexWrap: "wrap" }}>
                  <button onClick={() => handleApprove(item.id)} style={smallSuccessButtonStyle}>
                    ✅ Approve
                  </button>
                  <button onClick={() => handleReject(item.id)} style={smallDangerButtonStyle}>
                    ❌ Reject
                  </button>
                  <button
                    onClick={() => handleRequestChanges(item.id)}
                    style={smallWarningButtonStyle}
                  >
                    📝 Request Changes
                  </button>
                  <button onClick={() => handleScan(item.id)} style={smallInfoButtonStyle}>
                    🔍 Safety Scan
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {content.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
            No content pending approval
          </div>
        )}
      </div>
    </div>
  );
}

// Styles
const statCardStyle = {
  backgroundColor: "white",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  flex: "1 1 200px",
  minWidth: 150,
};

const statValueStyle = {
  fontSize: "2rem",
  fontWeight: "bold",
};

const statLabelStyle = {
  fontSize: "0.9rem",
  color: "#666",
  marginTop: 5,
};

const containerStyle = {
  backgroundColor: "white",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
};

const contentCardStyle = {
  padding: 15,
  borderBottom: "1px solid #eee",
  marginBottom: 15,
};

const badgeStyle = {
  padding: "4px 12px",
  borderRadius: 6,
  fontSize: "0.85rem",
  fontWeight: "500",
};

const successButtonStyle = {
  padding: "10px 20px",
  backgroundColor: "#2e7d32",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: "0.9rem",
};

const smallSuccessButtonStyle = {
  padding: "6px 12px",
  backgroundColor: "#2e7d32",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const smallDangerButtonStyle = {
  padding: "6px 12px",
  backgroundColor: "#d32f2f",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const smallWarningButtonStyle = {
  padding: "6px 12px",
  backgroundColor: "#ed6c02",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const smallInfoButtonStyle = {
  padding: "6px 12px",
  backgroundColor: "#1976d2",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
};

export default ContentApprovalPanel;
