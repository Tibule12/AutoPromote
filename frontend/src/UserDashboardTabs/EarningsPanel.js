import React from 'react';

const EarningsPanel = ({ earnings, onClaim }) => {
  return (
    <section className="earnings-panel">
      <h3>Earnings</h3>
      {earnings ? (
        <div>
          <div><strong>Available:</strong> ${earnings.available || 0}</div>
          <div><strong>Pending:</strong> ${earnings.pending || 0}</div>
          <div style={{ marginTop: '.5rem' }}>
            <button className="check-quality" onClick={onClaim}>Request Payout</button>
          </div>
        </div>
      ) : (
        <div style={{ color: '#9aa4b2' }}>Loading...</div>
      )}
    </section>
  );
};

export default EarningsPanel;
