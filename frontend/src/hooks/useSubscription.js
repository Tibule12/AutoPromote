import { useContext, useEffect, useState, useCallback } from 'react';
import AuthContext from '../contexts/AuthContext';
import { API_BASE_URL } from '../config'; // Adjust path

export function useSubscription() {
  const { user, profile, refreshProfile, getToken } = useContext(AuthContext);
  const [capabilities, setCapabilities] = useState(null);
  const [credits, setCredits] = useState({ total: 0, monthlyRemaining: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const updateCapabilities = useCallback((profileData) => {
    if (!profileData) {
      setCapabilities(null);
      setCredits({ total: 0, monthlyRemaining: 0 });
      return;
    }

    const planId = profileData.planId || 'free';
    const isFree = planId === 'free';
    const isPremium = planId === 'premium';
    const isPro = planId === 'pro' || planId === 'enterprise';
    const multicamAllowed = profileData.features?.multicam || false;
    const teamSeats = profileData.features?.teamSeats || 1;
    const creditsTotal = profileData.totalCredits || 0;
    const monthlyRemaining = profileData.monthlyCredits?.remaining || 0;
    const lowCredits = monthlyRemaining < 20 && !isPro;

    setCapabilities({
      planId,
      planName: profileData.planName || 'Free',
      tierName: profileData.tierName || 'Starter',
      isFree,
      isPremium,
      isPro,
      multicamAllowed,
      teamSeats,
      lowCredits,
      subscriptionStatus: profileData.subscriptionStatus || 'inactive',
    });
    setCredits({
      total: creditsTotal,
      monthlyRemaining,
      topUpBalance: profileData.topUpBalance || 0,
    });
    setLoading(false);
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const token = await getToken(true);
      if (!token) throw new Error('No auth token');

      const response = await fetch(`${API_BASE_URL}/api/media/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          updateCapabilities({ ...profile, ...data });
        }
      } else {
        await refreshProfile();
      }
    } catch (err) {
      setError(err.message);
      console.warn('Subscription refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, profile, refreshProfile, updateCapabilities]);

  useEffect(() => {
    if (profile) {
      updateCapabilities(profile);
    } else if (user) {
      refreshCredits();
    } else {
      setCapabilities(null);
      setLoading(false);
    }
  }, [profile, user, refreshCredits, updateCapabilities]);

  // Auto-refresh credits every 30s if low
  useEffect(() => {
    if (!capabilities || !capabilities.lowCredits) return;
    const interval = setInterval(refreshCredits, 30000);
    return () => clearInterval(interval);
  }, [capabilities, refreshCredits]);

  return {
    capabilities,
    credits,
    loading,
    error,
    refresh: refreshCredits,
    hasCredits: credits.total > 0,
    canUseFeature: (feature) => {
      switch (feature) {
        case 'multicam': return capabilities?.multicamAllowed || false;
        case 'watermarkRemoval': return !capabilities?.isFree;
        case 'audioExtract': return !capabilities?.isFree;
        case 'silenceRemoval': return true; // Free ok
        default: return true;
      }
    },
    requiresUpgrade: (minCredits = 10) => credits.monthlyRemaining < minCredits && capabilities?.isFree,
  };
}
