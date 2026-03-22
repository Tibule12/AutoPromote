import React, { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { API_ENDPOINTS } from "./config";

const DEFAULT_CAPABILITIES = {
  planName: "Starter",
  support: {
    label: "Self-serve",
    ticketAccess: false,
    allowedPriorities: ["low"],
    responseTarget: "Self-serve resources and billing page guidance",
    channel: "Self-serve",
  },
};

const Support = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES);
  const [tickets, setTickets] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    subject: "",
    description: "",
    category: "general",
    priority: "medium",
  });

  useEffect(() => {
    let cancelled = false;

    const loadSupportData = async currentUser => {
      if (!currentUser) {
        if (!cancelled) {
          setCapabilities(DEFAULT_CAPABILITIES);
          setTickets([]);
          setLoading(false);
        }
        return;
      }

      try {
        const token = await currentUser.getIdToken();
        const [statusRes, ticketsRes] = await Promise.all([
          fetch(API_ENDPOINTS.PAYPAL_SUBSCRIPTION_STATUS, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          }),
          fetch(API_ENDPOINTS.SUPPORT_TICKETS_SELF, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          }),
        ]);

        const statusData = statusRes.ok ? await statusRes.json() : null;
        const ticketsData = ticketsRes.ok ? await ticketsRes.json() : { tickets: [] };

        if (!cancelled) {
          setCapabilities(statusData?.capabilities || DEFAULT_CAPABILITIES);
          setTickets(Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []);
          setForm(prev => ({
            ...prev,
            priority: (statusData?.capabilities?.support?.allowedPriorities || ["low"])[0] || "low",
          }));
          setError("");
        }
      } catch (_loadError) {
        if (!cancelled) {
          setError("Could not load support details right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSupportData(auth.currentUser);
    const unsubscribe = auth.onAuthStateChanged(user => {
      setLoading(true);
      loadSupportData(user);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const allowedPriorities = capabilities.support.allowedPriorities || ["low"];

  const submitTicket = async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      setError("Sign in to open a support ticket.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(API_ENDPOINTS.SUPPORT_TICKETS_CREATE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create support ticket.");
      }

      setMessage("Support ticket created. Your queue is updated below.");
      setForm({
        subject: "",
        description: "",
        category: "general",
        priority: allowedPriorities[0] || "low",
      });

      const ticketsResponse = await fetch(API_ENDPOINTS.SUPPORT_TICKETS_SELF, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const ticketsData = ticketsResponse.ok ? await ticketsResponse.json() : { tickets: [] };
      setTickets(Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []);
    } catch (submitError) {
      setError(submitError.message || "Failed to create support ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>Support</h2>
      <p style={{ color: "#64748b", maxWidth: 760 }}>
        Your support lane is tied to your active plan. Starter stays self-serve. Creator and above
        can open tracked tickets with response handling that matches the listed plan level.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          marginTop: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 18,
            background: "#fff",
          }}
        >
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 6 }}>
            Current Support Tier
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{capabilities.planName}</div>
          <div style={{ marginTop: 6, color: "#0f172a" }}>{capabilities.support.label}</div>
        </div>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 18,
            background: "#fff",
          }}
        >
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 6 }}>Response Target</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{capabilities.support.responseTarget}</div>
        </div>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 18,
            background: "#fff",
          }}
        >
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 6 }}>Direct Contact</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            <a href="mailto:thulani@autopromote.org">thulani@autopromote.org</a>
          </div>
        </div>
      </div>

      {loading ? <p>Loading support workspace...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {message ? <p style={{ color: "#166534" }}>{message}</p> : null}

      {!auth.currentUser ? (
        <div
          style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, background: "#fff" }}
        >
          <h3 style={{ marginTop: 0 }}>Sign in to access plan-aware support</h3>
          <p style={{ color: "#64748b" }}>
            Signed-in paid plans can open tracked tickets here. If you are browsing publicly, use
            email for general questions.
          </p>
        </div>
      ) : capabilities.support.ticketAccess ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: 20,
          }}
        >
          <form
            onSubmit={submitTicket}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 20,
              background: "#fff",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Open a Ticket</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                type="text"
                placeholder="Subject"
                value={form.subject}
                onChange={event => setForm(prev => ({ ...prev, subject: event.target.value }))}
                style={{ padding: 12, borderRadius: 10, border: "1px solid #cbd5e1" }}
              />
              <textarea
                placeholder="Describe the issue, the page involved, and what you expected to happen."
                value={form.description}
                onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
                rows={7}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <select
                  value={form.category}
                  onChange={event => setForm(prev => ({ ...prev, category: event.target.value }))}
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #cbd5e1" }}
                >
                  <option value="general">General</option>
                  <option value="billing">Billing</option>
                  <option value="analytics">Analytics</option>
                  <option value="publishing">Publishing</option>
                  <option value="connections">Connections</option>
                </select>
                <select
                  value={form.priority}
                  onChange={event => setForm(prev => ({ ...prev, priority: event.target.value }))}
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #cbd5e1" }}
                >
                  {allowedPriorities.map(priority => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={submitting} style={{ padding: 12, borderRadius: 12 }}>
                {submitting ? "Submitting..." : "Submit Ticket"}
              </button>
            </div>
          </form>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 20,
              background: "#fff",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Your Queue</h3>
            {tickets.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {tickets.map(ticket => (
                  <div
                    key={ticket.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: 14,
                      background: "#f8fafc",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>{ticket.subject}</strong>
                      <span style={{ textTransform: "capitalize", color: "#475569" }}>
                        {ticket.status}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, color: "#475569", fontSize: 14 }}>
                      {ticket.category} • {ticket.priority} priority
                    </div>
                    <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                      {ticket.createdAt
                        ? new Date(ticket.createdAt).toLocaleString()
                        : "Pending timestamp"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b" }}>No tickets yet. Your next ticket will appear here.</p>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, background: "#fff" }}
        >
          <h3 style={{ marginTop: 0 }}>Starter Plan Support</h3>
          <p style={{ color: "#64748b" }}>
            Your current plan is self-serve only. Upgrade to Creator or higher to open tracked
            support tickets from this page.
          </p>
          <p style={{ color: "#64748b" }}>
            For general help in the meantime, email{" "}
            <a href="mailto:thulani@autopromote.org">thulani@autopromote.org</a>.
          </p>
        </div>
      )}
    </div>
  );
};

export default Support;
