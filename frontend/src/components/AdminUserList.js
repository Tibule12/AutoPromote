import React, { useEffect, useState } from "react";
import AdminTable from "./AdminTable";
import { API_BASE_URL } from "../config";
import { auth } from "../firebaseClient";
import { signInWithCustomToken } from "firebase/auth";
import { parseJsonSafe } from "../utils/parseJsonSafe";

const AdminUserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [grantingTesterId, setGrantingTesterId] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
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

  const handleGrantTesterAccess = async user => {
    const userId = user.id || user.userId;
    const userLabel = user.name || user.displayName || user.email || userId;
    const confirmed = window.confirm(
      `Grant ${userLabel} one of the 10 Founding Tester places?\n\nThis gives 30 days of controlled access, 1,500 credits, 10 uploads, 30 queued posts, and up to 3 connected platforms. It does not renew or charge the user.`
    );
    if (!confirmed) return;

    setGrantingTesterId(userId);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/tester-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const parsed = await parseJsonSafe(response);
      const body = parsed.json || {};
      if (!response.ok) {
        throw new Error(body.message || body.error || "Could not grant tester access");
      }

      const deliveryMessage = body.emailSent
        ? "The AutoPromote welcome email was sent."
        : "Access was granted, but the welcome email was not delivered.";
      window.alert(
        `${body.alreadyGranted ? "Tester access was already granted." : "Founding Tester access granted."}\n\nSeats: ${body.claimedSeats}/${body.maxSeats}\n${deliveryMessage}`
      );
      await fetchUsers();
    } catch (err) {
      window.alert(`Could not grant tester access: ${err.message}`);
    } finally {
      setGrantingTesterId("");
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
      header: "Access",
      accessor: "testerAccess",
      render: r => {
        const testerGranted = Boolean(r.testerAccess?.programId);
        const testerActive =
          testerGranted &&
          r.testerAccess?.status === "active" &&
          Date.parse(r.testerAccess?.expiresAt || "") > Date.now();
        return (
          <span
            style={{
              background: testerActive ? "#ede9fe" : "#f3f4f6",
              color: testerActive ? "#6d28d9" : "#4b5563",
              padding: "3px 7px",
              borderRadius: "999px",
              fontSize: "0.78em",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            {testerActive ? "Founding Tester" : testerGranted ? "Tester expired" : "Starter"}
          </span>
        );
      },
    },
    {
      header: "Actions",
      render: r => {
        const userId = r.id || r.userId;
        const testerGranted = Boolean(r.testerAccess?.programId);
        const testerActive =
          testerGranted &&
          r.testerAccess?.status === "active" &&
          Date.parse(r.testerAccess?.expiresAt || "") > Date.now();
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {r.role !== "admin" && (
              <>
                <button
                  onClick={() => handleGrantTesterAccess(r)}
                  disabled={testerGranted || grantingTesterId === userId}
                  style={{
                    background: testerActive ? "#64748b" : testerGranted ? "#9ca3af" : "#7c3aed",
                    color: "white",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    cursor: testerGranted ? "default" : "pointer",
                    fontSize: "0.8em",
                    opacity: grantingTesterId === userId ? 0.65 : 1,
                    whiteSpace: "nowrap",
                  }}
                  title={
                    testerActive
                      ? `Access expires ${new Date(r.testerAccess.expiresAt).toLocaleDateString()}`
                      : testerGranted
                        ? "This one-time tester pass has expired"
                        : "Grant a controlled 30-day Founding Tester pass"
                  }
                >
                  {grantingTesterId === userId
                    ? "Granting…"
                    : testerActive
                      ? "Tester active"
                      : testerGranted
                        ? "Tester expired"
                        : "✨ Grant Tester"}
                </button>
                <button
                  onClick={() => handleImpersonate(userId, r.name || r.email)}
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
                  onClick={() => handleBan(userId, r.status)}
                  style={{
                    background:
                      r.status === "suspended" || r.status === "banned" ? "#dcfce7" : "#fee2e2",
                    color:
                      r.status === "suspended" || r.status === "banned" ? "#166534" : "#b91c1c",
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
        );
      },
    },
  ];

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleUsers = normalizedSearch
    ? users.filter(user =>
        [user.name, user.displayName, user.email, user.id, user.userId].some(value =>
          String(value || "")
            .toLowerCase()
            .includes(normalizedSearch)
        )
      )
    : users;

  return (
    <div style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Users</h3>
          <div style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: "4px" }}>
            {users.length} account{users.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <input
            type="search"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search name or email"
            aria-label="Search users"
            style={{
              minWidth: "220px",
              border: "1px solid #d1d5db",
              padding: "7px 10px",
              borderRadius: "6px",
            }}
          />
          <button
            onClick={fetchUsers}
            style={{
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              padding: "6px 12px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <div>Loading users...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {!loading && !error && (
        <AdminTable
          data={visibleUsers}
          columns={columns}
          title=""
          emptyMessage={normalizedSearch ? "No users match your search." : "No users found."}
        />
      )}
    </div>
  );
};

export default AdminUserList;
