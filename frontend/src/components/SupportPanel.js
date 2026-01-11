import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";

const SupportPanel = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      // Only fetch active tickets if filter is 'open', otherwise fetch all or closed
      const statusParam = filter === "all" ? "" : `?status=${filter}`;
      console.log(`Fetching tickets: ${API_BASE_URL}/api/admin/support/tickets${statusParam}`);

      const res = await fetch(`${API_BASE_URL}/api/admin/support/tickets${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      } else {
        console.warn("Failed to fetch tickets", res.status);
      }
    } catch (e) {
      console.error("Error fetching tickets:", e);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = p => {
    switch (p) {
      case "high":
        return "#ef4444";
      case "medium":
        return "#f59e0b";
      case "low":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  const badgeStyle = p => ({
    padding: "2px 8px",
    borderRadius: "12px",
    color: "white",
    background: getPriorityColor(p),
    fontSize: "0.75rem",
    fontWeight: "bold",
    textTransform: "uppercase",
  });

  return (
    <div className="support-panel" style={{ padding: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h3>🎧 Support Tickets</h3>

        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
          Loading tickets...
        </div>
      ) : tickets.length === 0 ? (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            border: "2px dashed #e2e8f0",
            borderRadius: "12px",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>📭</div>
          <div style={{ color: "#94a3b8" }}>No {filter} tickets found.</div>
        </div>
      ) : (
        <div className="tickets-list" style={{ display: "grid", gap: "1rem" }}>
          {tickets.map(ticket => (
            <div
              key={ticket.id}
              style={{
                background: "white",
                padding: "1.5rem",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}
              >
                <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>
                  {ticket.subject || "No Subject"}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={badgeStyle(ticket.priority)}>{ticket.priority || "normal"}</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: ticket.status === "open" ? "#dbeafe" : "#f3f4f6",
                      color: ticket.status === "open" ? "#1e40af" : "#374151",
                      fontSize: "0.75rem",
                    }}
                  >
                    {ticket.status}
                  </span>
                </div>
              </div>

              <p
                style={{
                  color: "#475569",
                  fontSize: "0.95rem",
                  lineHeight: "1.5",
                  margin: "0 0 1rem 0",
                }}
              >
                {ticket.message || ticket.description}
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.85rem",
                  color: "#94a3b8",
                }}
              >
                <div>
                  User:{" "}
                  <span style={{ color: "#334155", fontWeight: "500" }}>
                    {ticket.user?.email || ticket.userId || "Anonymous"}
                  </span>
                </div>
                <div>{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ""}</div>
              </div>

              <div
                style={{
                  marginTop: "1rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid #f1f5f9",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #e2e8f0",
                    background: "white",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  View Details
                </button>
                {ticket.status === "open" && (
                  <button
                    style={{
                      padding: "6px 12px",
                      background: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Reply
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportPanel;
