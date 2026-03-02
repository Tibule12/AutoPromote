import React, { useEffect, useState } from "react";
import AdminTable from "./AdminTable";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";
import "../AdminDashboard.css";

const AdminSubscriptionOverview = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSubs();
  }, []);

  const fetchSubs = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch(
        `${API_BASE_URL}/api/paypal-subscriptions/admin/active-subscriptions`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (res.ok && data.subscriptions) {
        setSubscriptions(data.subscriptions);
      } else {
        setError(data.error || "Failed to load subscriptions");
      }
    } catch (e) {
      console.error(e);
      setError("Network error fetching subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (userId, userName) => {
    if (
      !window.confirm(
        `Are you sure you want to CANCEL the subscription for ${userName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const token = await auth.currentUser.getIdToken();
      // eslint-disable-next-line
      const res = await fetch(
        `${API_BASE_URL}/api/paypal-subscriptions/admin/cancel-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId, reason: "Cancelled by admin via dashboard" }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert("Subscription cancelled successfully.");
        fetchSubs(); // Refresh list to remove cancelled user or update status
      } else {
        alert("Failed to cancel: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Network error while cancelling.");
    }
  };

  const handleRefund = async (userId, userName) => {
    if (
      !window.confirm(
        `Are you sure you want to REFUND the last payment for ${userName}? This will reverse the most recent transaction.`
      )
    ) {
      return;
    }

    try {
      const token = await auth.currentUser.getIdToken();
      // eslint-disable-next-line
      const res = await fetch(
        `${API_BASE_URL}/api/paypal-subscriptions/admin/refund-last-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId, reason: "Admin requested refund via dashboard" }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert(`Success! Refunded payment (ID: ${data.refundId})`);
      } else {
        alert("Failed to refund: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Network error while refunding.");
    }
  };

  const columns = [
    {
      header: "User",
      accessor: "name",
      render: row => (
        <div>
          <div style={{ fontWeight: "bold" }}>{row.name}</div>
          <div style={{ fontSize: "0.8em", color: "#666" }}>{row.userId}</div>
        </div>
      ),
    },
    { header: "Email", accessor: "email" },
    {
      header: "Plan",
      accessor: "plan",
      render: r => (
        <span
          style={{
            background: r.plan === "pro" ? "#e0f2fe" : "#f3f4f6",
            color: r.plan === "pro" ? "#0284c7" : "#374151",
            padding: "2px 8px",
            borderRadius: "12px",
            fontWeight: "bold",
            fontSize: "0.8em",
          }}
        >
          {r.plan.toUpperCase()}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: "status",
      render: r => (
        <span style={{ color: r.status === "active" ? "green" : "red", fontWeight: "bold" }}>
          {r.status.toUpperCase()}
        </span>
      ),
    },
    {
      header: "Next Billing",
      accessor: "nextBilling",
      render: r => (r.nextBilling ? new Date(r.nextBilling).toLocaleDateString() : "-"),
    },
    {
      header: "Actions",
      render: r => (
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => handleCancel(r.userId, r.name)}
            style={{
              background: "#fee2e2",
              color: "#b91c1c",
              border: "none",
              padding: "6px 12px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.85rem",
              transition: "background 0.2s",
            }}
            onMouseOver={e => (e.target.style.background = "#fca5a5")}
            onMouseOut={e => (e.target.style.background = "#fee2e2")}
          >
            Cancel
          </button>
          <button
            onClick={() => handleRefund(r.userId, r.name)}
            style={{
              background: "#dbeafe",
              color: "#1e40af",
              border: "none",
              padding: "6px 12px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.85rem",
              transition: "background 0.2s",
            }}
            onMouseOver={e => (e.target.style.background = "#bfdbfe")}
            onMouseOut={e => (e.target.style.background = "#dbeafe")}
          >
            Refund Last
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-payouts-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3>Active Subscriptions ({subscriptions.length})</h3>
        <button onClick={fetchSubs} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      {loading && <div className="loading-spinner">Loading subscriptions...</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && (
        <AdminTable data={subscriptions} columns={columns} title="Current Subscribers" />
      )}
    </div>
  );
};

export default AdminSubscriptionOverview;
