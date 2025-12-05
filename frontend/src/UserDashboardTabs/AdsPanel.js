import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient';
import { API_ENDPOINTS } from '../config';
import toast from 'react-hot-toast';

const AdsPanel = () => {
  const [activeTab, setActiveTab] = useState('platform'); // 'platform' or 'external'
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Ad creation form state
  const [adForm, setAdForm] = useState({
    type: 'platform', // 'platform' or 'external'
    adType: 'sponsored_content', // sponsored_content, banner, video, product
    title: '',
    description: '',
    imageUrl: '',
    videoUrl: '',
    targetUrl: '',
    callToAction: 'Learn More',
    budget: 50,
    duration: 7, // days
    targeting: {
      platforms: [],
      demographics: {
        ageMin: 18,
        ageMax: 65,
        locations: [],
        interests: []
      }
    },
    externalPlatform: 'facebook', // facebook, instagram, google, youtube, tiktok, twitter, linkedin, snapchat, reddit, pinterest, spotify, discord, telegram
    status: 'draft'
  });

  useEffect(() => {
    loadAds();
  }, [activeTab]);

  const loadAds = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;
      
      const token = await user.getIdToken();
      const res = await fetch(`${API_ENDPOINTS.ADS}?type=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setAds(data.ads || []);
      }
    } catch (err) {
      console.error('Failed to load ads:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAd = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('Please sign in to create ads');
        return;
      }

      if (!adForm.title || !adForm.description) {
        toast.error('Please fill in all required fields');
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch(API_ENDPOINTS.ADS, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(adForm)
      });

      if (res.ok) {
        const data = await res.json();
        toast.success('Ad created successfully!');
        setShowCreateModal(false);
        resetAdForm();
        loadAds();
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to create ad');
      }
    } catch (err) {
      console.error('Error creating ad:', err);
      toast.error('Failed to create ad');
    }
  };

  const handleLaunchAd = async (adId) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const res = await fetch(`${API_ENDPOINTS.ADS}/${adId}/launch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Ad launched successfully!');
        loadAds();
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to launch ad');
      }
    } catch (err) {
      console.error('Error launching ad:', err);
      toast.error('Failed to launch ad');
    }
  };

  const handlePauseAd = async (adId) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const res = await fetch(`${API_ENDPOINTS.ADS}/${adId}/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Ad paused');
        loadAds();
      }
    } catch (err) {
      console.error('Error pausing ad:', err);
      toast.error('Failed to pause ad');
    }
  };

  const resetAdForm = () => {
    setAdForm({
      type: activeTab === 'platform' ? 'platform' : 'external',
      adType: 'sponsored_content',
      title: '',
      description: '',
      imageUrl: '',
      videoUrl: '',
      targetUrl: '',
      callToAction: 'Learn More',
      budget: 50,
      duration: 7,
      targeting: {
        platforms: [],
        demographics: {
          ageMin: 18,
          ageMax: 65,
          locations: [],
          interests: []
        }
      },
      externalPlatform: 'facebook',
      status: 'draft'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getAdStatusBadge = (status) => {
    const statusColors = {
      draft: '#6b7280',
      active: '#10b981',
      paused: '#f59e0b',
      completed: '#3b82f6',
      rejected: '#ef4444'
    };
    
    return (
      <span style={{
        backgroundColor: statusColors[status] || '#6b7280',
        color: 'white',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '600',
        textTransform: 'uppercase'
      }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#fff', marginBottom: '0.5rem', fontSize: '1.875rem', fontWeight: 'bold' }}>
          Ad Campaign Manager
        </h2>
        <p style={{ color: '#9ca3af', fontSize: '1rem' }}>
          Create and manage ads on AutoPromote or external platforms
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={() => { setActiveTab('platform'); resetAdForm(); }}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            border: 'none',
            color: activeTab === 'platform' ? '#3b82f6' : '#9ca3af',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom: activeTab === 'platform' ? '3px solid #3b82f6' : '3px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          AutoPromote Ads
        </button>
        <button
          onClick={() => { setActiveTab('external'); resetAdForm(); }}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            border: 'none',
            color: activeTab === 'external' ? '#3b82f6' : '#9ca3af',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom: activeTab === 'external' ? '3px solid #3b82f6' : '3px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          External Platform Ads
        </button>
      </div>

      {/* Create Ad Button */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => {
            setAdForm({ ...adForm, type: activeTab });
            setShowCreateModal(true);
          }}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          + Create New Ad
        </button>
      </div>

      {/* Ads List */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>
          Loading ads...
        </div>
      ) : ads.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📢</div>
          <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>No ads yet</h3>
          <p style={{ color: '#9ca3af' }}>
            {activeTab === 'platform' 
              ? 'Create your first ad to promote on AutoPromote'
              : 'Create your first external platform ad campaign'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {ads.map((ad) => (
            <div
              key={ad.id}
              style={{
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ color: '#fff', fontSize: '1.25rem', margin: 0 }}>{ad.title}</h3>
                    {getAdStatusBadge(ad.status)}
                  </div>
                  <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{ad.description}</p>
                  {ad.type === 'external' && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{
                        background: 'rgba(59, 130, 246, 0.2)',
                        color: '#60a5fa',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {ad.externalPlatform?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                
                {ad.imageUrl && (
                  <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    style={{
                      width: '120px',
                      height: '80px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      marginLeft: '1rem'
                    }}
                  />
                )}
              </div>

              {/* Ad Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Budget</div>
                  <div style={{ color: '#fff', fontSize: '1.125rem', fontWeight: '600' }}>
                    {formatCurrency(ad.budget)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Spent</div>
                  <div style={{ color: '#fff', fontSize: '1.125rem', fontWeight: '600' }}>
                    {formatCurrency(ad.spent || 0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Impressions</div>
                  <div style={{ color: '#fff', fontSize: '1.125rem', fontWeight: '600' }}>
                    {(ad.impressions || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Clicks</div>
                  <div style={{ color: '#fff', fontSize: '1.125rem', fontWeight: '600' }}>
                    {(ad.clicks || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>CTR</div>
                  <div style={{ color: '#fff', fontSize: '1.125rem', fontWeight: '600' }}>
                    {ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00'}%
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {ad.status === 'draft' && (
                  <button
                    onClick={() => handleLaunchAd(ad.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#10b981',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Launch Ad
                  </button>
                )}
                {ad.status === 'active' && (
                  <button
                    onClick={() => handlePauseAd(ad.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#f59e0b',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Pause Ad
                  </button>
                )}
                <button
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  View Analytics
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Ad Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
              Create {activeTab === 'platform' ? 'AutoPromote' : 'External Platform'} Ad
            </h3>

            {/* Ad Type Selection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                Ad Type *
              </label>
              <select
                value={adForm.adType}
                onChange={(e) => setAdForm({ ...adForm, adType: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem'
                }}
              >
                <option value="sponsored_content">Sponsored Content</option>
                <option value="banner">Banner Ad</option>
                <option value="video">Video Ad</option>
                <option value="product">Product Ad</option>
              </select>
            </div>

            {activeTab === 'external' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Target Platform *
                </label>
                <select
                  value={adForm.externalPlatform}
                  onChange={(e) => setAdForm({ ...adForm, externalPlatform: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                >
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="google">Google Ads</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="snapchat">Snapchat</option>
                  <option value="reddit">Reddit</option>
                  <option value="pinterest">Pinterest</option>
                  <option value="spotify">Spotify</option>
                  <option value="discord">Discord</option>
                  <option value="telegram">Telegram</option>
                </select>
              </div>
            )}

            {/* Title */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                Ad Title *
              </label>
              <input
                type="text"
                value={adForm.title}
                onChange={(e) => setAdForm({ ...adForm, title: e.target.value })}
                placeholder="Enter ad title"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                Description *
              </label>
              <textarea
                value={adForm.description}
                onChange={(e) => setAdForm({ ...adForm, description: e.target.value })}
                placeholder="Enter ad description"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Image URL */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                Image URL
              </label>
              <input
                type="url"
                value={adForm.imageUrl}
                onChange={(e) => setAdForm({ ...adForm, imageUrl: e.target.value })}
                placeholder="https://example.com/image.jpg"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Target URL */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                Target URL
              </label>
              <input
                type="url"
                value={adForm.targetUrl}
                onChange={(e) => setAdForm({ ...adForm, targetUrl: e.target.value })}
                placeholder="https://yoursite.com/landing-page"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Platform Targeting (for platform ads) */}
            {adForm.type === 'platform' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Target Platforms
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                  {['facebook', 'instagram', 'youtube', 'tiktok', 'twitter', 'linkedin', 'snapchat', 'reddit', 'pinterest', 'spotify', 'discord', 'telegram'].map(platform => (
                    <label key={platform} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <input
                        type="checkbox"
                        checked={adForm.targeting.platforms.includes(platform)}
                        onChange={(e) => {
                          const platforms = e.target.checked
                            ? [...adForm.targeting.platforms, platform]
                            : adForm.targeting.platforms.filter(p => p !== platform);
                          setAdForm({ ...adForm, targeting: { ...adForm.targeting, platforms } });
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: '#cbd5e1', fontSize: '0.875rem', textTransform: 'capitalize' }}>
                        {platform}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Budget and Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Budget (USD) *
                </label>
                <input
                  type="number"
                  value={adForm.budget}
                  onChange={(e) => setAdForm({ ...adForm, budget: parseFloat(e.target.value) })}
                  min="1"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div>
                <label style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Duration (days) *
                </label>
                <input
                  type="number"
                  value={adForm.duration}
                  onChange={(e) => setAdForm({ ...adForm, duration: parseInt(e.target.value) })}
                  min="1"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowCreateModal(false); resetAdForm(); }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAd}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Create Ad
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdsPanel;
