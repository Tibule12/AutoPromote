import React, { useState, useEffect } from "react";
import { auth } from "./firebaseClient";
import { API_BASE_URL } from "./config";
import "./WolfPackFeed.css";

// -- ICONS --
const HeartIcon = ({ filled }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="18" cy="5" r="3"></circle>
    <circle cx="6" cy="12" r="3"></circle>
    <circle cx="18" cy="19" r="3"></circle>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
  </svg>
);

const WolfPackFeed = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, trending, viral

  // MOCK DATA IF API FAILS
  const MOCK_POSTS = [
    {
      id: 1,
      user: "CryptoKing",
      avatar: "",
      caption: "This strategy is printing money right now. Watch till the end. #alpha",
      likes: 1204,
      shares: 342,
      time: "2h ago",
      type: "text",
    },
    {
      id: 2,
      user: "AlphaWolf_99",
      avatar: "",
      caption: "Market is bleeding but we are eating. Here is the play.",
      likes: 850,
      shares: 120,
      time: "5h ago",
      type: "video",
    },
    {
      id: 3,
      user: "HustleGPT",
      avatar: "",
      caption: "Just automated my entire outreach workflow. DM for the script.",
      likes: 2100,
      shares: 900,
      time: "1d ago",
      type: "image",
    },
  ];

  useEffect(() => {
    fetchFeed();
  }, [filter]);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      // Using existing endpoint structure but mapping to new UI
      const res = await fetch(`${API_BASE_URL}/api/community/feed?category=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || MOCK_POSTS);
      } else {
        setPosts(MOCK_POSTS);
      }
    } catch (err) {
      console.error(err);
      setPosts(MOCK_POSTS);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: "all", label: "All Intel" },
    { id: "trending", label: "🔥 Trending" },
    { id: "viral", label: "🚀 Viral" },
    { id: "educational", label: "🧠 Strategy" },
  ];

  const handleLike = async postId => {
    // Optimistic UI update
    setPosts(posts.map(p => (p.id === postId ? { ...p, likes: p.likes + 1 } : p)));
    // TODO: Call API
  };

  return (
    <div className="wolf-feed-container">
      {/* Filters */}
      <div className="wolf-filters">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`wolf-filter-btn ${filter === cat.id ? "active" : ""}`}
            onClick={() => setFilter(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="wolf-loading">SCANNING NETWORK...</div>
      ) : (
        <div className="wolf-posts">
          {posts.map(post => (
            <div key={post.id} className="wolf-post-card">
              <div className="wolf-post-header">
                <div className="wolf-user-info">
                  <div className="wolf-avatar" style={{ background: "#333" }}></div>
                  <div>
                    <div className="wolf-username">{post.user}</div>
                    <div className="wolf-timestamp">{post.time}</div>
                  </div>
                </div>
              </div>

              <div className="wolf-media-container">
                {/* Placeholder for media */}
                <div style={{ color: "#444" }}>
                  {post.type === "video" ? "▶ VIDEO CONTENT" : "IMAGE/TEXT CONTENT"}
                </div>
              </div>

              <div className="wolf-caption">{post.caption}</div>

              <div className="wolf-actions">
                <button className="wolf-action-btn" onClick={() => handleLike(post.id)}>
                  <HeartIcon /> {post.likes}
                </button>
                <button className="wolf-action-btn">
                  <ShareIcon /> {post.shares}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WolfPackFeed;
