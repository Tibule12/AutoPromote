import React from "react";
import { auth } from "../firebaseClient";
import "../LiveWatch.css";

export default function BottomNav({ activeTab, onNav, onLogout }) {
  const user = auth?.currentUser;

  // Helper to apply active class
  const getCls = tab => (activeTab === tab ? "bn-item active" : "bn-item");

  return (
    <nav className="mobile-bottomnav" aria-label="Mobile bottom navigation">
      <button
        className={getCls("schedules")}
        onClick={() => onNav("schedules")}
        aria-label="Schedules"
      >
        {/* Calendar icon for Schedules */}
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>
      <button
        className={getCls("analytics")}
        onClick={() => onNav("analytics")}
        aria-label="Analytics"
      >
        {/* Chart icon for Analytics */}
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
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
        {/* Bell icon for Notifications */}
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </button>
      <button className={getCls("profile")} onClick={() => onNav("profile")} aria-label="Profile">
        {/* Profile User Icon */}
        {user && user.photoURL ? (
          <img src={user.photoURL} alt="profile" className="bn-avatar" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        )}
      </button>
      {/* Logout Button */}
      {onLogout && (
        <button className="bn-item" onClick={onLogout} aria-label="Logout">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      )}
    </nav>
  );
}
