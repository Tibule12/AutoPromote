import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseClient';
import { collection, addDoc, query, orderBy, limit, getDocs, doc, updateDoc, increment, arrayUnion, arrayRemove, serverTimestamp, onSnapshot } from 'firebase/firestore';
import './CommunityPanel.css';

function CommunityPanel() {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState({ title: '', content: '', category: 'general' });
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [filter, setFilter] = useState('all'); // all, questions, tips, issues

  const categories = [
    { value: 'general', label: '💬 General', color: '#6366f1' },
    { value: 'question', label: '❓ Question', color: '#f59e0b' },
    { value: 'tip', label: '💡 Tips & Tricks', color: '#10b981' },
    { value: 'issue', label: '⚠️ Issue/Bug', color: '#ef4444' },
    { value: 'feature', label: '✨ Feature Request', color: '#8b5cf6' }
  ];

  // Load posts from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'community_posts'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPosts(postsData);
    });

    return () => unsubscribe();
  }, []);

  // Create new post
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newPost.title.trim() || !newPost.content.trim()) {
      alert('Please fill in both title and content');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      await addDoc(collection(db, 'community_posts'), {
        title: newPost.title,
        content: newPost.content,
        category: newPost.category,
        authorId: user.uid,
        authorName: user.displayName || user.email.split('@')[0],
        authorPhoto: user.photoURL || null,
        createdAt: serverTimestamp(),
        replies: [],
        likes: [],
        helpful: [],
        views: 0
      });

      setNewPost({ title: '', content: '', category: 'general' });
      alert('Post created successfully!');
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  // Add reply to post
  const handleReply = async (postId) => {
    if (!replyText.trim()) return;

    setLoading(true);
    try {
      const user = auth.currentUser;
      const postRef = doc(db, 'community_posts', postId);
      
      await updateDoc(postRef, {
        replies: arrayUnion({
          id: Date.now().toString(),
          authorId: user.uid,
          authorName: user.displayName || user.email.split('@')[0],
          authorPhoto: user.photoURL || null,
          content: replyText,
          createdAt: new Date().toISOString(),
          likes: []
        })
      });

      setReplyText('');
      alert('Reply added!');
    } catch (error) {
      console.error('Error adding reply:', error);
      alert('Failed to add reply');
    } finally {
      setLoading(false);
    }
  };

  // Like/Unlike post
  const handleLike = async (postId) => {
    const user = auth.currentUser;
    const postRef = doc(db, 'community_posts', postId);
    const post = posts.find(p => p.id === postId);
    
    try {
      if (post.likes?.includes(user.uid)) {
        await updateDoc(postRef, {
          likes: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(postRef, {
          likes: arrayUnion(user.uid)
        });
      }
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  // Mark as helpful
  const handleMarkHelpful = async (postId) => {
    const user = auth.currentUser;
    const postRef = doc(db, 'community_posts', postId);
    const post = posts.find(p => p.id === postId);
    
    try {
      if (post.helpful?.includes(user.uid)) {
        await updateDoc(postRef, {
          helpful: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(postRef, {
          helpful: arrayUnion(user.uid)
        });
      }
    } catch (error) {
      console.error('Error marking helpful:', error);
    }
  };

  // Increment view count when opening post
  const handleOpenPost = async (post) => {
    setSelectedPost(post);
    const postRef = doc(db, 'community_posts', post.id);
    try {
      await updateDoc(postRef, {
        views: increment(1)
      });
    } catch (error) {
      console.error('Error updating views:', error);
    }
  };

  const filteredPosts = posts.filter(post => {
    if (filter === 'all') return true;
    if (filter === 'questions') return post.category === 'question';
    if (filter === 'tips') return post.category === 'tip';
    if (filter === 'issues') return post.category === 'issue';
    return true;
  });

  const getCategoryColor = (category) => {
    const cat = categories.find(c => c.value === category);
    return cat?.color || '#6366f1';
  };

  const getCategoryLabel = (category) => {
    const cat = categories.find(c => c.value === category);
    return cat?.label || '💬 General';
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="community-panel">
      <div className="community-header">
        <h2>🌟 Community Help & Support</h2>
        <p>Connect with other users, ask questions, and share your expertise</p>
      </div>

      {!selectedPost ? (
        <>
          {/* Filter tabs */}
          <div className="community-filters">
            <button 
              className={filter === 'all' ? 'active' : ''} 
              onClick={() => setFilter('all')}
            >
              All Posts
            </button>
            <button 
              className={filter === 'questions' ? 'active' : ''} 
              onClick={() => setFilter('questions')}
            >
              ❓ Questions
            </button>
            <button 
              className={filter === 'tips' ? 'active' : ''} 
              onClick={() => setFilter('tips')}
            >
              💡 Tips
            </button>
            <button 
              className={filter === 'issues' ? 'active' : ''} 
              onClick={() => setFilter('issues')}
            >
              ⚠️ Issues
            </button>
          </div>

          {/* Create new post form */}
          <div className="create-post-card">
            <h3>Create New Post</h3>
            <form onSubmit={handleCreatePost}>
              <div className="form-group">
                <label>Category</label>
                <select 
                  value={newPost.category} 
                  onChange={(e) => setNewPost({...newPost, category: e.target.value})}
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={newPost.title}
                  onChange={(e) => setNewPost({...newPost, title: e.target.value})}
                  placeholder="What's your question or topic?"
                  maxLength={150}
                />
              </div>

              <div className="form-group">
                <label>Content</label>
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost({...newPost, content: e.target.value})}
                  placeholder="Describe your question, tip, or issue in detail..."
                  rows={4}
                  maxLength={2000}
                />
              </div>

              <button type="submit" disabled={loading} className="post-btn">
                {loading ? 'Posting...' : '📤 Post to Community'}
              </button>
            </form>
          </div>

          {/* Posts list */}
          <div className="posts-list">
            <h3>Recent Posts ({filteredPosts.length})</h3>
            {filteredPosts.length === 0 ? (
              <div className="empty-state">
                <p>No posts yet. Be the first to start a conversation! 🚀</p>
              </div>
            ) : (
              filteredPosts.map(post => (
                <div key={post.id} className="post-card" onClick={() => handleOpenPost(post)}>
                  <div className="post-header">
                    <span 
                      className="post-category" 
                      style={{ backgroundColor: getCategoryColor(post.category) }}
                    >
                      {getCategoryLabel(post.category)}
                    </span>
                    <div className="post-meta">
                      {post.authorPhoto && (
                        <img src={post.authorPhoto} alt="" className="author-avatar-small" />
                      )}
                      <span className="author-name">{post.authorName}</span>
                      <span className="post-date">{formatDate(post.createdAt)}</span>
                    </div>
                  </div>

                  <h4 className="post-title">{post.title}</h4>
                  <p className="post-preview">
                    {post.content.substring(0, 150)}
                    {post.content.length > 150 ? '...' : ''}
                  </p>

                  <div className="post-stats">
                    <span>💬 {post.replies?.length || 0} replies</span>
                    <span>👍 {post.likes?.length || 0} likes</span>
                    <span>✅ {post.helpful?.length || 0} helpful</span>
                    <span>👀 {post.views || 0} views</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        // Single post view
        <div className="post-detail">
          <button className="back-btn" onClick={() => setSelectedPost(null)}>
            ← Back to Posts
          </button>

          <div className="post-detail-card">
            <div className="post-detail-header">
              <span 
                className="post-category" 
                style={{ backgroundColor: getCategoryColor(selectedPost.category) }}
              >
                {getCategoryLabel(selectedPost.category)}
              </span>
              <div className="post-author-info">
                {selectedPost.authorPhoto && (
                  <img src={selectedPost.authorPhoto} alt="" className="author-avatar" />
                )}
                <div>
                  <div className="author-name-large">{selectedPost.authorName}</div>
                  <div className="post-date">{formatDate(selectedPost.createdAt)}</div>
                </div>
              </div>
            </div>

            <h2 className="post-detail-title">{selectedPost.title}</h2>
            <p className="post-detail-content">{selectedPost.content}</p>

            <div className="post-actions">
              <button 
                onClick={() => handleLike(selectedPost.id)}
                className={selectedPost.likes?.includes(auth.currentUser?.uid) ? 'active' : ''}
              >
                👍 Like ({selectedPost.likes?.length || 0})
              </button>
              <button 
                onClick={() => handleMarkHelpful(selectedPost.id)}
                className={selectedPost.helpful?.includes(auth.currentUser?.uid) ? 'active' : ''}
              >
                ✅ Helpful ({selectedPost.helpful?.length || 0})
              </button>
              <span className="view-count">👀 {selectedPost.views || 0} views</span>
            </div>
          </div>

          {/* Replies section */}
          <div className="replies-section">
            <h3>💬 Replies ({selectedPost.replies?.length || 0})</h3>
            
            <div className="reply-form">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Share your thoughts or solution..."
                rows={3}
                maxLength={1000}
              />
              <button 
                onClick={() => handleReply(selectedPost.id)} 
                disabled={loading || !replyText.trim()}
                className="reply-btn"
              >
                {loading ? 'Posting...' : '💬 Post Reply'}
              </button>
            </div>

            <div className="replies-list">
              {selectedPost.replies?.length === 0 ? (
                <div className="empty-state">
                  <p>No replies yet. Be the first to respond! 💭</p>
                </div>
              ) : (
                selectedPost.replies?.map(reply => (
                  <div key={reply.id} className="reply-card">
                    <div className="reply-header">
                      {reply.authorPhoto && (
                        <img src={reply.authorPhoto} alt="" className="author-avatar-small" />
                      )}
                      <div>
                        <div className="reply-author">{reply.authorName}</div>
                        <div className="reply-date">{formatDate(reply.createdAt)}</div>
                      </div>
                    </div>
                    <p className="reply-content">{reply.content}</p>
                    <div className="reply-likes">
                      👍 {reply.likes?.length || 0}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommunityPanel;
