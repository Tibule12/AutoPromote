import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { auth } from '../firebaseClient';

function CommunityModerationPanel() {
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, flagged, active
  const [selectedPosts, setSelectedPosts] = useState([]);
  const [view, setView] = useState('posts'); // posts, comments, stats

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      
      // Fetch posts
      const postsRes = await fetch(
        `${API_BASE_URL}/api/admin/community/posts?${filter === 'flagged' ? 'flagged=true' : ''}${filter !== 'all' && filter !== 'flagged' ? `status=${filter}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const postsData = await postsRes.json();
      if (postsData.success) setPosts(postsData.posts);

      // Fetch comments
      const commentsRes = await fetch(
        `${API_BASE_URL}/api/admin/community/comments`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const commentsData = await commentsRes.json();
      if (commentsData.success) setComments(commentsData.comments);

      // Fetch stats
      const statsRes = await fetch(
        `${API_BASE_URL}/api/admin/community/stats`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.stats);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching community data:', error);
      setLoading(false);
    }
  };

  const handlePostAction = async (postId, action, reason = '') => {
    try {
      const token = await auth.currentUser?.getIdToken();
      let url, method, body;

      if (action === 'delete') {
        url = `${API_BASE_URL}/api/admin/community/posts/${postId}`;
        method = 'DELETE';
        body = JSON.stringify({ reason });
      } else if (action === 'flag' || action === 'unflag') {
        url = `${API_BASE_URL}/api/admin/community/posts/${postId}/flag`;
        method = 'POST';
        body = JSON.stringify({ action, reason });
      }

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message);
        fetchData();
      }
    } catch (error) {
      console.error('Error performing action:', error);
      alert('Failed to perform action');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedPosts.length === 0) {
      alert('Please select posts first');
      return;
    }

    const reason = prompt(`Enter reason for bulk ${action}:`);
    if (!reason) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/community/posts/bulk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ postIds: selectedPosts, action, reason })
      });

      const data = await response.json();
      if (data.success) {
        alert(`Bulk ${action} completed: ${data.count} posts`);
        setSelectedPosts([]);
        fetchData();
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
      alert('Failed to perform bulk action');
    }
  };

  const handleBanUser = async (userId) => {
    const reason = prompt('Enter ban reason:');
    if (!reason) return;

    const duration = parseInt(prompt('Ban duration in days (0 for permanent):') || '0');

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/community/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'ban', reason, duration: duration || null })
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message);
        fetchData();
      }
    } catch (error) {
      console.error('Error banning user:', error);
      alert('Failed to ban user');
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading community data...</div>;
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Stats Overview */}
      {stats && (
        <div style={{ display: 'flex', gap: 15, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={statCardStyle}>
            <div style={statValueStyle}>{stats.totalPosts}</div>
            <div style={statLabelStyle}>Total Posts</div>
          </div>
          <div style={statCardStyle}>
            <div style={statValueStyle}>{stats.totalComments}</div>
            <div style={statLabelStyle}>Total Comments</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: '#ed6c02' }}>{stats.flaggedPosts}</div>
            <div style={statLabelStyle}>Flagged Posts</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ ...statValueStyle, color: '#2e7d32' }}>{stats.newPostsToday}</div>
            <div style={statLabelStyle}>New Today</div>
          </div>
        </div>
      )}

      {/* View Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setView('posts')} style={view === 'posts' ? activeTabStyle : tabStyle}>
          Posts
        </button>
        <button onClick={() => setView('comments')} style={view === 'comments' ? activeTabStyle : tabStyle}>
          Comments
        </button>
      </div>

      {/* Filters and Bulk Actions */}
      {view === 'posts' && (
        <>
          <div style={{ display: 'flex', gap: 15, marginBottom: 20, alignItems: 'center' }}>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={selectStyle}>
              <option value="all">All Posts</option>
              <option value="active">Active</option>
              <option value="flagged">Flagged</option>
              <option value="deleted">Deleted</option>
            </select>

            {selectedPosts.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => handleBulkAction('delete')} style={dangerButtonStyle}>
                  Delete Selected ({selectedPosts.length})
                </button>
                <button onClick={() => handleBulkAction('flag')} style={warningButtonStyle}>
                  Flag Selected ({selectedPosts.length})
                </button>
                <button onClick={() => handleBulkAction('approve')} style={successButtonStyle}>
                  Approve Selected ({selectedPosts.length})
                </button>
              </div>
            )}
          </div>

          {/* Posts List */}
          <div style={containerStyle}>
            {posts.map(post => (
              <div key={post.id} style={postCardStyle}>
                <div style={{ display: 'flex', gap: 15 }}>
                  <input
                    type="checkbox"
                    checked={selectedPosts.includes(post.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPosts([...selectedPosts, post.id]);
                      } else {
                        setSelectedPosts(selectedPosts.filter(id => id !== post.id));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <strong>{post.user?.name || 'Unknown User'}</strong>
                        <span style={{ color: '#666', marginLeft: 10, fontSize: '0.9rem' }}>
                          {post.user?.email}
                        </span>
                      </div>
                      <span style={{
                        ...badgeStyle,
                        backgroundColor: post.status === 'active' ? '#e8f5e9' : 
                                       post.status === 'flagged' ? '#fff3e0' : '#ffebee',
                        color: post.status === 'active' ? '#2e7d32' :
                               post.status === 'flagged' ? '#ed6c02' : '#d32f2f'
                      }}>
                        {post.status}
                      </span>
                    </div>

                    <p style={{ margin: '10px 0' }}>{post.content}</p>

                    {post.mediaUrl && (
                      <div style={{ margin: '10px 0' }}>
                        {post.type === 'video' && (
                          <video src={post.mediaUrl} style={{ maxWidth: 300, borderRadius: 8 }} controls />
                        )}
                        {post.type === 'image' && (
                          <img src={post.mediaUrl} alt="post" style={{ maxWidth: 300, borderRadius: 8 }} />
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: '0.9rem', color: '#666', marginTop: 10 }}>
                      👍 {post.likesCount || 0} • 💬 {post.commentsCount || 0} • 🔄 {post.sharesCount || 0}
                      {post.flagCount > 0 && (
                        <span style={{ marginLeft: 15, color: '#ed6c02' }}>
                          🚩 {post.flagCount} flags
                        </span>
                      )}
                    </div>

                    {post.flagReason && (
                      <div style={{ marginTop: 10, padding: 10, backgroundColor: '#fff3e0', borderRadius: 6 }}>
                        <strong>Flag Reason:</strong> {post.flagReason}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                      <button onClick={() => handlePostAction(post.id, 'delete')} style={smallDangerButtonStyle}>
                        Delete
                      </button>
                      {post.status === 'flagged' ? (
                        <button onClick={() => handlePostAction(post.id, 'unflag')} style={smallSuccessButtonStyle}>
                          Unflag
                        </button>
                      ) : (
                        <button onClick={() => handlePostAction(post.id, 'flag')} style={smallWarningButtonStyle}>
                          Flag
                        </button>
                      )}
                      <button onClick={() => handleBanUser(post.userId)} style={smallDangerButtonStyle}>
                        Ban User
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Comments View */}
      {view === 'comments' && (
        <div style={containerStyle}>
          {comments.slice(0, 50).map(comment => (
            <div key={comment.id} style={postCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <strong>{comment.user?.name || 'Unknown User'}</strong>
                  <span style={{ color: '#666', marginLeft: 10, fontSize: '0.9rem' }}>
                    {comment.user?.email}
                  </span>
                </div>
              </div>
              <p>{comment.text}</p>
              <button
                onClick={async () => {
                  const reason = prompt('Enter deletion reason:');
                  if (!reason) return;
                  try {
                    const token = await auth.currentUser?.getIdToken();
                    await fetch(`${API_BASE_URL}/api/admin/community/comments/${comment.id}`, {
                      method: 'DELETE',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ reason })
                    });
                    fetchData();
                  } catch (error) {
                    console.error(error);
                  }
                }}
                style={smallDangerButtonStyle}
              >
                Delete Comment
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Styles
const statCardStyle = {
  backgroundColor: 'white',
  padding: 20,
  borderRadius: 12,
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  flex: '1 1 200px',
  minWidth: 150
};

const statValueStyle = {
  fontSize: '2rem',
  fontWeight: 'bold',
  color: '#1976d2'
};

const statLabelStyle = {
  fontSize: '0.9rem',
  color: '#666',
  marginTop: 5
};

const tabStyle = {
  padding: '10px 20px',
  border: '1px solid #ddd',
  backgroundColor: 'white',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: '0.95rem'
};

const activeTabStyle = {
  ...tabStyle,
  backgroundColor: '#1976d2',
  color: 'white',
  borderColor: '#1976d2'
};

const selectStyle = {
  padding: '10px 15px',
  borderRadius: 8,
  border: '1px solid #ddd',
  fontSize: '0.95rem'
};

const containerStyle = {
  backgroundColor: 'white',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
};

const postCardStyle = {
  padding: 15,
  borderBottom: '1px solid #eee',
  marginBottom: 15
};

const badgeStyle = {
  padding: '4px 12px',
  borderRadius: 6,
  fontSize: '0.85rem',
  fontWeight: '500'
};

const dangerButtonStyle = {
  padding: '10px 20px',
  backgroundColor: '#d32f2f',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: '0.9rem'
};

const warningButtonStyle = {
  padding: '10px 20px',
  backgroundColor: '#ed6c02',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: '0.9rem'
};

const successButtonStyle = {
  padding: '10px 20px',
  backgroundColor: '#2e7d32',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: '0.9rem'
};

const smallDangerButtonStyle = {
  padding: '6px 12px',
  backgroundColor: '#d32f2f',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.85rem'
};

const smallWarningButtonStyle = {
  padding: '6px 12px',
  backgroundColor: '#ed6c02',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.85rem'
};

const smallSuccessButtonStyle = {
  padding: '6px 12px',
  backgroundColor: '#2e7d32',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.85rem'
};

export default CommunityModerationPanel;
