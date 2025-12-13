import React, { useEffect, useState } from 'react';
import AdminTable from './AdminTable';
import { ADMIN_ENDPOINTS } from '../config';
import { auth } from '../firebaseClient';
import '../AdminDashboard.css';

const AdminPayoutsPanel = ({ token }) => {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const fetchPayouts = async () => {
    setLoading(true);
    setError(null);
    try {
      let tokenHeader = {};
      try { const idToken = auth.currentUser ? await auth.currentUser.getIdToken(true) : null; if (idToken) tokenHeader = { Authorization: `Bearer ${idToken}` }; } catch (_) { tokenHeader = {}; }
      const res = await fetch(`${ADMIN_ENDPOINTS.payouts}?status=pending&limit=200`, { headers: tokenHeader });
      const json = await res.json();
      if (json && json.items) setPayouts(json.items);
      else setPayouts([]);
    } catch (e) {
      setError(e.message || 'Failed to fetch payouts');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchPayouts(); // eslint-disable-next-line react-hooks/exhaustive-deps }, []);

  const handleView = (p) => setSelected(p);
  const handleProcess = async (p) => {
    if (!confirm(`Process payout ${p.id} to ${p.payee?.paypalEmail || 'unknown'} for $${p.amount}?`)) return;
    try {
      let tokenHeader = {};
      try { const idToken = auth.currentUser ? await auth.currentUser.getIdToken(true) : null; if (idToken) tokenHeader = { Authorization: `Bearer ${idToken}` }; } catch (_) { tokenHeader = {}; }
      const res = await fetch(ADMIN_ENDPOINTS.payoutProcess(p.id), { method: 'POST', headers: tokenHeader });
      const json = await res.json();
      if (json.success) {
        alert('Payout processed (dry-run if payouts not enabled)');
        fetchPayouts();
      } else {
        alert('Failed to process payout: ' + (json.error || 'unknown'));
      }
    } catch (e) { alert('Failed to process payout: ' + e.message); }
  };

  const columns = [
    { header: 'ID', accessor: 'id' },
    { header: 'User', accessor: 'userId' },
    { header: 'Amount', accessor: 'amount', render: r => `$${(r.amount || 0).toFixed(2)}` },
    { header: 'Requested', accessor: 'requestedAt', render: r => new Date(r.requestedAt).toLocaleString() },
    { header: 'Status', accessor: 'status' },
    { header: 'Actions', render: r => (
      <div style={{ display:'flex', gap: 8 }}>
        <button onClick={() => handleView(r)}>View</button>
        <button onClick={() => handleProcess(r)}>Process</button>
      </div>
    ) }
  ];

  return (
    <div>
      <h3>Payouts</h3>
      {loading && <div>Loading...</div>}
      {error && <div className="error">{error}</div>}
      <AdminTable data={payouts} columns={columns} title="Pending payouts" />
      {selected && (
        <div className="overlay">
          <div className="modal">
            <h4>Payout {selected.id}</h4>
            <pre>{JSON.stringify(selected, null, 2)}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSelected(null)}>Close</button>
              <button onClick={() => handleProcess(selected)}>Process</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayoutsPanel;
