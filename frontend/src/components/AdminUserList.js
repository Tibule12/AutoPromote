import React, { useEffect, useState } from "react";
import AdminTable from "./AdminTable";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";
import { signInWithCustomToken } from "firebase/auth";

const AdminUserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/users?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.users) {
        setUsers(data.users);
      } else {
        setError("Failed to load users");
      }
    } catch (err) {
      console.error(err);
      setError("Network error loading users");
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (userId, name) => {
    if (
      !window.confirm(
        `Warning: You are about to log in as ${name}.\n\nThis will log you out of your Admin account. You will need to log back in as Admin when finished.\n\nContinue?`
      )
    ) {
      return;
    }

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/support/impersonate/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: "Admin dashboard impersonation" }),
      });
      const data = await res.json();

      if (data.success && data.customToken) {
        // Sign in as the user
        await signInWithCustomToken(auth, data.customToken);
        // Redirect to dashboard (user view)
        window.location.href = "/dashboard";
      } else {
        alert("Failed to get impersonation token: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Impersonation failed: " + err.message);
    }
  };

  const handleBan = async (userId, userStatus) => {
    const isBanned = userStatus === "suspended" || userStatus === "banned";
    const action = isBanned ? "unsuspend" : "suspend";
    const confirmMsg = isBanned
      ? `Unban user ${userId}? They will regain access.`
      : `Ban user ${userId}? They will lose access immediately.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        alert(`User ${action}ed successfully`);
        fetchUsers();
      } else {
        const d = await res.json();
        alert(`Failed: ${d.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Network error");
    }
  };

  const columns = [
    {
      header: "User",
      accessor: "name",
      render: r => (
        <div>
          <div style={{ fontWeight: "bold" }}>{r.name || r.displayName || "No Name"}</div>
          <div style={{ fontSize: "0.8em", color: "#666" }}>{r.email}</div>
          <div style={{ fontSize: "0.7em", color: "#999" }}>ID: {r.id || r.userId}</div>
        </div>
      ),
    },
    {
      header: "Role",
      accessor: "role",
      render: r => (
        <span
          style={{
            background: r.role === "admin" ? "#fef3c7" : "#e0f2fe",
            color: r.role === "admin" ? "#d97706" : "#0284c7",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "0.8em",
            fontWeight: "bold",
          }}
        >
          {r.role || "user"}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: "status",
      render: r => {
        const isBanned = r.status === "suspended" || r.status === "banned";
        return (
          <span
            style={{
              color: isBanned ? "red" : "green",
              fontWeight: "bold",
            }}
          >
            {isBanned ? "BANNED" : r.status || "Active"}
          </span>
        );
      },
    },
    {
      header: "Actions",
      render: r => (
        <div style={{ display: "flex", gap: "8px" }}>
          {r.role !== "admin" && (
            <>
              <button
                onClick={() => handleImpersonate(r.id || r.userId, r.name || r.email)}
                style={{
                  background: "#4b5563",
                  color: "white",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.8em",
                }}
                title="Log in as this user"
              >
                🕵️ Impersonate
              </button>
              <button
                onClick={() => handleBan(r.id || r.userId, r.status)}
                style={{
                  background:
                    r.status === "suspended" || r.status === "banned" ? "#dcfce7" : "#fee2e2",
                  color: r.status === "suspended" || r.status === "banned" ? "#166534" : "#b91c1c",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.8em",
                }}
              >
                {r.status === "suspended" || r.status === "banned" ? "✅ Unban" : "🚫 Ban"}
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h3>User Management</h3>
        <button
          onClick={fetchUsers}
          style={{
            background: "#f3f4f6",
            border: "1px solid #d1d5db",
            padding: "6px 12px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Refresh List
        </button>
      </div>

      {loading && <div>Loading users...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {!loading && !error && (
        <AdminTable data={users} columns={columns} title="" emptyMessage="No users found." />
      )}
    </div>
  );
};

export default AdminUserList;
