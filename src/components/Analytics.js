import React, { useState, useEffect, useCallback } from 'react';

const Analytics = ({ user, token, onBack }) => {
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedContent, setSelectedContent] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      // First get user's content
      const contentResponse = await fetch('http://localhost:5000/api/content', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (contentResponse.ok) {
        const contentData = await contentResponse.json();
        
        // Get analytics for each content item
        const analyticsPromises = contentData.map(async (content) => {
          try {
            const analyticsResponse = await fetch(`http://localhost:5000/api/analytics/${content._id}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (analyticsResponse.ok) {
              const analyticsData = await analyticsResponse.json();
              return {
                ...content,
                analytics: analyticsData
              };
            } else {
              return {
                ...content,
                analytics: null
              };
            }
          } catch (error) {
            return {
              ...content,
              analytics: null
            };
          }
        });

        const analyticsData = await Promise.all(analyticsPromises);
        setAnalytics(analyticsData);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const getTotalStats = () => {
    const totals = {
      views: 0,
      engagement: 0,
      revenue: 0,
      contentCount: analytics.length
    };

    analytics.forEach(item => {
      if (item.analytics) {
        totals.views += item.analytics.views || 0;
        totals.engagement += item.analytics.engagement || 0;
        totals.revenue += item.analytics.revenue || 0;
      }
    });

    return totals;
  };

  const totals = getTotalStats();

  return (
    <div className="analytics">
      <header className="App-header">
        <h1>Analytics Dashboard</h1>
        <nav>
          <button onClick={onBack}>Back to Dashboard</button>
        </nav>
      </header>

      <main>
        {loading ? (
          <div className="loading">Loading analytics...</div>
        ) : (
          <>
            <div className="overview-stats">
              <h2>Overview</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>{totals.contentCount}</h3>
                  <p>Content Items</p>
                </div>
                <div className="stat-card">
                  <h3>{totals.views.toLocaleString()}</h3>
                  <p>Total Views</p>
                </div>
                <div className="stat-card">
                  <h3>${totals.revenue.toFixed(2)}</h3>
                  <p>Total Revenue</p>
                </div>
                <div className="stat-card">
                  <h3>{totals.engagement.toFixed(1)}%</h3>
                  <p>Avg Engagement</p>
                </div>
              </div>
            </div>

            <div className="content-analytics">
              <h2>Content Performance</h2>
              {analytics.length === 0 ? (
                <p>No content with analytics data yet.</p>
              ) : (
                <div className="analytics-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Views</th>
                        <th>Engagement</th>
                        <th>Revenue</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.map((item) => (
                        <tr key={item._id}>
                          <td>{item.title}</td>
                          <td>{item.type}</td>
                          <td>{item.analytics?.views || 0}</td>
                          <td>{item.analytics?.engagement ? `${item.analytics.engagement}%` : 'N/A'}</td>
                          <td>${item.analytics?.revenue?.toFixed(2) || '0.00'}</td>
                          <td>
                            <button 
                              onClick={() => setSelectedContent(selectedContent === item._id ? null : item._id)}
                              className="details-btn"
                            >
                              {selectedContent === item._id ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedContent && (
              <div className="analytics-detail">
                <h3>Detailed Analytics</h3>
                <p>Detailed analytics view would show trends, audience demographics, and performance metrics over time.</p>
                {/* Future enhancement: Add charts and detailed analytics */}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Analytics;
