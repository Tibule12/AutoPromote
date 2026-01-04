import React from "react";
import "../AdminDashboard.css";

const StatCard = ({ title, value, subtitle, color = "#1976d2", icon, trend }) => {
  return (
    <div className="stat-card">
      <div className="stat-card-icon-bg" style={{ color }}>
        {icon}
      </div>
      <div className="stat-card-icon" style={{ backgroundColor: `${color}15` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <h3 className="stat-card-title">{title}</h3>
      <div className="stat-card-value">
        {typeof value === "number" && title.toLowerCase().includes("revenue")
          ? `$${value.toFixed(2)}`
          : value}
      </div>
      {subtitle && (
        <div className="stat-card-subtitle">
          {trend !== undefined && (
            <span className={`trend-indicator ${trend > 0 ? "trend-up" : "trend-down"}`}>
              {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </span>
          )}
          {subtitle}
        </div>
      )}
    </div>
  );
};

export default StatCard;
