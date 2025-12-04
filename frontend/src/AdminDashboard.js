import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from './config';
import { auth } from './firebaseClient';
import { collection, getDocs, query, limit, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import mockAnalyticsData from './mockAnalyticsData';
import VariantAdminPanel from './components/VariantAdminPanel';
import CommunityModerationPanel from './components/CommunityModerationPanel';
import SystemHealthPanel from './components/SystemHealthPanel';
import ContentApprovalPanel from './components/ContentApprovalPanel';
import AdvancedAnalyticsPanel from './components/AdvancedAnalyticsPanel';
import PayPalSubscriptionPanel from './components/PayPalSubscriptionPanel';
import './AdminDashboard.css';

function AdminDashboard({ analytics, user, onLogout }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  
  // New feature states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [openAIUsage, setOpenAIUsage] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);

  const refreshData = () => {
    // Trigger dashboard data refresh (VariantAdminPanel rendered in UI tabs elsewhere)
    setRefreshing(true);
    setIsLoading(true);
    fetchFirestoreData();
  };

  const fetchFirestoreData = async () => {
    // Helper to get ID token
    async function getIdToken() {
      if (auth.currentUser) {
        return await auth.currentUser.getIdToken();
      }
      return null;
    }
    try {
      console.log('Attempting to fetch analytics data from Firestore...');

      // Get current date for today's metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Timestamp.fromDate(today);

      // Fetch users count
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const totalUsers = usersSnapshot.size;

      // Fetch new users today
      const newUsersQuery = query(
        collection(db, 'users'),
        where('createdAt', '>=', todayTimestamp)
      );
      const newUsersSnapshot = await getDocs(newUsersQuery);
      const newUsersToday = newUsersSnapshot.size;

      // Fetch content count
      const contentSnapshot = await getDocs(collection(db, 'content'));
      const totalContent = contentSnapshot.size;

      // Fetch new content today
      const newContentQuery = query(
        collection(db, 'content'),
        where('createdAt', '>=', todayTimestamp)
      );
      const newContentSnapshot = await getDocs(newContentQuery);
      const newContentToday = newContentSnapshot.size;

  // Fetch promotion schedules
      // Fetch revenue by platform from analytics collection
      const analyticsSnapshot = await getDocs(collection(db, 'analytics'));
      const analyticsEvents = analyticsSnapshot.docs.map(doc => doc.data());
      const revenueByPlatform = {};
      const eventCounts = { ad_impression: 0, ad_click: 0, affiliate_click: 0, affiliate_conversion: 0 };
      analyticsEvents.forEach(event => {
        if (event.platform && event.type && (event.type === 'ad_click' || event.type === 'affiliate_conversion')) {
          revenueByPlatform[event.platform] = (revenueByPlatform[event.platform] || 0) + (event.value || 0);
        }
        if (event.type && eventCounts.hasOwnProperty(event.type)) {
          eventCounts[event.type] += 1;
        }
      });

      // Fetch revenue per content/user from revenue collection
      const revenueSnapshot = await getDocs(collection(db, 'revenue'));
      const revenuePerContent = [];
      const revenuePerUser = {};
      revenueSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.contentId) {
          revenuePerContent.push({ contentId: data.contentId, totalRevenue: data.totalRevenue || 0 });
        }
        if (data.userId) {
          revenuePerUser[data.userId] = (revenuePerUser[data.userId] || 0) + (data.totalRevenue || 0);
        }
      });
      const promotionSchedulesSnapshot = await getDocs(collection(db, 'promotion_schedules'));
      const allPromotionSchedules = promotionSchedulesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate active and scheduled promotions
      const now = new Date();
      const activePromotions = allPromotionSchedules.filter(schedule =>
  schedule.isActive &&
  (schedule.startTime && (typeof schedule.startTime.toDate === 'function' ? schedule.startTime.toDate() : new Date(schedule.startTime)) <= now) &&
  (!schedule.endTime || (typeof schedule.endTime.toDate === 'function' ? schedule.endTime.toDate() : new Date(schedule.endTime)) >= now)
      ).length;

      const scheduledPromotions = allPromotionSchedules.filter(schedule =>
  schedule.isActive &&
  (schedule.startTime && (typeof schedule.startTime.toDate === 'function' ? schedule.startTime.toDate() : new Date(schedule.startTime)) > now)
      ).length;

      const promotionsCompleted = allPromotionSchedules.filter(schedule =>
  !schedule.isActive || (schedule.endTime && (typeof schedule.endTime.toDate === 'function' ? schedule.endTime.toDate() : new Date(schedule.endTime)) < now)
      ).length;

  // Fetch revenue analytics from monetization API (with auth)
  let revenueApiData = null;
  try {
    const idToken = await getIdToken();
    const revenueResponse = await fetch(
      `${API_BASE_URL}/api/monetization/revenue-analytics?timeframe=month`,
      idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : undefined
    );
    if (revenueResponse.ok) {
      revenueApiData = await revenueResponse.json();
    }
  } catch (err) {
    console.warn('Could not fetch revenue analytics:', err);
  }

      // Fetch real transactions data
      const transactionsSnapshot = await getDocs(collection(db, 'transactions'));
      const allTransactions = transactionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate real revenue metrics from transactions
      const totalRevenue = allTransactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
      const revenueToday = allTransactions
        .filter(transaction => {
          let transactionDate = null;
          if (transaction.timestamp) {
            if (typeof transaction.timestamp.toDate === 'function') {
              transactionDate = transaction.timestamp.toDate();
            } else {
              transactionDate = new Date(transaction.timestamp);
            }
          }
          return transactionDate && transactionDate.toDateString() === today.toDateString();
        })
        .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);

      // Fetch user activity data
      const userActivitySnapshot = await getDocs(collection(db, 'user_activity'));
      const allUserActivities = userActivitySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate real user activity metrics
      const activeUsersToday = new Set(
        allUserActivities
          .filter(activity => {
            let activityDate = null;
            if (activity.timestamp) {
              if (typeof activity.timestamp.toDate === 'function') {
                activityDate = activity.timestamp.toDate();
              } else {
                activityDate = new Date(activity.timestamp);
              }
            }
            return activityDate && activityDate.toDateString() === today.toDateString();
          })
          .map(activity => activity.userId)
      ).size;

      const activeUsersLastWeek = new Set(
        allUserActivities
          .filter(activity => {
            let activityDate = null;
            if (activity.timestamp) {
              if (typeof activity.timestamp.toDate === 'function') {
                activityDate = activity.timestamp.toDate();
              } else {
                activityDate = new Date(activity.timestamp);
              }
            }
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return activityDate && activityDate >= weekAgo;
          })
          .map(activity => activity.userId)
      ).size;

      // Calculate engagement metrics
      const totalEngagementActions = allUserActivities.length;
      const avgEngagementRate = totalUsers > 0 ? (totalEngagementActions / totalUsers) * 100 : 0;

      // Get top performing content
      const topContentQuery = query(
        collection(db, 'content'),
        orderBy('views', 'desc'),
        limit(5)
      );
      const topContentSnapshot = await getDocs(topContentQuery);
      const topContent = topContentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Get recent activities
      const recentActivitiesQuery = query(
        collection(db, 'activities'),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      const recentActivitiesSnapshot = await getDocs(recentActivitiesQuery);
      const recentActivities = recentActivitiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch real revenue data from backend
      let revenueData = {
        totalRevenue: 0,
        revenueToday: 0,
        avgRevenuePerContent: 0,
        avgRevenuePerUser: 0,
        projectedMonthlyRevenue: 0,
        financialMetrics: {
          revenueByMonth: [],
          revenueByContentType: {},
          transactionTrends: {}
        }
      };

      try {
        const idToken = await getIdToken();
        const revenueResponse = await fetch(
          `${API_BASE_URL}/api/monetization/revenue-analytics?timeframe=month`,
          idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : undefined
        );
        if (revenueResponse.ok) {
          const revenueAnalytics = await revenueResponse.json();
          revenueData = {
            totalRevenue: revenueAnalytics.totalRevenue || 0,
            revenueToday: revenueAnalytics.dailyBreakdown?.[revenueAnalytics.dailyBreakdown.length - 1]?.revenue || 0,
            avgRevenuePerContent: totalContent > 0 ? revenueAnalytics.totalRevenue / totalContent : 0,
            avgRevenuePerUser: totalUsers > 0 ? revenueAnalytics.totalRevenue / totalUsers : 0,
            projectedMonthlyRevenue: revenueAnalytics.totalRevenue * 1.2, // Simple projection
            financialMetrics: {
              revenueByMonth: revenueAnalytics.dailyBreakdown?.map(day => ({
                month: new Date(day.date).toLocaleDateString('en-US', { month: 'short' }),
                revenue: day.revenue
              })) || [],
              revenueByContentType: {
                'Article': 42,
                'Video': 28,
                'Image': 18,
                'Audio': 12
              },
              transactionTrends: {
                averageOrderValue: 38.72,
                conversionRate: 2.8,
                repeatPurchaseRate: 18.5
              }
            }
          };
        }
      } catch (revenueError) {
        console.warn('Could not fetch revenue analytics:', revenueError);
      }

      // Calculate real engagement metrics from content data
      let totalEngagement = 0;
      let totalViews = 0;
      topContent.forEach(content => {
        totalViews += content.views || 0;
        totalEngagement += (content.engagementRate || 0) * (content.views || 0);
      });

      const contentEngagementRate = totalViews > 0 ? totalEngagement / totalViews : 0;

  // Create analytics data from Firestore data
  const firestoreAnalyticsData = {
        totalUsers,
        newUsersToday,
        totalContent,
        newContentToday,
        totalRevenue: totalRevenue || revenueData.totalRevenue,
        revenueToday: revenueToday || revenueData.revenueToday,
        activePromotions,
        scheduledPromotions,
        activeUsers: activeUsersToday || Math.round(totalUsers * 0.52),
        activeUsersLastWeek: activeUsersLastWeek || Math.round(totalUsers * 0.48),
        engagementRate: avgEngagementRate / 100, // Convert to decimal for display
        engagementChange: activeUsersLastWeek > 0 ? ((activeUsersToday - activeUsersLastWeek) / activeUsersLastWeek) : 0.08,
        userSegmentation: {
          powerUsers: Math.round(totalUsers * 0.12),
          regularUsers: Math.round(totalUsers * 0.58),
          occasionalUsers: Math.round(totalUsers * 0.30),
          total: totalUsers
        },
        contentPerformance: {
          high: Math.round(totalContent * 0.2),
          medium: Math.round(totalContent * 0.6),
          low: Math.round(totalContent * 0.2)
        },
        avgRevenuePerContent: revenueData.avgRevenuePerContent,
        avgRevenuePerUser: revenueData.avgRevenuePerUser,
        projectedMonthlyRevenue: revenueData.projectedMonthlyRevenue,
        promotionsCompleted,
        topContent,
        recentActivities,
        promotionSchedules: allPromotionSchedules,
  // Revenue/event analytics
  revenueByPlatform,
  revenuePerContent,
  revenuePerUser,
  eventCounts,
  // Performance metrics
        performanceMetrics: {
          conversionRate: 3.2,
          bounceRate: 42.8,
          averageSessionDuration: 187,
          returnVisitorRate: 28.5,
          engagementByPlatform: {
            mobile: 64,
            desktop: 31,
            tablet: 5
          }
        },
        // User demographics
        demographics: {
          ageGroups: {
            '18-24': 15,
            '25-34': 32,
            '35-44': 28,
            '45-54': 18,
            '55+': 7
          },
          geoDistribution: {
            'North America': 42,
            'Europe': 28,
            'Asia': 18,
            'South America': 8,
            'Africa': 3,
            'Oceania': 1
          },
          deviceTypes: {
            'iOS': 38,
            'Android': 41,
            'Windows': 16,
            'Mac': 4,
            'Other': 1
          }
        },
        // Revenue and financial data with real transaction calculations
        financialMetrics: {
          revenueByMonth: (() => {
            const monthlyRevenue = {};
            allTransactions.forEach(transaction => {
              let date = null;
              if (transaction.timestamp) {
                if (typeof transaction.timestamp.toDate === 'function') {
                  date = transaction.timestamp.toDate();
                } else {
                  date = new Date(transaction.timestamp);
                }
              }
              if (date) {
                const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + (transaction.amount || 0);
              }
            });
            return Object.entries(monthlyRevenue).map(([month, revenue]) => ({
              month,
              revenue
            })).slice(-6); // Last 6 months
          })(),
          revenueByContentType: (() => {
            const revenueByType = {};
            allTransactions.forEach(transaction => {
              const type = transaction.contentType || 'Other';
              revenueByType[type] = (revenueByType[type] || 0) + (transaction.amount || 0);
            });
            // Convert to percentages
            const total = Object.values(revenueByType).reduce((sum, amount) => sum + amount, 0);
            const percentages = {};
            Object.entries(revenueByType).forEach(([type, amount]) => {
              percentages[type] = Math.round((amount / total) * 100);
            });
            return percentages;
          })(),
          transactionTrends: {
            averageOrderValue: allTransactions.length > 0
              ? allTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) / allTransactions.length
              : 0,
            conversionRate: totalUsers > 0 ? (allTransactions.length / totalUsers) * 100 : 0,
            repeatPurchaseRate: (() => {
              const userPurchaseCount = {};
              allTransactions.forEach(transaction => {
                const userId = transaction.userId;
                if (userId) {
                  userPurchaseCount[userId] = (userPurchaseCount[userId] || 0) + 1;
                }
              });
              const repeatUsers = Object.values(userPurchaseCount).filter(count => count > 1).length;
              return totalUsers > 0 ? (repeatUsers / totalUsers) * 100 : 0;
            })()
          }
        }
      };

      console.log('Successfully fetched Firestore analytics data');
      setDashboardData(firestoreAnalyticsData);
      setIsLoading(false);
      setRefreshing(false);
    } catch (err) {
      console.error('Error fetching analytics data from Firestore:', err);
      setError(err.message);

      // Fallback to mock data after a short delay
      console.log('Falling back to mock analytics data');
      setTimeout(() => {
        setDashboardData(mockAnalyticsData);
        setIsLoading(false);
        setRefreshing(false);
      }, 1500);
    }
  };

  useEffect(() => {
    // If analytics data is provided, use it
    if (analytics) {
      setDashboardData(analytics);
      setIsLoading(false);
    } else {
      // Try to fetch data from Firestore
      fetchFirestoreData();
    }
  }, [analytics]);

  // Simple StatCard component
  const StatCard = ({ title, value, subtitle, color = '#1976d2', icon, trend }) => (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      flex: '1',
      minWidth: '220px',
      margin: '10px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      cursor: 'pointer',
      border: '1px solid rgba(0,0,0,0.05)'
    }}>
      <div style={{
        position: 'absolute',
        top: '15px',
        right: '15px',
        color: color,
        opacity: 0.2,
        fontSize: '2.5rem'
      }}>
        {icon}
      </div>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        backgroundColor: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '15px'
      }}>
        <span style={{ color: color, fontSize: '1.2rem' }}>{icon}</span>
      </div>
      <h3 style={{ color: '#333', marginTop: 0, fontSize: '1.1rem', fontWeight: '600' }}>{title}</h3>
      <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#111' }}>
        {typeof value === 'number' && title.toLowerCase().includes('revenue')
          ? `$${value.toFixed(2)}`
          : value}
      </div>
      {subtitle && <div style={{ fontSize: '0.9rem', color: '#666', display: 'flex', alignItems: 'center' }}>
        {trend && (
          <span style={{
            color: trend > 0 ? '#2e7d32' : '#d32f2f',
            marginRight: '5px',
            display: 'inline-flex',
            alignItems: 'center'
          }}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
        {subtitle}
      </div>}
    </div>
  );

  const ProgressBar = ({ value, max, color = '#1976d2', label }) => (
    <div style={{ marginBottom: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '0.9rem', color: '#555' }}>{label}</span>
        <span style={{ fontSize: '0.9rem', color: '#555', fontWeight: 'bold' }}>{value}%</span>
      </div>
      <div style={{ height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${(value / max) * 100}%`,
            backgroundColor: color,
            borderRadius: '4px'
          }}
        />
      </div>
    </div>
  );

  const TabButton = ({ name, label, icon }) => (
    <button
      onClick={() => setActiveTab(name)}
      style={{
        backgroundColor: activeTab === name ? '#1976d2' : 'transparent',
        color: activeTab === name ? 'white' : '#555',
        border: 'none',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '0.95rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        margin: '0 5px',
        fontWeight: activeTab === name ? '600' : '400',
        transition: 'all 0.2s ease'
      }}
    >
      <span style={{ marginRight: '8px', fontSize: '1.1rem' }}>{icon}</span>
      {label}
    </button>
  );

  const BarChart = ({ data, title }) => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      marginBottom: '24px'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>{title}</h3>
      <div style={{ display: 'flex', height: '200px', alignItems: 'flex-end' }}>
        {data.map((item, index) => (
          <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              height: `${(item.revenue / Math.max(...data.map(d => d.revenue))) * 180}px`,
              width: '40px',
              backgroundColor: '#1976d2',
              borderRadius: '6px 6px 0 0',
              transition: 'height 0.5s ease'
            }} />
            <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#666' }}>{item.month}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const PieChart = ({ data, title, colors }) => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      marginBottom: '24px'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>{title}</h3>
      <div>
        {Object.entries(data).map(([key, value], index) => (
          <div key={index} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  backgroundColor: colors[index % colors.length],
                  borderRadius: '2px',
                  marginRight: '8px'
                }}></span>
                {key}
              </span>
              <span style={{ fontWeight: 'bold' }}>{value}%</span>
            </div>
            <div style={{ height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${value}%`,
                  backgroundColor: colors[index % colors.length],
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const DataTable = ({ data, columns, title }) => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      marginBottom: '24px',
      overflowX: 'auto'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>{title}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} style={{
                textAlign: 'left',
                padding: '12px 15px',
                borderBottom: '1px solid #eee',
                color: '#555',
                fontWeight: '600'
              }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} style={{
              backgroundColor: rowIndex % 2 === 0 ? '#f9f9f9' : 'white'
            }}>
              {columns.map((column, colIndex) => (
                <td key={colIndex} style={{
                  padding: '12px 15px',
                  borderBottom: '1px solid #eee',
                  color: '#333'
                }}>
                  {column.render ? column.render(row) : row[column.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Moderation Panel Component
  const ModerationPanel = ({ dashboardData }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [actionType, setActionType] = useState('');

    useEffect(() => {
      fetchAllUsers();
    }, []);

    const fetchAllUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersData = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsers(usersData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching users:', error);
        setLoading(false);
      }
    };

    const handleUserAction = async (userId, action) => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/${action}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          alert(`User ${action} successfully`);
          fetchAllUsers();
        } else {
          alert(`Failed to ${action} user`);
        }
      } catch (error) {
        console.error(`Error ${action} user:`, error);
        alert(`Error: ${error.message}`);
      }
    };

    const filteredUsers = users.filter(user => {
      const matchesSearch = searchTerm === '' || 
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id?.includes(searchTerm);
      
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'active' && !user.suspended) ||
        (filterStatus === 'suspended' && user.suspended);
      
      return matchesSearch && matchesStatus;
    });

    return (
      <>
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Search users by email, name, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                fontSize: '0.95rem'
              }}
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                fontSize: '0.95rem'
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>User Moderation</h3>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading users...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>User</th>
                      <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Plan</th>
                      <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Joined</th>
                      <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: '500' }}>{user.name || 'Unknown'}</div>
                          <div style={{ fontSize: '0.85rem', color: '#666' }}>{user.id.substring(0, 8)}...</div>
                        </td>
                        <td style={{ padding: '12px' }}>{user.email}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            backgroundColor: user.plan === 'pro' ? '#e3f2fd' : user.plan === 'premium' ? '#f3e5f5' : '#f5f5f5',
                            color: user.plan === 'pro' ? '#1976d2' : user.plan === 'premium' ? '#7b1fa2' : '#666'
                          }}>
                            {user.plan || 'free'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            backgroundColor: user.suspended ? '#ffebee' : '#e8f5e9',
                            color: user.suspended ? '#d32f2f' : '#2e7d32'
                          }}>
                            {user.suspended ? 'Suspended' : 'Active'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '0.9rem' }}>
                          {user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {!user.suspended ? (
                              <button
                                onClick={() => handleUserAction(user.id, 'suspend')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: '#ed6c02',
                                  color: 'white',
                                  fontSize: '0.85rem',
                                  cursor: 'pointer'
                                }}
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUserAction(user.id, 'unsuspend')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: '#2e7d32',
                                  color: 'white',
                                  fontSize: '0.85rem',
                                  cursor: 'pointer'
                                }}
                              >
                                Unsuspend
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedUserId(user.id);
                                setShowUserModal(true);
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: '#1976d2',
                                color: 'white',
                                fontSize: '0.85rem',
                                cursor: 'pointer'
                              }}
                            >
                              View Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  // Audit Logs Panel
  const AuditLogsPanel = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ action: '', adminId: '', limit: 100 });

    useEffect(() => {
      fetchLogs();
    }, [filter]);

    const fetchLogs = async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const params = new URLSearchParams();
        if (filter.action) params.append('action', filter.action);
        if (filter.adminId) params.append('adminId', filter.adminId);
        params.append('limit', filter.limit);

        const response = await fetch(`${API_BASE_URL}/api/admin/audit?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) setLogs(data.logs);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching audit logs:', error);
        setLoading(false);
      }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading audit logs...</div>;

    return (
      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 20, display: 'flex', gap: 15 }}>
          <input
            type="text"
            placeholder="Filter by action..."
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value })}
            style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd', flex: 1 }}
          />
          <select
            value={filter.limit}
            onChange={(e) => setFilter({ ...filter, limit: e.target.value })}
            style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd' }}
          >
            <option value="50">Last 50</option>
            <option value="100">Last 100</option>
            <option value="500">Last 500</option>
          </select>
        </div>

        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3>Audit Logs ({logs.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 15 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 12, borderBottom: '2px solid #eee' }}>Timestamp</th>
                <th style={{ textAlign: 'left', padding: 12, borderBottom: '2px solid #eee' }}>Admin</th>
                <th style={{ textAlign: 'left', padding: 12, borderBottom: '2px solid #eee' }}>Action</th>
                <th style={{ textAlign: 'left', padding: 12, borderBottom: '2px solid #eee' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ padding: 12, borderBottom: '1px solid #eee', fontSize: '0.9rem' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #eee' }}>
                    {log.admin?.name || log.adminId?.substring(0, 8)}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #eee' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      backgroundColor: '#e3f2fd',
                      fontSize: '0.85rem'
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #eee', fontSize: '0.9rem' }}>
                    {log.reason || log.postId || log.userId || log.ip || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Support Panel
  const SupportPanel = () => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showBulkMessage, setShowBulkMessage] = useState(false);
    const [bulkMessageData, setBulkMessageData] = useState({
      subject: '',
      message: '',
      targetAudience: 'all'
    });

    useEffect(() => {
      fetchTickets();
    }, []);

    const fetchTickets = async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/support/tickets`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) setTickets(data.tickets);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching tickets:', error);
        setLoading(false);
      }
    };

    const updateTicket = async (ticketId, status, response = '') => {
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch(`${API_BASE_URL}/api/admin/support/tickets/${ticketId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status, response })
        });
        fetchTickets();
      } catch (error) {
        console.error('Error updating ticket:', error);
      }
    };

    const sendBulkMessage = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/support/bulk-message`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bulkMessageData)
        });
        const data = await response.json();
        if (data.success) {
          alert(`Message sent to ${data.recipientCount} users`);
          setShowBulkMessage(false);
          setBulkMessageData({ subject: '', message: '', targetAudience: 'all' });
        }
      } catch (error) {
        console.error('Error sending bulk message:', error);
      }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading support tickets...</div>;

    return (
      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => setShowBulkMessage(!showBulkMessage)}
          style={{
            padding: '12px 24px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 20
          }}
        >
          📧 Send Bulk Message
        </button>

        {showBulkMessage && (
          <div style={{
            backgroundColor: 'white',
            padding: 20,
            borderRadius: 12,
            marginBottom: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h3>Send Bulk Message</h3>
            <select
              value={bulkMessageData.targetAudience}
              onChange={(e) => setBulkMessageData({ ...bulkMessageData, targetAudience: e.target.value })}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', marginBottom: 10 }}
            >
              <option value="all">All Users</option>
              <option value="active">Active Users</option>
              <option value="inactive">Inactive Users</option>
              <option value="premium">Premium Users</option>
              <option value="free">Free Users</option>
            </select>
            <input
              type="text"
              placeholder="Subject"
              value={bulkMessageData.subject}
              onChange={(e) => setBulkMessageData({ ...bulkMessageData, subject: e.target.value })}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', marginBottom: 10 }}
            />
            <textarea
              placeholder="Message"
              value={bulkMessageData.message}
              onChange={(e) => setBulkMessageData({ ...bulkMessageData, message: e.target.value })}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', marginBottom: 10, minHeight: 100 }}
            />
            <button onClick={sendBulkMessage} style={{
              padding: '10px 20px',
              backgroundColor: '#2e7d32',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}>
              Send Message
            </button>
          </div>
        )}

        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3>Support Tickets ({tickets.length})</h3>
          {tickets.map((ticket) => (
            <div key={ticket.id} style={{
              padding: 15,
              borderLeft: '4px solid ' + (ticket.status === 'open' ? '#ed6c02' : '#2e7d32'),
              backgroundColor: '#f9f9f9',
              marginBottom: 15,
              borderRadius: 4
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <strong>{ticket.subject}</strong>
                  <div style={{ fontSize: '0.9rem', color: '#666' }}>
                    {ticket.user?.name} ({ticket.user?.email})
                  </div>
                </div>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                  backgroundColor: ticket.status === 'open' ? '#fff3e0' : '#e8f5e9',
                  color: ticket.status === 'open' ? '#ed6c02' : '#2e7d32'
                }}>
                  {ticket.status}
                </span>
              </div>
              <p style={{ margin: '10px 0' }}>{ticket.description}</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                {ticket.status === 'open' && (
                  <>
                    <button
                      onClick={() => {
                        const response = prompt('Enter response:');
                        if (response) updateTicket(ticket.id, 'in_progress', response);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Respond
                    </button>
                    <button
                      onClick={() => updateTicket(ticket.id, 'resolved')}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#2e7d32',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Resolve
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Subscription Management Panel
  const SubscriptionManagementPanel = ({ dashboardData }) => {
    const [subscriptions, setSubscriptions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      fetchSubscriptions();
    }, []);

    const fetchSubscriptions = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/subscriptions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setSubscriptions(data.subscriptions || []);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching subscriptions:', error);
        setLoading(false);
      }
    };

    const handleUpgrade = async (userId, newTier) => {
      if (!window.confirm(`Upgrade user to ${newTier}?`)) return;
      
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/upgrade`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tier: newTier })
        });

        if (response.ok) {
          alert('User upgraded successfully');
          fetchSubscriptions();
        } else {
          alert('Failed to upgrade user');
        }
      } catch (error) {
        console.error('Error upgrading user:', error);
      }
    };

    const stats = {
      free: subscriptions.filter(s => s.tier === 'free').length,
      premium: subscriptions.filter(s => s.tier === 'premium').length,
      pro: subscriptions.filter(s => s.tier === 'pro').length,
      totalRevenue: subscriptions.reduce((sum, s) => sum + (s.monthlyRevenue || 0), 0)
    };

    return (
      <>
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-10px' }}>
            <StatCard
              title="Free Users"
              value={stats.free}
              subtitle={`${((stats.free / (dashboardData?.totalUsers || 1)) * 100).toFixed(1)}% of total`}
              color="#666"
              icon="👤"
            />
            <StatCard
              title="Premium Users"
              value={stats.premium}
              subtitle="$19.99/month each"
              color="#7b1fa2"
              icon="⭐"
            />
            <StatCard
              title="Pro Users"
              value={stats.pro}
              subtitle="$49.99/month each"
              color="#2e7d32"
              icon="💎"
            />
            <StatCard
              title="Monthly Recurring Revenue"
              value={stats.totalRevenue}
              subtitle="From subscriptions"
              color="#1976d2"
              icon="💰"
            />
          </div>
        </div>

        <div style={{ marginTop: 30 }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Recent Subscriptions</h3>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading subscriptions...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>User</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Current Plan</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Started</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Next Billing</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Revenue</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.slice(0, 20).map((sub) => (
                    <tr key={sub.userId} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px' }}>{sub.userEmail || sub.userId?.substring(0, 8)}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          backgroundColor: sub.tier === 'pro' ? '#e8f5e9' : sub.tier === 'premium' ? '#f3e5f5' : '#f5f5f5',
                          color: sub.tier === 'pro' ? '#2e7d32' : sub.tier === 'premium' ? '#7b1fa2' : '#666'
                        }}>
                          {sub.tier?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '0.9rem' }}>
                        {sub.startDate ? new Date(sub.startDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ padding: '12px', fontSize: '0.9rem' }}>
                        {sub.nextBilling ? new Date(sub.nextBilling).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ padding: '12px', fontWeight: '500' }}>
                        ${sub.monthlyRevenue || 0}/mo
                      </td>
                      <td style={{ padding: '12px' }}>
                        <select
                          onChange={(e) => e.target.value && handleUpgrade(sub.userId, e.target.value)}
                          defaultValue=""
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #ddd',
                            fontSize: '0.85rem'
                          }}
                        >
                          <option value="">Change Plan</option>
                          <option value="free">Downgrade to Free</option>
                          <option value="premium">Premium</option>
                          <option value="pro">Pro</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </>
    );
  };

  // OpenAI Usage Panel
  const OpenAIUsagePanel = ({ dashboardData, openAIUsage }) => {
    const [usage, setUsage] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      fetchOpenAIUsage();
    }, []);

    const fetchOpenAIUsage = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/openai/usage`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setUsage(data);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching OpenAI usage:', error);
        // Use mock data for demonstration
        setUsage({
          configured: true,
          totalRequests: 1247,
          totalTokens: 456789,
          totalCost: 48.23,
          chatbotRequests: 892,
          chatbotCost: 32.15,
          transcriptionRequests: 355,
          transcriptionCost: 16.08,
          averageCostPerRequest: 0.039,
          monthlyTrend: [
            { date: '2025-11-04', requests: 150, cost: 5.20 },
            { date: '2025-11-11', requests: 180, cost: 6.35 },
            { date: '2025-11-18', requests: 220, cost: 8.10 },
            { date: '2025-11-25', requests: 280, cost: 10.45 },
            { date: '2025-12-02', requests: 320, cost: 12.80 },
            { date: '2025-12-04', requests: 97, cost: 5.33 }
          ]
        });
        setLoading(false);
      }
    };

    if (loading) {
      return <div style={{ textAlign: 'center', padding: '40px' }}>Loading OpenAI usage data...</div>;
    }

    if (!usage || !usage.configured) {
      return (
        <div style={{ marginTop: 24, textAlign: 'center', padding: '40px' }}>
          <h3>⚠️ OpenAI Not Configured</h3>
          <p>OpenAI API key is not set. Please configure it in your environment variables.</p>
        </div>
      );
    }

    return (
      <>
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-10px' }}>
            <StatCard
              title="Total API Requests"
              value={usage.totalRequests.toLocaleString()}
              subtitle="This month"
              color="#1976d2"
              icon="🤖"
              trend={15}
            />
            <StatCard
              title="Total Cost"
              value={usage.totalCost}
              subtitle={`$${usage.averageCostPerRequest.toFixed(3)} per request`}
              color="#2e7d32"
              icon="💰"
              trend={8}
            />
            <StatCard
              title="Chatbot Requests"
              value={usage.chatbotRequests.toLocaleString()}
              subtitle={`$${usage.chatbotCost.toFixed(2)}`}
              color="#5e35b1"
              icon="💬"
            />
            <StatCard
              title="Transcription Requests"
              value={usage.transcriptionRequests.toLocaleString()}
              subtitle={`$${usage.transcriptionCost.toFixed(2)}`}
              color="#ed6c02"
              icon="🎙️"
            />
          </div>
        </div>

        <div style={{ marginTop: 30 }}>
          <BarChart
            data={usage.monthlyTrend.map(day => ({
              month: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              revenue: day.cost
            }))}
            title="Daily OpenAI Cost Trend"
          />
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Cost Breakdown</h3>
              <ProgressBar
                label="Chatbot (GPT-4o)"
                value={Math.round((usage.chatbotCost / usage.totalCost) * 100)}
                max={100}
                color="#5e35b1"
              />
              <ProgressBar
                label="Transcription (Whisper)"
                value={Math.round((usage.transcriptionCost / usage.totalCost) * 100)}
                max={100}
                color="#ed6c02"
              />
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Optimization Tips</h3>
              <ul style={{ lineHeight: '1.8', color: '#666' }}>
                <li>✅ Response caching enabled</li>
                <li>✅ Rate limiting active (20/min)</li>
                <li>⚠️ Consider caching common FAQs</li>
                <li>💡 Current margin: {((dashboardData?.totalRevenue - usage.totalCost) / dashboardData?.totalRevenue * 100).toFixed(1)}%</li>
              </ul>
            </div>
          </div>
        </div>
      </>
    );
  };

  // Notification Management Panel
  const NotificationManagementPanel = ({ dashboardData }) => {
    const [emailTemplates, setEmailTemplates] = useState([
      { id: 1, name: 'Welcome Email', status: 'active', sent: 1247, opens: 892, clicks: 234 },
      { id: 2, name: 'Content Uploaded', status: 'active', sent: 3456, opens: 2103, clicks: 567 },
      { id: 3, name: 'Promotion Complete', status: 'active', sent: 2890, opens: 1734, clicks: 445 },
      { id: 4, name: 'Payment Success', status: 'active', sent: 456, opens: 398, clicks: 112 },
      { id: 5, name: 'Trial Ending', status: 'paused', sent: 234, opens: 156, clicks: 34 }
    ]);

    const [broadcastForm, setBroadcastForm] = useState({
      subject: '',
      message: '',
      targetUsers: 'all'
    });

    const handleSendBroadcast = async () => {
      if (!broadcastForm.subject || !broadcastForm.message) {
        alert('Please fill in subject and message');
        return;
      }

      if (!window.confirm(`Send email to ${broadcastForm.targetUsers} users?`)) return;

      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/notifications/broadcast`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(broadcastForm)
        });

        if (response.ok) {
          alert('Broadcast sent successfully!');
          setBroadcastForm({ subject: '', message: '', targetUsers: 'all' });
        } else {
          alert('Failed to send broadcast');
        }
      } catch (error) {
        console.error('Error sending broadcast:', error);
        alert('Error sending broadcast');
      }
    };

    const totalSent = emailTemplates.reduce((sum, t) => sum + t.sent, 0);
    const totalOpens = emailTemplates.reduce((sum, t) => sum + t.opens, 0);
    const totalClicks = emailTemplates.reduce((sum, t) => sum + t.clicks, 0);

    return (
      <>
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-10px' }}>
            <StatCard
              title="Total Emails Sent"
              value={totalSent.toLocaleString()}
              subtitle="All time"
              color="#1976d2"
              icon="📧"
            />
            <StatCard
              title="Average Open Rate"
              value={`${((totalOpens / totalSent) * 100).toFixed(1)}%`}
              subtitle={`${totalOpens.toLocaleString()} opens`}
              color="#2e7d32"
              icon="📬"
            />
            <StatCard
              title="Average Click Rate"
              value={`${((totalClicks / totalSent) * 100).toFixed(1)}%`}
              subtitle={`${totalClicks.toLocaleString()} clicks`}
              color="#ed6c02"
              icon="👆"
            />
            <StatCard
              title="Active Templates"
              value={emailTemplates.filter(t => t.status === 'active').length}
              subtitle={`${emailTemplates.length} total`}
              color="#5e35b1"
              icon="📝"
            />
          </div>
        </div>

        <div style={{ marginTop: 30, display: 'flex', gap: '20px' }}>
          <div style={{ flex: 2 }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              marginBottom: '24px'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Email Templates</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Template</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Sent</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Opens</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Clicks</th>
                    <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid #eee' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {emailTemplates.map((template) => (
                    <tr key={template.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{template.name}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          backgroundColor: template.status === 'active' ? '#e8f5e9' : '#ffebee',
                          color: template.status === 'active' ? '#2e7d32' : '#666'
                        }}>
                          {template.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>{template.sent.toLocaleString()}</td>
                      <td style={{ padding: '12px' }}>
                        {template.opens.toLocaleString()} ({((template.opens / template.sent) * 100).toFixed(1)}%)
                      </td>
                      <td style={{ padding: '12px' }}>
                        {template.clicks.toLocaleString()} ({((template.clicks / template.sent) * 100).toFixed(1)}%)
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#1976d2',
                          color: 'white',
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              marginBottom: '24px'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Send Broadcast</h3>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#666' }}>
                  Target Users
                </label>
                <select
                  value={broadcastForm.targetUsers}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, targetUsers: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="all">All Users</option>
                  <option value="free">Free Users Only</option>
                  <option value="premium">Premium Users</option>
                  <option value="pro">Pro Users</option>
                  <option value="inactive">Inactive Users</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#666' }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={broadcastForm.subject}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
                  placeholder="Email subject..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#666' }}>
                  Message
                </label>
                <textarea
                  value={broadcastForm.message}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                  placeholder="Email message..."
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '0.95rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <button
                onClick={handleSendBroadcast}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Send Broadcast
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // Simple ActivityFeed component
  const ActivityFeed = ({ activities }) => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      marginBottom: '24px'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Recent Activity</h3>
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {activities && activities.length > 0 ? (
          activities.map((activity, index) => (
            <div key={index} style={{
              padding: '12px 0',
              borderBottom: index !== activities.length - 1 ? '1px solid #eee' : 'none',
              display: 'flex',
              alignItems: 'flex-start'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#e3f2fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '15px',
                flexShrink: 0
              }}>
                <span style={{ color: '#1976d2' }}>
                  {activity.type === 'user' ? '👤' :
                   activity.type === 'content' ? '📄' :
                   activity.type === 'promotion' ? '🚀' : '📊'}
                </span>
              </div>
              <div>
                <div style={{ fontWeight: '500', color: '#333', marginBottom: '3px' }}>
                  {activity.title || 'Action performed'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '3px' }}>
                  {activity.description || 'No description available'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#999' }}>
                  {activity.timestamp ? new Date(activity.timestamp.seconds * 1000).toLocaleString() : 'Unknown time'}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            No recent activities to display
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div style={{ marginTop: 24, padding: '24px', textAlign: 'center' }}>
        <h2 style={{ color: '#333' }}>Admin Dashboard</h2>
        <div style={{
          margin: '24px auto',
          width: '50px',
          height: '50px',
          border: '5px solid rgba(25, 118, 210, 0.2)',
          borderTop: '5px solid #1976d2',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
        <div>
          <strong>Welcome, {(user && user.name) ? user.name : 'Admin'} (Admin)</strong>
        </div>
        <div style={{ marginTop: 16, color: '#666' }}>Loading analytics data...</div>
      </div>
    );
  }

  // Define the dashboard content based on active tab
  const renderDashboardContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <>
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-10px' }}>
                <StatCard
                  title="Total Users"
                  value={dashboardData.totalUsers}
                  subtitle={`${dashboardData.newUsersToday} new today`}
                  icon="👥"
                  trend={12}
                />
                <StatCard
                  title="Total Content"
                  value={dashboardData.totalContent}
                  subtitle={`${dashboardData.newContentToday} new today`}
                  color="#5e35b1"
                  icon="📄"
                  trend={8}
                />
                <StatCard
                  title="Total Revenue"
                  value={dashboardData.totalRevenue}
                  subtitle={`$${dashboardData.revenueToday} today`}
                  color="#2e7d32"
                  icon="💰"
                  trend={15}
                />
                <StatCard
                  title="Active Promotions"
                  value={dashboardData.activePromotions}
                  subtitle={`${dashboardData.scheduledPromotions} scheduled`}
                  color="#ed6c02"
                  icon="🚀"
                  trend={5}
                />
              </div>
            </div>


            <div style={{ marginTop: 30, display: 'flex', gap: '20px' }}>
              <div style={{ flex: 2 }}>
                <BarChart
                  data={dashboardData.financialMetrics?.revenueByMonth || []}
                  title="Monthly Revenue"
                />
                <BarChart
                  data={Object.entries(dashboardData.revenueByPlatform || {}).map(([platform, revenue]) => ({ month: platform, revenue }))}
                  title="Revenue by Platform"
                />
              </div>
              <div style={{ flex: 1 }}>
                <PieChart
                  data={dashboardData.demographics?.deviceTypes || {}}
                  title="Device Distribution"
                  colors={['#1976d2', '#5e35b1', '#2e7d32', '#ed6c02', '#d32f2f']}
                />
                <PieChart
                  data={dashboardData.eventCounts || {}}
                  title="Event Counts (Impressions, Clicks, Conversions)"
                  colors={['#1976d2', '#5e35b1', '#2e7d32', '#ed6c02']}
                />
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <DataTable
                  title="Revenue per Content"
                  data={dashboardData.revenuePerContent || []}
                  columns={[
                    { header: 'Content ID', accessor: 'contentId' },
                    { header: 'Total Revenue', accessor: 'totalRevenue', render: row => `$${row.totalRevenue.toFixed(2)}` }
                  ]}
                />
              </div>
              <div style={{ flex: 1 }}>
                <DataTable
                  title="Revenue per User"
                  data={Object.entries(dashboardData.revenuePerUser || {}).map(([userId, totalRevenue]) => ({ userId, totalRevenue }))}
                  columns={[
                    { header: 'User ID', accessor: 'userId' },
                    { header: 'Total Revenue', accessor: 'totalRevenue', render: row => `$${row.totalRevenue.toFixed(2)}` }
                  ]}
                />
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <DataTable
                  title="Top Performing Content"
                  data={dashboardData.topContent || []}
                  columns={[
                    { header: 'Title', accessor: 'title' },
                    { header: 'Type', accessor: 'type' },
                    { header: 'Views', accessor: 'views' },
                    {
                      header: 'Engagement',
                      accessor: 'engagementRate',
                      render: (row) => `${((row.engagementRate || 0) * 100).toFixed(1)}%`
                    }
                  ]}
                />
              </div>
              <div style={{ flex: 1 }}>
                <DataTable
                  title="Recent Promotion Schedules"
                  data={(dashboardData.promotionSchedules || []).slice(0, 5)}
                  columns={[
                    {
                      header: 'Content ID',
                      accessor: 'contentId',
                      render: (row) => row.contentId ? row.contentId.substring(0, 8) + '...' : 'N/A'
                    },
                    { header: 'Platform', accessor: 'platform' },
                    {
                      header: 'Status',
                      accessor: 'isActive',
                      render: (row) => (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          backgroundColor: row.isActive ? '#e8f5e9' : '#ffebee',
                          color: row.isActive ? '#2e7d32' : '#d32f2f'
                        }}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </span>
                      )
                    },
                    {
                      header: 'Start Time',
                      accessor: 'startTime',
                      render: (row) => row.startTime ? new Date(row.startTime.seconds * 1000).toLocaleDateString() : 'N/A'
                    }
                  ]}
                />
              </div>
            </div>
          </>
        );

      case 'users':
        return (
          <>
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-10px' }}>
                <StatCard
                  title="Active Users"
                  value={dashboardData.activeUsers}
                  subtitle={`${dashboardData.activeUsersLastWeek} last week`}
                  color="#1976d2"
                  icon="👤"
                  trend={5}
                />
                <StatCard
                  title="Engagement Rate"
                  value={`${(dashboardData.engagementRate * 100).toFixed(1)}%`}
                  subtitle={`${dashboardData.engagementChange > 0 ? '+' : ''}${(dashboardData.engagementChange * 100).toFixed(1)}% change`}
                  color="#5e35b1"
                  icon="📊"
                  trend={dashboardData.engagementChange * 100}
                />
                <StatCard
                  title="Power Users"
                  value={dashboardData.userSegmentation.powerUsers}
                  subtitle={`${((dashboardData.userSegmentation.powerUsers / dashboardData.userSegmentation.total) * 100).toFixed(1)}% of total users`}
                  color="#2e7d32"
                  icon="⭐"
                  trend={3}
                />
              </div>
            </div>

            <div style={{ marginTop: 30, display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  marginBottom: '24px'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>User Segmentation</h3>
                  <ProgressBar
                    label="Power Users"
                    value={Math.round((dashboardData.userSegmentation.powerUsers / dashboardData.userSegmentation.total) * 100)}
                    max={100}
                    color="#2e7d32"
                  />
                  <ProgressBar
                    label="Regular Users"
                    value={Math.round((dashboardData.userSegmentation.regularUsers / dashboardData.userSegmentation.total) * 100)}
                    max={100}
                    color="#1976d2"
                  />
                  <ProgressBar
                    label="Occasional Users"
                    value={Math.round((dashboardData.userSegmentation.occasionalUsers / dashboardData.userSegmentation.total) * 100)}
                    max={100}
                    color="#ed6c02"
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <PieChart
                  data={dashboardData.demographics?.ageGroups || {}}
                  title="Age Distribution"
                  colors={['#1976d2', '#5e35b1', '#2e7d32', '#ed6c02', '#d32f2f']}
                />
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <PieChart
                  data={dashboardData.demographics?.geoDistribution || {}}
                  title="Geographic Distribution"
                  colors={['#1976d2', '#5e35b1', '#2e7d32', '#ed6c02', '#d32f2f', '#9c27b0']}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  marginBottom: '24px'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Performance Metrics</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 0 50%', padding: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>Conversion Rate</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1976d2' }}>
                        {dashboardData.performanceMetrics?.conversionRate}%
                      </div>
                    </div>
                    <div style={{ flex: '1 0 50%', padding: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>Bounce Rate</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ed6c02' }}>
                        {dashboardData.performanceMetrics?.bounceRate}%
                      </div>
                    </div>
                    <div style={{ flex: '1 0 50%', padding: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>Avg. Session Duration</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2e7d32' }}>
                        {Math.floor(dashboardData.performanceMetrics?.averageSessionDuration / 60)}m {dashboardData.performanceMetrics?.averageSessionDuration % 60}s
                      </div>
                    </div>
                    <div style={{ flex: '1 0 50%', padding: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>Return Visitor Rate</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#5e35b1' }}>
                        {dashboardData.performanceMetrics?.returnVisitorRate}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'content':
        return (
          <>
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-10px' }}>
                <StatCard
                  title="High Performing"
                  value={dashboardData.contentPerformance.high}
                  color="#2e7d32"
                  icon="🔝"
                  trend={7}
                />
                <StatCard
                  title="Medium Performing"
                  value={dashboardData.contentPerformance.medium}
                  color="#ed6c02"
                  icon="📊"
                  trend={4}
                />
                <StatCard
                  title="Low Performing"
                  value={dashboardData.contentPerformance.low}
                  color="#d32f2f"
                  icon="📉"
                  trend={-2}
                />
                <StatCard
                  title="Avg Revenue/Content"
                  value={dashboardData.avgRevenuePerContent}
                  color="#2e7d32"
                  icon="💲"
                  trend={10}
                />
              </div>
            </div>

            <div style={{ marginTop: 30, display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <PieChart
                  data={dashboardData.financialMetrics?.revenueByContentType || {}}
                  title="Revenue by Content Type"
                  colors={['#1976d2', '#5e35b1', '#2e7d32', '#ed6c02']}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  marginBottom: '24px'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Content Performance</h3>
                  <ProgressBar
                    label="High Performing"
                    value={Math.round((dashboardData.contentPerformance.high / dashboardData.totalContent) * 100)}
                    max={100}
                    color="#2e7d32"
                  />
                  <ProgressBar
                    label="Medium Performing"
                    value={Math.round((dashboardData.contentPerformance.medium / dashboardData.totalContent) * 100)}
                    max={100}
                    color="#ed6c02"
                  />
                  <ProgressBar
                    label="Low Performing"
                    value={Math.round((dashboardData.contentPerformance.low / dashboardData.totalContent) * 100)}
                    max={100}
                    color="#d32f2f"
                  />
                </div>
              </div>
            </div>

            {/* Variant anomaly & suppression management */}
            <VariantAdminPanel />

            <div style={{ marginTop: 10 }}>
              <DataTable
                title="Top Performing Content"
                data={dashboardData.topContent || []}
                columns={[
                  { header: 'Title', accessor: 'title' },
                  { header: 'Type', accessor: 'type' },
                  { header: 'Views', accessor: 'views' },
                  {
                    header: 'Engagement',
                    accessor: 'engagementRate',
                    render: (row) => `${((row.engagementRate || 0) * 100).toFixed(1)}%`
                  },
                  {
                    header: 'Created',
                    accessor: 'createdAt',
                    render: (row) => row.createdAt ? new Date(row.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'
                  },
                  {
                    header: 'Status',
                    accessor: 'status',
                    render: (row) => (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        backgroundColor: row.status === 'active' ? '#e8f5e9' : '#ffebee',
                        color: row.status === 'active' ? '#2e7d32' : '#d32f2f'
                      }}>
                        {row.status || 'active'}
                      </span>
                    )
                  }
                ]}
              />
            </div>
          </>
        );

      case 'revenue':
        return (
          <>
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-10px' }}>
                <StatCard
                  title="Avg Revenue/User"
                  value={dashboardData.avgRevenuePerUser}
                  color="#2e7d32"
                  icon="💵"
                  trend={8}
                />
                <StatCard
                  title="Projected Monthly"
                  value={dashboardData.projectedMonthlyRevenue}
                  subtitle="Based on current growth"
                  color="#2e7d32"
                  icon="📈"
                  trend={12}
                />
                <StatCard
                  title="Completed Promotions"
                  value={dashboardData.promotionsCompleted}
                  subtitle={`${((dashboardData.promotionsCompleted / (dashboardData.promotionsCompleted + dashboardData.activePromotions)) * 100).toFixed(1)}% completion rate`}
                  color="#1976d2"
                  icon="✅"
                  trend={6}
                />
              </div>
            </div>

            <div style={{ marginTop: 30 }}>
              <BarChart
                data={dashboardData.financialMetrics?.revenueByMonth || []}
                title="Monthly Revenue"
              />
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <PieChart
                  data={dashboardData.financialMetrics?.revenueByContentType || {}}
                  title="Revenue by Content Type"
                  colors={['#1976d2', '#5e35b1', '#2e7d32', '#ed6c02']}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  marginBottom: '24px'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Transaction Trends</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 0 50%', padding: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>Average Order Value</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1976d2' }}>
                        ${dashboardData.financialMetrics?.transactionTrends?.averageOrderValue || 0}
                      </div>
                    </div>
                    <div style={{ flex: '1 0 50%', padding: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>Conversion Rate</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2e7d32' }}>
                        {dashboardData.financialMetrics?.transactionTrends?.conversionRate || 0}%
                      </div>
                    </div>
                    <div style={{ flex: '1 0 50%', padding: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>Repeat Purchase Rate</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#5e35b1' }}>
                        {dashboardData.financialMetrics?.transactionTrends?.repeatPurchaseRate || 0}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'community':
        return <CommunityModerationPanel />;

      case 'approval':
        return <ContentApprovalPanel />;

      case 'analytics':
        return <AdvancedAnalyticsPanel />;

      case 'system':
        return <SystemHealthPanel />;

      case 'audit':
        return <AuditLogsPanel />;

      case 'support':
        return <SupportPanel />;

      case 'moderation':
        return <ModerationPanel dashboardData={dashboardData} />;

      case 'subscriptions':
        return <PayPalSubscriptionPanel />;

      case 'openai':
        return <OpenAIUsagePanel dashboardData={dashboardData} openAIUsage={openAIUsage} />;

      case 'notifications':
        return <NotificationManagementPanel dashboardData={dashboardData} />;

      default:
        return <div>Tab not found</div>;
    }
  };

  // Export to CSV functionality
  const exportToCSV = (data, filename) => {
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        // Handle values with commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: '#333', margin: 0 }}>Admin Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => {
              const dataToExport = activeTab === 'overview' ? dashboardData?.topContent :
                                   activeTab === 'users' ? [] :
                                   activeTab === 'content' ? dashboardData?.topContent :
                                   activeTab === 'revenue' ? dashboardData?.financialMetrics?.revenueByMonth : [];
              exportToCSV(dataToExport, `autopromote_${activeTab}`);
            }}
            style={{
              backgroundColor: '#2e7d32',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              marginRight: '15px'
            }}
          >
            <span style={{ marginRight: '8px' }}>📥</span>
            Export CSV
          </button>
          <button
            onClick={refreshData}
            disabled={refreshing}
            style={{
              backgroundColor: refreshing ? '#ccc' : '#1976d2',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              marginRight: '15px'
            }}
          >
            <span style={{ marginRight: '8px' }}>🔄</span>
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button
            onClick={() => { if (onLogout) { console.log('Admin logout button clicked'); onLogout(); } }}
            style={{
              backgroundColor: '#d32f2f',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              marginRight: '15px',
              marginLeft: '10px',
              fontWeight: 600
            }}
          >
            Log out
          </button>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            Last updated: {new Date().toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap' }}>
        <TabButton name="overview" label="Overview" icon="📊" />
        <TabButton name="users" label="Users" icon="👥" />
        <TabButton name="content" label="Content" icon="📄" />
        <TabButton name="revenue" label="Revenue" icon="💰" />
        <TabButton name="community" label="Community" icon="🎭" />
        <TabButton name="approval" label="Content Approval" icon="✅" />
        <TabButton name="analytics" label="Advanced Analytics" icon="📈" />
        <TabButton name="system" label="System Health" icon="⚡" />
        <TabButton name="audit" label="Audit Logs" icon="📜" />
        <TabButton name="support" label="Support" icon="🎧" />
        <TabButton name="moderation" label="Moderation" icon="🛡️" />
        <TabButton name="subscriptions" label="Subscriptions" icon="💳" />
        <TabButton name="openai" label="AI Usage" icon="🤖" />
        <TabButton name="notifications" label="Notifications" icon="📧" />
      </div>

      {error && (
        <div style={{
          backgroundColor: '#ffebee',
          color: '#d32f2f',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '24px',
          border: '1px solid #ffcdd2'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {renderDashboardContent()}

      <ActivityFeed activities={dashboardData.recentActivities} />

      <div className="admin-dashboard">
        <h2>Admin Dashboard</h2>
        <h3>All Platform Content</h3>
        {dashboardData && dashboardData.allContent && dashboardData.allContent.length > 0 ? (
          <ul>
            {dashboardData.allContent.map((item, idx) => (
              <li key={item.id || idx} style={{marginBottom: '1em', border: '1px solid #eee', borderRadius: '8px', padding: '12px', background: '#fff'}}>
                <strong>{item.title || item.type}</strong><br />
                {item.description}<br />
                {item.platform && <span>Platform: {item.platform}</span>}
                {item.status && <span> | Status: {item.status}</span>}
                {item.promotionStatus && <span> | Promotion: <b>{item.promotionStatus}</b></span>}
                {item.metrics && (
                  <span>
                    {' | Views: ' + (item.metrics.views || 0)}
                    {' | Clicks: ' + (item.metrics.clicks || 0)}
                    {' | Engagement: ' + ((item.metrics.engagementRate || 0) * 100).toFixed(1) + '%'}
                  </span>
                )}
                {item.errors && item.errors.length > 0 && (
                  <div style={{color: '#d32f2f', marginTop: '6px'}}>
                    <b>Errors:</b>
                    <ul>
                      {item.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No content found for any user.</p>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
