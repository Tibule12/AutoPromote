import React from "react";
import { auth } from "../firebaseClient";
import "../LiveWatch.css";

export default function BottomNav({ onCreate }) {
  const user = auth?.currentUser;
  return (
    <nav className="mobile-bottomnav" aria-label="Mobile bottom navigation">
      <button className="bn-item" aria-label="Home">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path fill="#fff" d="M12 3l9 8h-3v8h-12v-8H3z" />
        </svg>
      </button>
      <button className="bn-item" aria-label="Search">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path
            fill="#fff"
            d="M21 20l-4.35-4.35A7 7 0 1 0 18 18.65L22 22zM10 16a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"
          />
        </svg>
      </button>
      <button className="bn-item create" onClick={onCreate} aria-label="Create">
        <div className="create-icon">+</div>
      </button>
      <button className="bn-item" aria-label="Notifications">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path
            fill="#fff"
            d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z"
          />
        </svg>
      </button>
      <button className="bn-item" aria-label="Profile">
        {user && user.photoURL ? (
          <img src={user.photoURL} alt="profile" className="bn-avatar" />
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              fill="#fff"
              d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-6 0-9 3-9 6v2h18v-2c0-3-3-6-9-6z"
            />
          </svg>
        )}
      </button>
    </nav>
  );
}
