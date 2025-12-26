import React from "react";
import "./Footer.css";
import { PUBLIC_SITE_URL } from "../config";

const Footer = () => {
  const site = PUBLIC_SITE_URL || "https://autopromote.org";
  return (
    <footer className="ap-footer">
      <div className="ap-footer-links">
        <a href={`${site}/terms`} target="_blank" rel="noreferrer">
          Terms of Service
        </a>
        <span className="dot">•</span>
        <a href={`${site}/privacy`} target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
      </div>
      <div className="ap-footer-copy">
        © {new Date().getFullYear()} AutoPromote. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
