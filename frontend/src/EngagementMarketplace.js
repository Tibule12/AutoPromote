import React, { useState, useEffect } from "react";
import "./EngagementMarketplace.css";
import { auth } from "./firebaseClient";
// import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore"; // Hook up later

/* 
  BILLIONAIRE STRATEGY: 
  This marketplace simulates scarcity. 
  Users bid "Growth Credits" to get their content pushed to the top of the queue.
*/

const MOCK_LIVE_AUCTIONS = [
  { id: 1, niche: "Tech & AI", currentBid: 450, timeLeft: 120, bidders: 12 },
  { id: 2, niche: "Lifestyle", currentBid: 320, timeLeft: 45, bidders: 8 },
  { id: 3, niche: "Gaming", currentBid: 890, timeLeft: 300, bidders: 24 },
];

const EngagementMarketplace = () => {
  const [auctions, setAuctions] = useState(MOCK_LIVE_AUCTIONS);
  const [userCredits, setUserCredits] = useState(1000); // Mock credits for now
  const [selectedAuction, setSelectedAuction] = useState(null);

  useEffect(() => {
    // Simulate live ticking
    const interval = setInterval(() => {
      setAuctions(prev =>
        prev.map(auc => ({
          ...auc,
          timeLeft: auc.timeLeft > 0 ? auc.timeLeft - 1 : 0,
          currentBid:
            auc.timeLeft > 0 && Math.random() > 0.7
              ? auc.currentBid + Math.floor(Math.random() * 50)
              : auc.currentBid,
        }))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleBid = auctionId => {
    const auction = auctions.find(a => a.id === auctionId);
    if (!auction) return;

    if (userCredits < auction.currentBid + 10) {
      alert("Insufficient Growth Credits! Upgrade to participate.");
      return;
    }

    // Deduct credits (Mock)
    setUserCredits(prev => prev - (auction.currentBid + 10)); // Bid +10 increment

    // Update auction locally
    setAuctions(prev =>
      prev.map(a =>
        a.id === auctionId
          ? {
              ...a,
              currentBid: a.currentBid + 10,
              bidders: a.bidders + 1,
            }
          : a
      )
    );
  };

  return (
    <div className="marketplace-container">
      <header className="marketplace-header">
        <h1>🚀 Engagement Marketplace</h1>
        <div className="credits-display">
          <span className="scarcity-icon">💎</span>
          <span>{userCredits} Growth Credits</span>
        </div>
      </header>

      <div className="marketplace-grid">
        {/* Active Bidding Wars */}
        <section className="auction-section">
          <h2>🔥 Live Bidding Wars</h2>
          <p className="subtitle">Win top placement in daily engagement pools.</p>

          <div className="auction-list">
            {auctions.map(auction => (
              <div
                key={auction.id}
                className={`auction-card ${auction.timeLeft < 60 ? "urgent" : ""}`}
              >
                <div className="auction-header">
                  <h3>{auction.niche}</h3>
                  <span className="live-badge">LIVE</span>
                </div>
                <div className="auction-stats">
                  <div className="stat">
                    <label>Current Bid</label>
                    <span className="price">{auction.currentBid} Credits</span>
                  </div>
                  <div className="stat">
                    <label>Time Left</label>
                    <span className="time">{formatTime(auction.timeLeft)}</span>
                  </div>
                  <div className="stat">
                    <label>Bidders</label>
                    <span>{auction.bidders}</span>
                  </div>
                </div>
                <button
                  className="bid-button"
                  onClick={() => handleBid(auction.id)}
                  disabled={auction.timeLeft === 0}
                >
                  {auction.timeLeft === 0 ? "ENDED" : `Bid ${auction.currentBid + 10}`}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Redemption Center */}
        <section className="redemption-section">
          <h2>💰 Redeem Credits</h2>
          <div className="redemption-options">
            <div className="redeem-card">
              <h3>1-Day Viral Boost</h3>
              <p>Get 2x exposure on your next post.</p>
              <span className="cost">500 Credits</span>
              <button className="redeem-btn">Redeem</button>
            </div>
            <div className="redeem-card">
              <h3>Content Audit</h3>
              <p>AI analysis of your last 5 videos.</p>
              <span className="cost">200 Credits</span>
              <button className="redeem-btn">Redeem</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const formatTime = seconds => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

export default EngagementMarketplace;
