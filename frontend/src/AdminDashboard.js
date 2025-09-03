import React from 'react';

function AdminDashboard({ analytics, user }) {
  if (!analytics) {
    return (
      <div style={{ marginTop: 24 }}>
        <h2>Admin Dashboard</h2>
        <div>
          <strong>Welcome, {user.name} (Admin)</strong>
        </div>
        <div style={{ marginTop: 16 }}>Loading analytics data...</div>
      </div>
    );
  }

  const StatCard = ({ title, value, subtitle, color = '#1976d2' }) => (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      flex: '1',
      minWidth: '200px',
      margin: '8px'
    }}>
      <h3 style={{ color, marginTop: 0, fontSize: '1.1rem' }}>{title}</h3>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '8px' }}>
        {typeof value === 'number' && title.toLowerCase().includes('revenue') 
          ? `$${value.toFixed(2)}`
          : value}
      </div>
      {subtitle && <div style={{ fontSize: '0.9rem', color: '#666' }}>{subtitle}</div>}
    </div>
  );

  return (
    <div style={{ marginTop: 24, padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
        <div style={{ background: '#1976d2', color: 'white', padding: '8px 16px', borderRadius: '4px' }}>
          <strong>{user.name} (Admin)</strong>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Overview</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-8px' }}>
          <StatCard 
            title="Total Users" 
            value={analytics.totalUsers}
            subtitle={`${analytics.newUsersToday} new today`}
          />
          <StatCard 
            title="Total Content" 
            value={analytics.totalContent}
            subtitle={`${analytics.newContentToday} new today`}
          />
          <StatCard 
            title="Total Revenue" 
            value={analytics.totalRevenue}
            subtitle={`$${analytics.revenueToday} today`}
            color="#2e7d32"
          />
          <StatCard 
            title="Active Promotions" 
            value={analytics.activePromotions}
            subtitle={`${analytics.scheduledPromotions} scheduled`}
            color="#ed6c02"
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>User Engagement</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-8px' }}>
          <StatCard 
            title="Active Users" 
            value={analytics.activeUsers}
            subtitle={`${analytics.activeUsersLastWeek} last week`}
          />
          <StatCard 
            title="Engagement Rate" 
            value={`${(analytics.engagementRate * 100).toFixed(1)}%`}
            subtitle={`${analytics.engagementChange > 0 ? '+' : ''}${(analytics.engagementChange * 100).toFixed(1)}% change`}
          />
          <StatCard 
            title="Power Users" 
            value={analytics.userSegmentation.powerUsers}
            subtitle={`${((analytics.userSegmentation.powerUsers / analytics.userSegmentation.total) * 100).toFixed(1)}% of total users`}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Content Performance</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-8px' }}>
          <StatCard 
            title="High Performing" 
            value={analytics.contentPerformance.high}
            color="#2e7d32"
          />
          <StatCard 
            title="Medium Performing" 
            value={analytics.contentPerformance.medium}
            color="#ed6c02"
          />
          <StatCard 
            title="Low Performing" 
            value={analytics.contentPerformance.low}
            color="#d32f2f"
          />
          <StatCard 
            title="Avg Revenue/Content" 
            value={analytics.avgRevenuePerContent}
            color="#2e7d32"
          />
        </div>
      </div>

      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <h3>Revenue Metrics</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-8px' }}>
          <StatCard 
            title="Avg Revenue/User" 
            value={analytics.avgRevenuePerUser}
            color="#2e7d32"
          />
          <StatCard 
            title="Projected Monthly" 
            value={analytics.projectedMonthlyRevenue}
            subtitle="Based on current growth"
            color="#2e7d32"
          />
          <StatCard 
            title="Completed Promotions" 
            value={analytics.promotionsCompleted}
            subtitle={`${((analytics.promotionsCompleted / (analytics.promotionsCompleted + analytics.activePromotions)) * 100).toFixed(1)}% completion rate`}
          />
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;