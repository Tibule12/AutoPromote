import React, { useEffect, useState } from "react";

export default function AdminKyc() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to fetch users");
      const json = await res.json();
      setUsers(json.users || []);
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const toggleKyc = async (id, current) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/kyc`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ kycVerified: !current }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const json = await res.json();
      setUsers(u => u.map(x => (x.id === id ? json.user : x)));
    } catch (err) {
      setError(err.message || "Error");
    }
  };

  if (loading) return <div>Loading users...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;

  return (
    <div>
      <h3>Admin KYC Management</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>ID</th>
            <th style={{ textAlign: "left" }}>Email</th>
            <th style={{ textAlign: "left" }}>Name</th>
            <th style={{ textAlign: "left" }}>KYC</th>
            <th style={{ textAlign: "left" }}>AfterDark</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.email || "-"}</td>
              <td>{u.name || "-"}</td>
              <td>{u.kycVerified ? "Verified" : "Not verified"}</td>
              <td>
                {u.flags && u.flags.afterDarkAccess ? (
                  <div>
                    <div>Granted</div>
                    {u.flags.afterDarkAttestation && (
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {u.flags.afterDarkAttestation.provider || "provider"} —{" "}
                        {u.flags.afterDarkAttestation.attestedAt
                          ? new Date(u.flags.afterDarkAttestation.attestedAt).toLocaleString()
                          : ""}
                      </div>
                    )}
                  </div>
                ) : (
                  "None"
                )}
              </td>
              <td style={{ display: "flex", gap: 8 }}>
                <button onClick={() => toggleKyc(u.id, !!u.kycVerified)}>
                  {u.kycVerified ? "Revoke KYC" : "Verify KYC"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/admin/users/${u.id}/afterdark-access`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        body: JSON.stringify({ granted: !(u.flags && u.flags.afterDarkAccess) }),
                      });
                      if (!res.ok) throw new Error("Failed to update");
                      const json = await res.json();
                      setUsers(list => list.map(x => (x.id === u.id ? json.user : x)));
                    } catch (err) {
                      setError(err.message || "Error");
                    }
                  }}
                >
                  {u.flags && u.flags.afterDarkAccess ? "Revoke Access" : "Grant Access"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
