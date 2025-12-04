// CommunityFeed.js - Viral AI Clip Discovery Platform
// Built to keep creators engaged, discovering, and begging for more features

import React, { useState, useEffect, useRef } from 'react';
import { auth } from './firebaseClient';
import { API_BASE_URL } from './config';
import toast from 'react-hot-toast';
import './CommunityFeed.css';

const CommunityFeed = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('discover'); // discover, following, trending, viral, my-clips
  const [newPostType, setNewPostType] = useState('video');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newPostData, setNewPostData] = useState({
    caption: '',
    mediaUrl: '',
    thumbnailUrl: ''
  });
  const [commentTexts, setCommentTexts] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [followingUsers, setFollowingUsers] = useState([]);
  const [suggestedCreators, setSuggestedCreators] = useState([]);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all'); // all, funny, emotional, inspiring, educational
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const videoRefs = useRef([]);

  // Emotion/category filters for viral content
  const contentCategories = [
    { id: 'all', label: '🌟 All Clips', emoji: '🌟' },
    { id: 'funny', label: '😂 Funny', emoji: '😂' },
    { id: 'emotional', label: '😢 Emotional', emoji: '😢' },
    { id: 'inspiring', label: '💪 Inspiring', emoji: '💪' },
    { id: 'educational', label: '🎓 Educational', emoji: '🎓' },
    { id: 'trending', label: '🔥 Viral Now', emoji: '🔥' }
  ];

  useEffect(() => {
    fetchFeed();
    fetchFollowingList();
    fetchSuggestedCreators();
  }, [activeTab, filterCategory]);

  // Auto-scroll to next video (TikTok-style)
  useEffect(() => {
    if (autoplayEnabled && posts.length > 0) {
      const timer = setInterval(() => {
        setCurrentVideoIndex((prev) => (prev + 1) % posts.length);
      }, 15000); // 15 seconds per video
      return () => clearInterval(timer);
    }
  }, [autoplayEnabled, posts.length]);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      let endpoint = '';
      
      switch (activeTab) {
        case 'discover':
          // Prioritize AI-generated clips, sorted by performance
          endpoint = `${API_BASE_URL}/api/community/feed?type=video&sortBy=engagement&aiClipsOnly=true&category=${filterCategory}`;
          break;
        case 'following':
          endpoint = `${API_BASE_URL}/api/community/feed?following=true`;
          break;
        case 'trending':
          endpoint = `${API_BASE_URL}/api/community/trending?timeRange=24h`;
          break;
        case 'viral':
          endpoint = `${API_BASE_URL}/api/community/trending?timeRange=7d&minEngagement=100`;
          break;
        case 'my-clips':
          endpoint = `${API_BASE_URL}/api/community/user/${auth.currentUser?.uid}/posts`;
          break;
        default:
          endpoint = `${API_BASE_URL}/api/community/feed`;
      }

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || data);
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
      toast.error('Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowingList = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/following`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFollowingUsers(data.following || []);
      }
    } catch (error) {
      console.error('Error fetching following:', error);
    }
  };

  const fetchSuggestedCreators = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/suggestions?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedCreators(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  const handleFollowUser = async (userId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/follow/${userId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        setFollowingUsers([...followingUsers, userId]);
        toast.success('✅ Following creator!');
        fetchSuggestedCreators(); // Refresh suggestions
      }
    } catch (error) {
      console.error('Error following user:', error);
      toast.error('Failed to follow user');
    }
  };

  const handleUnfollowUser = async (userId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/follow/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        setFollowingUsers(followingUsers.filter(id => id !== userId));
        toast.success('Unfollowed');
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      toast.error('Failed to unfollow');
    }
  };

  const handleCreatePost = async () => {
    if (!newPostData.caption.trim()) {
      toast.error('Please add a caption');
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type: newPostType,
          caption: newPostData.caption,
          mediaUrl: newPostData.mediaUrl,
          thumbnailUrl: newPostData.thumbnailUrl
        })
      });

      if (res.ok) {
        toast.success('🎉 Posted to community!');
        setShowCreatePost(false);
        setNewPostData({ caption: '', mediaUrl: '', thumbnailUrl: '' });
        fetchFeed();
      } else {
        toast.error('Failed to create post');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    }
  };

  const handleLike = async (postId, isLiked) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const method = isLiked ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/like`, {
        method,
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setPosts(posts.map(post => 
          post.id === postId 
            ? { 
                ...post, 
                likesCount: isLiked ? post.likesCount - 1 : post.likesCount + 1,
                isLiked: !isLiked 
              }
            : post
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleComment = async (postId) => {
    const text = commentTexts[postId]?.trim();
    if (!text) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });

      if (res.ok) {
        toast.success('Comment added!');
        setCommentTexts({ ...commentTexts, [postId]: '' });
        // Refresh comments for this post
        fetchCommentsForPost(postId);
      }
    } catch (error) {
      console.error('Error commenting:', error);
      toast.error('Failed to add comment');
    }
  };

  const fetchCommentsForPost = async (postId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/comments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setPosts(posts.map(post => 
          post.id === postId 
            ? { ...post, comments: data.comments, commentsCount: data.comments.length }
            : post
        ));
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleShare = async (postId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ platform: 'internal' })
      });

      if (res.ok) {
        toast.success('📤 Shared!');
        setPosts(posts.map(post => 
          post.id === postId 
            ? { ...post, sharesCount: post.sharesCount + 1 }
            : post
        ));
      }
    } catch (error) {
      console.error('Error sharing:', error);
      toast.error('Failed to share');
    }
  };

  const toggleComments = (postId) => {
    if (expandedComments[postId]) {
      setExpandedComments({ ...expandedComments, [postId]: false });
    } else {
      setExpandedComments({ ...expandedComments, [postId]: true });
      if (!posts.find(p => p.id === postId)?.comments) {
        fetchCommentsForPost(postId);
      }
    }
  };

  const getAvatarUrl = (userName) => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=random&size=128`;
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="community-feed">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading viral clips...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="community-feed">
      {/* Sticky Header with Call-to-Action */}
      <div className="community-header sticky">
        <div className="header-content">
          <h2>🎬 AI Clip Studio</h2>
          <p className="tagline">Discover the best AI-generated clips from top creators</p>
        </div>
        <div className="header-actions">
          <button 
            className="follow-btn pulse" 
            onClick={() => setShowFollowModal(true)}
            title="Find creators to follow"
          >
            👥 Find Creators ({followingUsers.length} following)
          </button>
          <button className="create-post-btn" onClick={() => setShowCreatePost(true)}>
            ➕ Share Your Clip
          </button>
        </div>
      </div>

      {/* Category Filters */}
      <div className="category-filters">
        {contentCategories.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${filterCategory === cat.id ? 'active' : ''}`}
            onClick={() => setFilterCategory(cat.id)}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {/* Feed Navigation */}
      <div className="feed-tabs">
        <button 
          className={activeTab === 'discover' ? 'active' : ''} 
          onClick={() => setActiveTab('discover')}
        >
          🌟 Discover
        </button>
        <button 
          className={activeTab === 'following' ? 'active' : ''} 
          onClick={() => setActiveTab('following')}
        >
          👥 Following {followingUsers.length > 0 && `(${followingUsers.length})`}
        </button>
        <button 
          className={activeTab === 'trending' ? 'active' : ''} 
          onClick={() => setActiveTab('trending')}
        >
          📈 Trending 24h
        </button>
        <button 
          className={activeTab === 'viral' ? 'active' : ''} 
          onClick={() => setActiveTab('viral')}
        >
          🔥 Viral This Week
        </button>
        <button 
          className={activeTab === 'my-clips' ? 'active' : ''} 
          onClick={() => setActiveTab('my-clips')}
        >
          📹 My Clips
        </button>
      </div>

      {/* Engagement Prompt Banner */}
      {followingUsers.length === 0 && activeTab !== 'my-clips' && (
        <div className="engagement-banner">
          <div className="banner-content">
            <h3>🚀 Start following creators to build your feed!</h3>
            <p>Discover top performers and get notified when they drop new viral clips</p>
            <button onClick={() => setShowFollowModal(true)} className="cta-btn">
              Find Creators to Follow
            </button>
          </div>
        </div>
      )}

      {/* Posts Container */}
      <div className="posts-container">
        {posts.length === 0 ? (
          <div className="no-posts">
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <h3>No clips found</h3>
              <p>
                {activeTab === 'following' 
                  ? 'Follow some creators to see their clips here!'
                  : activeTab === 'my-clips'
                  ? 'Share your first AI-generated clip to get started!'
                  : 'Be the first to share a clip in this category!'}
              </p>
              {activeTab === 'following' && (
                <button onClick={() => setShowFollowModal(true)} className="cta-btn">
                  Find Creators
                </button>
              )}
            </div>
          </div>
        ) : (
          posts.map((post, index) => (
            <div key={post.id} className="post-card" data-index={index}>
              {/* Post Header */}
              <div className="post-header">
                <div className="post-author">
                  <img 
                    src={post.authorAvatar || getAvatarUrl(post.userName)} 
                    alt={post.userName}
                    className="author-avatar"
                  />
                  <div className="author-info">
                    <div className="author-name-row">
                      <span className="author-name">{post.userName || 'Anonymous'}</span>
                      {post.isAIGenerated && <span className="ai-badge">✨ AI Clip</span>}
                      {post.isVerified && <span className="verified-badge">✓</span>}
                    </div>
                    <span className="post-time">{formatTimeAgo(post.createdAt)}</span>
                  </div>
                </div>
                <div className="post-menu">
                  {!followingUsers.includes(post.userId) && post.userId !== auth.currentUser?.uid && (
                    <button 
                      className="follow-btn-small"
                      onClick={() => handleFollowUser(post.userId)}
                    >
                      + Follow
                    </button>
                  )}
                  {followingUsers.includes(post.userId) && (
                    <button 
                      className="following-btn-small"
                      onClick={() => handleUnfollowUser(post.userId)}
                    >
                      ✓ Following
                    </button>
                  )}
                </div>
              </div>

              {/* Post Caption */}
              {post.caption && (
                <div className="post-caption">
                  <p>{post.caption}</p>
                </div>
              )}

              {/* Post Media */}
              {post.mediaUrl && (
                <div className="post-media">
                  {post.type === 'video' && (
                    <video 
                      ref={el => videoRefs.current[index] = el}
                      src={post.mediaUrl} 
                      poster={post.thumbnailUrl}
                      controls 
                      className="post-video"
                      onPlay={() => setAutoplayEnabled(false)}
                    />
                  )}
                  {post.type === 'image' && (
                    <img src={post.mediaUrl} alt="Post" className="post-image" />
                  )}
                  {post.type === 'audio' && (
                    <audio src={post.mediaUrl} controls className="post-audio" />
                  )}
                </div>
              )}

              {/* Performance Stats (for AI clips) */}
              {post.performanceScore && (
                <div className="performance-stats">
                  <span className="perf-label">Performance Score:</span>
                  <div className="perf-bar">
                    <div 
                      className="perf-fill" 
                      style={{ width: `${Math.min(post.performanceScore, 100)}%` }}
                    />
                  </div>
                  <span className="perf-score">{post.performanceScore}/100</span>
                </div>
              )}

              {/* Post Stats */}
              <div className="post-stats">
                <span>{post.likesCount || 0} likes</span>
                <span>{post.commentsCount || 0} comments</span>
                <span>{post.sharesCount || 0} shares</span>
                <span>{post.viewsCount || 0} views</span>
              </div>

              {/* Post Actions */}
              <div className="post-actions">
                <button 
                  className={`action-btn ${post.isLiked ? 'liked' : ''}`}
                  onClick={() => handleLike(post.id, post.isLiked)}
                >
                  {post.isLiked ? '❤️' : '🤍'} Like
                </button>
                <button 
                  className="action-btn"
                  onClick={() => toggleComments(post.id)}
                >
                  💬 Comment
                </button>
                <button 
                  className="action-btn"
                  onClick={() => handleShare(post.id)}
                >
                  📤 Share
                </button>
              </div>

              {/* Comments Section */}
              {expandedComments[post.id] && (
                <div className="comments-section">
                  <div className="add-comment">
                    <input
                      type="text"
                      placeholder="Add a comment..."
                      value={commentTexts[post.id] || ''}
                      onChange={(e) => setCommentTexts({ ...commentTexts, [post.id]: e.target.value })}
                      onKeyPress={(e) => e.key === 'Enter' && handleComment(post.id)}
                    />
                    <button onClick={() => handleComment(post.id)}>Post</button>
                  </div>
                  <div className="comments-list">
                    {post.comments && post.comments.length > 0 ? (
                      post.comments.map(comment => (
                        <div key={comment.id} className="comment">
                          <img 
                            src={getAvatarUrl(comment.userName)} 
                            alt={comment.userName}
                            className="comment-avatar"
                          />
                          <div className="comment-content">
                            <div className="comment-author">{comment.userName}</div>
                            <div className="comment-text">{comment.text}</div>
                            <div className="comment-time">{formatTimeAgo(comment.createdAt)}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-comments">No comments yet. Be the first!</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Follow Modal */}
      {showFollowModal && (
        <div className="modal-overlay" onClick={() => setShowFollowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🌟 Discover Top Creators</h3>
              <button className="close-btn" onClick={() => setShowFollowModal(false)}>×</button>
            </div>
            <div className="suggested-creators">
              {suggestedCreators.length > 0 ? (
                suggestedCreators.map(creator => (
                  <div key={creator.userId} className="creator-card">
                    <img 
                      src={creator.avatar || getAvatarUrl(creator.userName)} 
                      alt={creator.userName}
                      className="creator-avatar"
                    />
                    <div className="creator-info">
                      <div className="creator-name">{creator.userName}</div>
                      <div className="creator-stats">
                        {creator.postsCount} clips • {creator.followersCount} followers
                      </div>
                      <div className="creator-bio">{creator.bio || 'Creating amazing AI clips'}</div>
                    </div>
                    <button 
                      className="follow-btn-card"
                      onClick={() => handleFollowUser(creator.userId)}
                      disabled={followingUsers.includes(creator.userId)}
                    >
                      {followingUsers.includes(creator.userId) ? '✓ Following' : '+ Follow'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="no-suggestions">
                  <p>No suggestions available yet. Check back soon!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Post Modal */}
      {showCreatePost && (
        <div className="create-post-modal" onClick={() => setShowCreatePost(false)}>
          <div className="create-post-content" onClick={(e) => e.stopPropagation()}>
            <h3>Share Your AI Clip</h3>
            <div className="post-type-selector">
              <button 
                className={`type-btn ${newPostType === 'video' ? 'active' : ''}`}
                onClick={() => setNewPostType('video')}
              >
                🎥 Video
              </button>
              <button 
                className={`type-btn ${newPostType === 'image' ? 'active' : ''}`}
                onClick={() => setNewPostType('image')}
              >
                🖼️ Image
              </button>
              <button 
                className={`type-btn ${newPostType === 'audio' ? 'active' : ''}`}
                onClick={() => setNewPostType('audio')}
              >
                🎵 Audio
              </button>
            </div>
            <textarea
              placeholder="Add a caption... (tell us what makes this clip special!)"
              value={newPostData.caption}
              onChange={(e) => setNewPostData({ ...newPostData, caption: e.target.value })}
              rows={4}
            />
            {newPostType !== 'text' && (
              <>
                <input
                  type="url"
                  placeholder="Media URL"
                  value={newPostData.mediaUrl}
                  onChange={(e) => setNewPostData({ ...newPostData, mediaUrl: e.target.value })}
                />
                {newPostType === 'video' && (
                  <input
                    type="url"
                    placeholder="Thumbnail URL (optional)"
                    value={newPostData.thumbnailUrl}
                    onChange={(e) => setNewPostData({ ...newPostData, thumbnailUrl: e.target.value })}
                  />
                )}
              </>
            )}
            <div className="create-post-actions">
              <button className="cancel-btn" onClick={() => setShowCreatePost(false)}>Cancel</button>
              <button className="post-btn" onClick={handleCreatePost}>Share Clip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityFeed;
