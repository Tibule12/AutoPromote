import React, { useState, useEffect } from "react";
import { auth, storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { API_BASE_URL } from "../config";
import "./CommunityPanel.css";
import ExplainButton from "../components/ExplainButton";

function CommunityPanel() {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState({ title: "", content: "", category: "general" });
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100 placeholder
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [comments, setComments] = useState([]);
  const [filter, setFilter] = useState("all"); // all, questions, tips, issues

  const categories = [
    { value: "general", label: "💬 General", color: "#6366f1" },
    { value: "question", label: "❓ Question", color: "#f59e0b" },
    { value: "tip", label: "💡 Tips & Tricks", color: "#10b981" },
    { value: "issue", label: "⚠️ Issue/Bug", color: "#ef4444" },
    { value: "feature", label: "✨ Feature Request", color: "#8b5cf6" },
  ];

  // Load posts from backend feed (paginated)
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastPostId, setLastPostId] = useState(null);

  const loadFeed = async (reset = false) => {
    const user = auth.currentUser;
    if (!user) return; // require auth for feed

    setLoadingFeed(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (!reset && lastPostId) params.set("lastPostId", lastPostId);

      const url = `${API_BASE_URL}/api/community/feed?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        console.error("Failed to load feed");
        return;
      }

      const data = await res.json();
      if (reset) {
        setPosts(data.posts || []);
      } else {
        setPosts(prev => [...prev, ...(data.posts || [])]);
      }

      setHasMore(!!data.hasMore);
      if (data.posts && data.posts.length > 0) {
        setLastPostId(data.posts[data.posts.length - 1].id);
      }
    } catch (err) {
      console.error("Error loading feed:", err);
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    // initial load when user is available
    const tryLoad = async () => {
      const user = auth.currentUser;
      if (!user) return;
      await loadFeed(true);
    };
    tryLoad();
  }, []);

  const handleFileSelect = e => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // validation for size 50MB
      if (file.size > 50 * 1024 * 1024) {
        alert("File too large. Max 50MB.");
        return;
      }
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
  };

  // Create new post (via backend to centralize moderation/audit)
  const handleCreatePost = async e => {
    e.preventDefault();
    if (!newPost.title.trim() || (!newPost.content.trim() && !selectedFile)) {
      alert("Please provide a title and either content or a file.");
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();

      let mediaUrl = null;
      let mediaType = "text";

      // 1. Upload File if present
      if (selectedFile) {
        setUploadProgress(20);
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
        const storageRef = ref(storage, `community/${user.uid}/${fileName}`);

        await uploadBytes(storageRef, selectedFile);
        setUploadProgress(80);
        mediaUrl = await getDownloadURL(storageRef);

        if (selectedFile.type.startsWith("image/")) mediaType = "image";
        else if (selectedFile.type.startsWith("video/")) mediaType = "video";
        else if (selectedFile.type.startsWith("audio/")) mediaType = "audio";
      }
      setUploadProgress(90);

      // Map local fields to backend API (backend expects type/caption/mediaUrl)
      // We append category to caption as metadata if backend doesn't support it strictly yet,
      // but ideally backend should take category. We'll pass it in body and see.
      const payload = {
        type: mediaType,
        caption: `${newPost.title}\n\n${newPost.content}`,
        mediaUrl: mediaUrl,
        category: newPost.category,
      };

      const res = await fetch(`${API_BASE_URL}/api/community/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Create post failed:", err);
        alert(err.error || "Failed to create post");
        return;
      }

      setNewPost({ title: "", content: "", category: "general" });
      setSelectedFile(null);
      setFilePreview(null);
      alert("Post created successfully!");
      // Refresh feed to include new post
      setLastPostId(null);
      await loadFeed(true);
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Failed to create post");
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  // Add reply to post (via backend)
  const handleReply = async postId => {
    if (!replyText.trim()) return;

    setLoading(true);
    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ text: replyText }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Add reply failed:", err);
        alert(err.error || "Failed to add reply");
        return;
      }

      const data = await res.json();
      // Append the returned comment to local comments state
      setComments(prev => [data.comment, ...prev]);
      setReplyText("");
      alert("Reply added!");
    } catch (error) {
      console.error("Error adding reply:", error);
      alert("Failed to add reply");
    } finally {
      setLoading(false);
    }
  };

  // Like/Unlike post (via backend)
  const handleLike = async postId => {
    const user = auth.currentUser;
    const post = posts.find(p => p.id === postId);

    try {
      const token = await user.getIdToken();

      if (post.likes?.includes(user.uid) || post.hasLiked) {
        // Unlike
        const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/like`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) {
          console.error("Unlike failed");
        }
      } else {
        // Like
        const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/like`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) {
          console.error("Like failed");
        }
      }
    } catch (error) {
      console.error("Error liking post:", error);
    }
    // refresh feed to reflect counts
    await loadFeed(true);
  };

  // Mark as helpful
  const handleMarkHelpful = async postId => {
    const user = auth.currentUser;
    const post = posts.find(p => p.id === postId);

    try {
      const token = await user.getIdToken();

      if (post.hasHelpful || post.helpful?.includes(user.uid)) {
        // Unmark helpful
        const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/helpful`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) console.error("Unmark helpful failed");
      } else {
        // Mark helpful
        const res = await fetch(`${API_BASE_URL}/api/community/posts/${postId}/helpful`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) console.error("Mark helpful failed");
      }
    } catch (error) {
      console.error("Error marking helpful:", error);
    }
    // refresh feed to reflect updated helpfulCount
    await loadFeed(true);
  };

  // Open post: fetch authoritative post and comments from backend (increments views server-side)
  const handleOpenPost = async post => {
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;

      const res = await fetch(`${API_BASE_URL}/api/community/posts/${post.id}`, {
        method: "GET",
        headers: token
          ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
          : { Accept: "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedPost(data.post);
      } else {
        // Fallback to provided post
        setSelectedPost(post);
      }

      // Load comments for the post
      const commentsRes = await fetch(`${API_BASE_URL}/api/community/posts/${post.id}/comments`, {
        method: "GET",
        headers: token
          ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
          : { Accept: "application/json" },
      });

      if (commentsRes.ok) {
        const cd = await commentsRes.json();
        setComments(cd.comments || []);
      } else {
        setComments(post.replies || []);
      }
    } catch (error) {
      console.error("Error loading post details:", error);
      setSelectedPost(post);
      setComments(post.replies || []);
    }
  };

  const filteredPosts = posts.filter(post => {
    if (filter === "all") return true;
    if (filter === "questions") return post.category === "question";
    if (filter === "tips") return post.category === "tip";
    if (filter === "issues") return post.category === "issue";
    return true;
  });

  const getCategoryColor = category => {
    const cat = categories.find(c => c.value === category);
    return cat?.color || "#6366f1";
  };

  const getCategoryLabel = category => {
    const cat = categories.find(c => c.value === category);
    return cat?.label || "💬 General";
  };

  const formatDate = timestamp => {
    if (!timestamp) return "Just now";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getPostTitle = post => {
    if (!post) return "";
    if (post.title) return post.title;
    if (post.caption) {
      const parts = post.caption.split("\n\n");
      return parts[0] || post.caption;
    }
    return "";
  };

  const getPostContent = post => {
    if (!post) return "";
    if (post.content) return post.content;
    if (post.caption) {
      const parts = post.caption.split("\n\n");
      return parts.slice(1).join("\n\n") || parts[0] || "";
    }
    return "";
  };

  return (
    <div className="community-panel">
      <div className="community-header">
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          🌟 Community Help & Support{" "}
          <ExplainButton
            contextSummary={
              "Explain the community feed: post questions, tips, or issues. Posts are moderated and you can mark helpful, reply, or like posts. Use the assistant for posting tips or templates."
            }
          />
        </h2>
        <p>Connect with other users, ask questions, and share your expertise</p>
      </div>

      {!selectedPost ? (
        <>
          {/* Filter tabs */}
          <div className="community-filters">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
              All Posts
            </button>
            <button
              className={filter === "questions" ? "active" : ""}
              onClick={() => setFilter("questions")}
            >
              ❓ Questions
            </button>
            <button className={filter === "tips" ? "active" : ""} onClick={() => setFilter("tips")}>
              💡 Tips
            </button>
            <button
              className={filter === "issues" ? "active" : ""}
              onClick={() => setFilter("issues")}
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
                  onChange={e => setNewPost({ ...newPost, category: e.target.value })}
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={newPost.title}
                  onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                  placeholder="What's your question or topic?"
                  maxLength={150}
                />
              </div>

              <div className="form-group">
                <label>Content</label>
                <textarea
                  value={newPost.content}
                  onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                  placeholder="Describe your question, tip, or issue in detail..."
                  rows={4}
                  maxLength={2000}
                />
              </div>

              <div className="form-group">
                <label>Attachment (Image, Video, Audio)</label>
                <div className="file-upload-wrapper">
                  <input
                    type="file"
                    id="community-file"
                    accept="image/*,video/*,audio/*"
                    onChange={handleFileSelect}
                    className="file-input-hidden"
                    style={{ display: "none" }}
                  />
                  <label
                    htmlFor="community-file"
                    className="btn-secondary btn-sm"
                    style={{ cursor: "pointer", display: "inline-block", marginBottom: "8px" }}
                  >
                    {selectedFile ? "Change File" : "📷/🎥 Attach Media"}
                  </label>

                  {selectedFile && (
                    <div
                      className="selected-file-preview"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "0.9rem",
                        color: "#4b5563",
                      }}
                    >
                      <span>
                        📎 {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)
                      </span>
                      <button
                        type="button"
                        onClick={removeFile}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          fontWeight: "bold",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {filePreview && (
                    <div
                      className="media-preview-box"
                      style={{
                        marginTop: "10px",
                        borderRadius: "8px",
                        overflow: "hidden",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <img
                        src={filePreview}
                        alt="Preview"
                        style={{ maxWidth: "100%", maxHeight: "200px", display: "block" }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {loading && uploadProgress > 0 && uploadProgress < 100 && (
                <div
                  className="upload-progress-bar"
                  style={{
                    height: "4px",
                    background: "#e5e7eb",
                    borderRadius: "2px",
                    margin: "10px 0",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="progress-fill"
                    style={{
                      width: `${uploadProgress}%`,
                      height: "100%",
                      background: "#6366f1",
                      transition: "width 0.3s ease",
                    }}
                  ></div>
                </div>
              )}

              <button type="submit" disabled={loading} className="post-btn">
                {loading ? "Posting..." : "📤 Post to Community"}
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
                    {post.content.length > 150 ? "..." : ""}
                  </p>

                  <div className="post-stats">
                    <span>💬 {post.commentsCount || post.replies?.length || 0} replies</span>
                    <span>👍 {post.likesCount || post.likes?.length || 0} likes</span>
                    <span>✅ {post.helpfulCount || post.helpful?.length || 0} helpful</span>
                    <span>👀 {post.viewsCount || post.views || 0} views</span>
                  </div>
                </div>
              ))
            )}
            {hasMore && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button onClick={() => loadFeed(false)} disabled={loadingFeed}>
                  {loadingFeed ? "Loading..." : "Load more"}
                </button>
              </div>
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

            <h2 className="post-detail-title">{getPostTitle(selectedPost)}</h2>
            <p className="post-detail-content">{getPostContent(selectedPost)}</p>

            <div className="post-actions">
              <button
                onClick={() => handleLike(selectedPost.id)}
                className={
                  selectedPost.hasLiked || selectedPost.likes?.includes(auth.currentUser?.uid)
                    ? "active"
                    : ""
                }
              >
                👍 Like ({selectedPost.likesCount || selectedPost.likes?.length || 0})
              </button>
              <button
                onClick={() => handleMarkHelpful(selectedPost.id)}
                className={selectedPost.helpful?.includes(auth.currentUser?.uid) ? "active" : ""}
              >
                ✅ Helpful ({selectedPost.helpful?.length || 0})
              </button>
              <span className="view-count">
                👀 {selectedPost.viewsCount || selectedPost.views || 0} views
              </span>
            </div>
          </div>

          {/* Replies section */}
          <div className="replies-section">
            <h3>💬 Replies ({comments.length || 0})</h3>

            <div className="reply-form">
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Share your thoughts or solution..."
                rows={3}
                maxLength={1000}
              />
              <button
                onClick={() => handleReply(selectedPost.id)}
                disabled={loading || !replyText.trim()}
                className="reply-btn"
              >
                {loading ? "Posting..." : "💬 Post Reply"}
              </button>
            </div>

            <div className="replies-list">
              {comments.length === 0 ? (
                <div className="empty-state">
                  <p>No replies yet. Be the first to respond! 💭</p>
                </div>
              ) : (
                comments.map(reply => (
                  <div key={reply.id} className="reply-card">
                    <div className="reply-header">
                      {reply.userAvatar && (
                        <img src={reply.userAvatar} alt="" className="author-avatar-small" />
                      )}
                      <div>
                        <div className="reply-author">{reply.userName || reply.authorName}</div>
                        <div className="reply-date">{formatDate(reply.createdAt)}</div>
                      </div>
                    </div>
                    <p className="reply-content">{reply.text || reply.content}</p>
                    <div className="reply-likes">
                      👍 {reply.likesCount || reply.likes?.length || 0}
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
