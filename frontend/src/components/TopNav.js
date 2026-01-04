import React from "react";
import "../LiveWatch.css";

export default function TopNav() {
  return (
    <div className="mobile-topnav" role="navigation" aria-label="Mobile top navigation">
      <div className="mobile-topnav-left">LIVE</div>
      <div className="mobile-topnav-center">
        <button className="mobile-tab">STEM</button>
        <button className="mobile-tab">Explore</button>
        <button className="mobile-tab">Following</button>
        <button className="mobile-tab active">For You</button>
      </div>
      <button className="mobile-topnav-right" aria-label="Search">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path
            fill="#fff"
            d="M21 20l-4.35-4.35A7 7 0 1 0 18 18.65L22 22zM10 16a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"
          />
        </svg>
      </button>
    </div>
  );
}
