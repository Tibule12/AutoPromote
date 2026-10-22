import React from "react";
import facebook from "../assets/platforms/facebook.svg";
import instagram from "../assets/platforms/instagram.svg";
import linkedin from "../assets/platforms/linkedin.svg";
import reddit from "../assets/platforms/reddit.svg";
import tiktok from "../assets/platforms/tiktok.svg";
import youtube from "../assets/platforms/youtube.svg";
import twitter from "../assets/platforms/twitter.svg";
import spotify from "../assets/platforms/spotify.svg";
import pinterest from "../assets/platforms/pinterest.svg";
import discord from "../assets/platforms/discord.svg";
import telegram from "../assets/platforms/telegram.svg";
import snapchat from "../assets/platforms/snapchat.svg";
import "./PlatformIcon.css";

const marks = {
  facebook,
  instagram,
  linkedin,
  reddit,
  tiktok,
  youtube,
  twitter,
  x: twitter,
  spotify,
  pinterest,
  discord,
  telegram,
  snapchat,
};

// Decorative beside the destination's existing accessible name.
export default function PlatformIcon({ platform }) {
  const source = marks[String(platform || "").toLowerCase()];
  return source ? (
    <img className="platform-brand-icon" src={source} alt="" aria-hidden="true" draggable="false" />
  ) : (
    <svg className="platform-brand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
