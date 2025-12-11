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

    // Detect return from PayPal (e.g., /dashboard?payment=success or ?payment=cancelled)
    try {
      const params = new URLSearchParams(window.location.search);
      const payment = params.get('payment');
      const subscriptionParam = params.get('subscriptionId') || params.get('subscription_id') || params.get('token') || params.get('id');
      if (payment === 'success') {
        // If we have a subscriptionId parameter, try to activate it on the server
        if (subscriptionParam) {
          activateSubscription(subscriptionParam);
        } else {
          // Without subscription id, still refresh status
          fetchCurrentSubscription();
        }
        // Remove query params to clean URL after handling
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch (e) {
      // ignore
    }
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
      const endpointsToTry = [
        `${API_BASE_URL || window.location.origin}/api/paypal-subscriptions/status`,
        `https://autopromote.org/api/paypal-subscriptions/status`
      ];
      let parsed = null;
      let lastError = null;
      for (const endpoint of endpointsToTry) {
        try {
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(endpoint, { headers });
          parsed = await parseJsonSafe(res);
          if (parsed && parsed.ok && parsed.json) {
            // Report which endpoint succeeded
            console.log('[PayPal] subscription status fetched from', endpoint);
            break;
          }
          // If endpoint returned 404, keep trying others
          if (parsed && parsed.status === 404) {
            lastError = { endpoint, status: 404 };
            continue;
          }
          // Some other error; capture and continue
          lastError = { endpoint, status: parsed.status || 'error', detail: parsed.error || parsed.textPreview };
        } catch (e) {
          lastError = { endpoint, error: e.message };
        }
      }
      if (parsed && parsed.ok && parsed.json) {
        setCurrentSubscription(parsed.json.subscription);
      } else if (parsed && parsed.status === 404) {
        // No subscription found on this host; try canonical site as a fallback
        try {
          const fallbackRes = await fetch(`https://autopromote.org/api/paypal-subscriptions/status`, { headers: { Authorization: `Bearer ${token}` } });
          const fallbackParsed = await parseJsonSafe(fallbackRes);
          if (fallbackParsed.ok && fallbackParsed.json) {
            setCurrentSubscription(fallbackParsed.json.subscription);
          } else {
            setCurrentSubscription({ planId: 'free', planName: 'Free', status: 'active', features: {} });
            // Inform user non-intrusively and include endpoint info
            toast(`Could not load subscription status (${lastError?.endpoint || 'unknown'}); using free plan`, { icon: 'ℹ️' });
          }
        } catch (e) {
          setCurrentSubscription({ planId: 'free', planName: 'Free', status: 'active', features: {} });
          toast(`Could not load subscription status (${lastError?.endpoint || 'unknown'}); using free plan`, { icon: 'ℹ️' });
        }
      } else if (!parsed.ok) {
        // In case the route returns 401/403 or other errors, fall back to free plan so UI doesn't crash
        console.warn('PayPal subscription API returned error or non-JSON response', { status: parsed.status, preview: parsed.textPreview || parsed.error });
        setCurrentSubscription({ planId: 'free', planName: 'Free', status: 'active', features: {} });
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
      if (!token) {
        // No token — user not logged in or not yet initialized. Skip usage fetch.
        setUsage(null);
        return;
      }
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

    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error('Please sign in to upgrade');
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken(true);
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/create-subscription`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          planId,
          returnUrl: `${window.location.origin}/dashboard?payment=success`,
          cancelUrl: `${window.location.origin}/dashboard?payment=cancelled`
        })
      });

      const parsed = await parseJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          toast.error('Please sign in to upgrade');
          return;
        }
        console.error('Failed to create subscription:', parsed);
        const errorMessage = (parsed && parsed.json && parsed.json.error) || parsed?.error || parsed?.textPreview || 'Failed to create subscription';
        toast.error(errorMessage);
        return;
      }

      const data = parsed.json || null;
      if (data && data.approvalUrl) {
        const approvalUrl = data.approvalUrl;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        toast.success('Opening PayPal...');
        if (isMobile) {
          window.location.href = approvalUrl;
        } else {
          window.open(approvalUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        console.warn('Create subscription returned no approval URL:', parsed);
        toast.error('Could not obtain an approval link; please try again or contact support');
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      toast.error('Failed to process subscription');
    } finally {
      setProcessing(false);
    }
  };

  const activateSubscription = async (subscriptionId) => {
    if (!subscriptionId) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error('Please sign in to activate your subscription');
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken(true);
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/activate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subscriptionId })
      });
      const parsed = await parseJsonSafe(res);
      if (res.ok && parsed.ok) {
        toast.success(parsed.json?.message || 'Subscription activated');
        fetchCurrentSubscription();
      } else {
        console.error('Activation failed:', parsed);
        toast.error((parsed && parsed.json && parsed.json.error) || 'Failed to activate subscription');
      }
    } catch (e) {
      console.error('Activation error:', e);
      toast.error('Failed to activate subscription');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You\'ll retain access until the end of your billing period.')) {
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error('Please sign in to cancel your subscription');
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken(true);
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'User requested cancellation' })
      });

      if (res.ok) {
        toast.success('Subscription cancelled successfully');
        fetchCurrentSubscription();
      } else {
        const parsed = await parseJsonSafe(res);
        toast.error((parsed && parsed.json && parsed.json.error) || 'Failed to cancel subscription');
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
