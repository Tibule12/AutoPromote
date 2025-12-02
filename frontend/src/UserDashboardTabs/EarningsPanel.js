import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient';
import { API_ENDPOINTS } from '../config';

const EarningsPanel = ({ earnings, onClaim }) => {
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayoutHistory();
  }, []);

  const loadPayoutHistory = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken(true);
      
      const res = await fetch(API_ENDPOINTS.EARNINGS_PAYOUTS, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setPayoutHistory(data.payouts || []);
      }
    } catch (e) {
      console.warn('Failed to load payout history:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="earnings-panel">
      <h3>Earnings</h3>
      
      {earnings ? (
        <>
          <div className="earnings-summary" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div className="earnings-card" style={{
              background: 'var(--card)',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Available Balance</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>${(earnings.available || 0).toFixed(2)}</div>
              <button 
                className="check-quality" 
                onClick={onClaim}
                disabled={!earnings.available || earnings.available < 10}
                style={{
                  marginTop: '1rem',
                  width: '100%',
                  opacity: earnings.available >= 10 ? 1 : 0.5,
                  cursor: earnings.available >= 10 ? 'pointer' : 'not-allowed'
                }}
              >
                Request Payout
              </button>
              {earnings.available < 10 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                  Minimum payout: $10.00
                </div>
              )}
            </div>

            <div className="earnings-card" style={{
              background: 'var(--card)',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Pending</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>${(earnings.pending || 0).toFixed(2)}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '1rem' }}>
                Processing payouts
              </div>
            </div>

            <div className="earnings-card" style={{
              background: 'var(--card)',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Earned</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--brand)' }}>${((earnings.available || 0) + (earnings.pending || 0) + (earnings.paid || 0)).toFixed(2)}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '1rem' }}>
                Lifetime earnings
              </div>
            </div>
          </div>

          <div className="payout-history" style={{
            background: 'var(--card)',
            padding: '1.5rem',
            borderRadius: '12px',
            border: '1px solid var(--border)'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>Payout History</h4>
            
            {loading ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>Loading...</div>
            ) : payoutHistory && payoutHistory.length > 0 ? (
              <div className="payout-list">
                {payoutHistory.map((payout, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    background: 'var(--bg-2)',
                    borderRadius: '8px',
                    marginBottom: '0.75rem'
                  }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>${(payout.amount || 0).toFixed(2)}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                        {payout.createdAt ? new Date(payout.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                    <div style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      background: payout.status === 'completed' ? '#10b98133' : payout.status === 'pending' ? '#f59e0b33' : '#ef444433',
                      color: payout.status === 'completed' ? '#10b981' : payout.status === 'pending' ? '#f59e0b' : '#ef4444'
                    }}>
                      {payout.status || 'unknown'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>
                No payout history yet. Request your first payout when you reach $10!
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ color: '#9aa4b2' }}>Loading earnings...</div>
      )}
    </section>
  );
};

export default EarningsPanel;
