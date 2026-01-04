import React, { useEffect, useState } from "react";
import "../LiveWatch.css";
import { auth } from "../firebaseClient";

export default function FloatingActions({ onLike, onComment, onShare, onCreate }) {
  const [likeCount, setLikeCount] = useState(4088);
  const [commentCount, setCommentCount] = useState(29);
  const [shareCount, setShareCount] = useState(347);
  const [liked, setLiked] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    const u = auth.currentUser;
    if (u && u.photoURL) setPhotoUrl(u.photoURL);
  }, []);

  return (
    <div className="fab-stack" role="navigation" aria-label="Floating actions">
      <div className="fab-avatar" title="Profile">
        {photoUrl ? <img src={photoUrl} alt="profile" /> : <span>🙂</span>}
      </div>

      <div className="fab-with-count">
        <button
          className={`fab like-btn ${liked ? "liked" : ""}`}
          aria-label={`Like (${likeCount})`}
          onClick={() => {
            setLikeCount(c => c + 1);
            setLiked(true);
            onLike && onLike();
            setTimeout(() => setLiked(false), 700);
          }}
        >
          <svg className="fab-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="currentColor"
            />
          </svg>
        </button>
        <div className="fab-count like" aria-hidden>
          {likeCount}
        </div>
      </div>

      <div className="fab-with-count">
        <button
          className="fab"
          aria-label="Comments"
          onClick={() => {
            setCommentCount(c => c + 1);
            onComment && onComment();
          }}
        >
          <svg className="fab-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              fill="currentColor"
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            />
          </svg>
        </button>
        <div className="fab-count comment" aria-hidden>
          {commentCount}
        </div>
      </div>

      <div className="fab-with-count">
        <button
          className="fab"
          aria-label="Share"
          onClick={() => {
            setShareCount(c => c + 1);
            onShare && onShare();
          }}
        >
          <svg className="fab-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              fill="currentColor"
              d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.5 3.5 0 0 0 0-1.4l7.02-4.11A2.99 2.99 0 1 0 15 5a3 3 0 0 0 .96 2.24L8.94 11.35a3 3 0 1 0 0 1.3l6.96 4.02A3 3 0 1 0 18 16.08z"
            />
          </svg>
        </button>
        <div className="fab-count share" aria-hidden>
          {shareCount}
        </div>
      </div>

      <button className="fab primary" aria-label="Create" onClick={onCreate}>
        <svg className="fab-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z" />
        </svg>
      </button>
    </div>
  );
}
