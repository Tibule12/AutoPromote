// PayPalSubscriptionPanel.js
// PayPal subscription management component

import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient';
import { parseJsonSafe } from '../utils/parseJsonSafe';
import { API_BASE_URL } from '../config';
import toast from 'react-hot-toast';
import './PayPalSubscriptionPanel.css';

const PayPalSubscriptionPanel = () => {
  const [plans, setPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchCurrentSubscription();
    fetchUsage();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/plans`);
      const parsed = await parseJsonSafe(res);
      if (parsed.ok && parsed.json && Array.isArray(parsed.json.plans)) {
        setPlans(parsed.json.plans || []);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const fetchCurrentSubscription = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const parsed = await parseJsonSafe(res);
      if (parsed.ok && parsed.json) {
        setCurrentSubscription(parsed.json.subscription);
      } else if (parsed.status === 404) {
        // No subscription found; clear currentSubscription
        setCurrentSubscription(null);
      } else {
        console.warn('PayPal subscription API returned error or non-JSON response', { status: parsed.status, preview: parsed.textPreview || parsed.error });
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setLoading(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/usage`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const parsed = await parseJsonSafe(res);
      if (parsed.ok && parsed.json) {
        setUsage(parsed.json.usage);
      }
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  const handleSubscribe = async (planId) => {
    if (processing) return;
    
    setProcessing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          planId,
          returnUrl: `${window.location.origin}/dashboard?payment=success`,
          cancelUrl: `${window.location.origin}/dashboard?payment=cancelled`
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.approvalUrl) {
          // Redirect to PayPal for approval
          window.location.href = data.approvalUrl;
        }
      } else {
        toast.error('Failed to create subscription');
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      toast.error('Failed to process subscription');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You\'ll retain access until the end of your billing period.')) {
      return;
    }

    setProcessing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: 'User requested cancellation' })
      });

      if (res.ok) {
        toast.success('Subscription cancelled successfully');
        fetchCurrentSubscription();
      } else {
        toast.error('Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast.error('Failed to cancel subscription');
    } finally {
      setProcessing(false);
    }
  };

  const getFeatureIcon = (feature) => {
    const icons = {
      uploads: '📤',
      communityPosts: '📝',
      aiClips: '🤖',
      analytics: '📊',
      support: '🎧',
      watermark: '💧',
      viralBoost: '🚀',
      priorityModeration: '⚡',
      creatorTipping: '💰',
      sponsoredPosts: '📢',
      apiAccess: '🔌',
      teamSeats: '👥',
      whiteLabel: '🎨'
    };
    return icons[feature] || '✨';
  };

  const renderFeatureValue = (key, value) => {
    if (typeof value === 'boolean') {
      return value ? '✅ Included' : '❌ Not included';
    }
    if (value === 'unlimited') {
      return '♾️ Unlimited';
    }
    if (typeof value === 'number') {
      return `${value} ${key === 'teamSeats' ? 'seats' : 'per month'}`;
    }
    return value;
  };

  const renderUsageBar = (used, limit, unlimited) => {
    if (unlimited) {
      return (
        <div className="usage-bar">
          <div className="usage-bar-fill unlimited" style={{ width: '100%' }} />
          <span className="usage-text">♾️ Unlimited</span>
        </div>
      );
    }

    const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const isOverLimit = used > limit;

    return (
      <div className="usage-bar">
        <div 
          className={`usage-bar-fill ${isOverLimit ? 'over-limit' : ''}`} 
          style={{ width: `${percentage}%` }} 
        />
        <span className="usage-text">
          {used} / {limit} used {isOverLimit && '⚠️'}
        </span>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading subscription details...</div>;
  }

  const currentPlan = plans.find(p => p.id === currentSubscription?.planId) || plans[0];

  return (
    <div className="paypal-subscription-panel">
      <h2>💳 Subscription & Billing</h2>

      {/* Current Subscription Status */}
      {currentSubscription && (
        <div className="current-subscription-card">
          <div className="subscription-header">
            <div>
              <h3>{currentSubscription.planName} Plan</h3>
              <span className={`status-badge ${currentSubscription.status}`}>
                {currentSubscription.status === 'active' ? '✅ Active' : 
                 currentSubscription.status === 'cancelled' ? '⚠️ Cancelled' :
                 '⏸️ ' + currentSubscription.status}
              </span>
            </div>
            {currentSubscription.amount > 0 && (
              <div className="subscription-price">
                <span className="price">${currentSubscription.amount}</span>
                <span className="period">/month</span>
              </div>
            )}
          </div>

          {currentSubscription.nextBillingDate && currentSubscription.status === 'active' && (
            <p className="billing-date">
              Next billing: {new Date(currentSubscription.nextBillingDate).toLocaleDateString()}
            </p>
          )}

          {currentSubscription.expiresAt && currentSubscription.status === 'cancelled' && (
            <p className="expiry-date">
              Access expires: {new Date(currentSubscription.expiresAt).toLocaleDateString()}
            </p>
          )}

          {currentSubscription.status === 'active' && currentSubscription.planId !== 'free' && (
            <button 
              className="cancel-btn" 
              onClick={handleCancelSubscription}
              disabled={processing}
            >
              Cancel Subscription
            </button>
          )}
        </div>
      )}

      {/* Usage Stats */}
      {usage && (
        <div className="usage-section">
          <h3>📊 Usage This Period</h3>
          <p className="period-info">
            Period: {new Date(usage.periodStart).toLocaleDateString()} - 
            {usage.periodEnd ? new Date(usage.periodEnd).toLocaleDateString() : 'Ongoing'}
          </p>

          <div className="usage-grid">
            <div className="usage-item">
              <label>📤 Uploads</label>
              {renderUsageBar(usage.uploads.used, usage.uploads.limit, usage.uploads.unlimited)}
            </div>

            <div className="usage-item">
              <label>📝 Community Posts</label>
              {renderUsageBar(
                usage.communityPosts.used, 
                usage.communityPosts.limit, 
                usage.communityPosts.unlimited
              )}
            </div>

            <div className="usage-item">
              <label>🚀 Viral Boosts</label>
              {renderUsageBar(
                usage.viralBoosts.used, 
                usage.viralBoosts.limit, 
                usage.viralBoosts.unlimited
              )}
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div className="plans-section">
        <h3>💎 Available Plans</h3>
        <div className="plans-grid">
          {plans.map(plan => {
            const isCurrent = plan.id === currentSubscription?.planId;
            
            return (
              <div 
                key={plan.id} 
                className={`plan-card ${isCurrent ? 'current-plan' : ''} ${plan.id === 'pro' ? 'recommended' : ''}`}
              >
                {plan.id === 'pro' && <span className="recommended-badge">⭐ Most Popular</span>}
                
                <h4>{plan.name}</h4>
                
                <div className="plan-price">
                  {plan.price === 0 ? (
                    <span className="free-label">Free Forever</span>
                  ) : (
                    <>
                      <span className="price">${plan.price}</span>
                      <span className="period">/month</span>
                    </>
                  )}
                </div>

                <div className="plan-features">
                  {Object.entries(plan.features).map(([key, value]) => (
                    <div key={key} className="feature-item">
                      <span className="feature-icon">{getFeatureIcon(key)}</span>
                      <span className="feature-name">
                        {key.replace(/([A-Z])/g, ' $1').trim()}:
                      </span>
                      <span className="feature-value">{renderFeatureValue(key, value)}</span>
                    </div>
                  ))}
                </div>

                {!isCurrent && plan.id !== 'free' && (
                  <button
                    className="subscribe-btn"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={processing}
                  >
                    {processing ? 'Processing...' : `Upgrade to ${plan.name}`}
                  </button>
                )}

                {isCurrent && (
                  <div className="current-plan-badge">
                    ✅ Your Current Plan
                  </div>
                )}

                {plan.id === 'free' && currentSubscription?.planId !== 'free' && (
                  <div className="downgrade-note">
                    Cancel your subscription to return to free tier
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PayPal Secure Badge */}
      <div className="secure-payment-badge">
        <img 
          src="https://www.paypalobjects.com/webstatic/mktg/logo/PP_AcceptanceMarkTray_150x40.png" 
          alt="PayPal" 
        />
        <p>Secure payments powered by PayPal</p>
      </div>
    </div>
  );
};

export default PayPalSubscriptionPanel;
