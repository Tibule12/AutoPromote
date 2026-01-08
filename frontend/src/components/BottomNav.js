import React from "react";
import { auth } from "../firebaseClient";
import "../LiveWatch.css";

export default function BottomNav({ activeTab, onNav }) {
  const user = auth?.currentUser;

  // Helper to apply active class
  const getCls = tab => (activeTab === tab ? "bn-item active" : "bn-item");

  return (
    <nav className="mobile-bottomnav" aria-label="Mobile bottom navigation">
      <button className={getCls("schedules")} onClick={() => onNav("schedules")} aria-label="Home">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path fill="currentColor" d="M12 3l9 8h-3v8h-12v-8H3z" />
        </svg>
      </button>
      <button
        className={getCls("analytics")}
        onClick={() => onNav("analytics")}
        aria-label="Analytics"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path
            fill="currentColor"
            d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2v-3h2v3zm4 0h-2v-5h2v5z"
          />
        </svg>
      </button>
      <button className="bn-item create" onClick={() => onNav("upload")} aria-label="Create">
        <div className="create-icon">+</div>
      </button>
      <button
        className={getCls("notifications")}
        onClick={() => onNav("notifications")}
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path
            fill="currentColor"
            d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z"
          />
        </svg>
      </button>
      <button className={getCls("profile")} onClick={() => onNav("profile")} aria-label="Profile">
        {user && user.photoURL ? (
          <img src={user.photoURL} alt="profile" className="bn-avatar" />
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              fill="currentColor"
              d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-6 0-9 3-9 6v2h18v-2c0-3-3-6-9-6z"
            />
          </svg>
        )}
      </button>
    </nav>
  );
}
