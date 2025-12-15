import React from "react";
import "../AdminDashboard.css";

const ActivityFeed = ({ activities, title = "Recent Activity" }) => {
  return (
    <div className="dashboard-panel">
      <h3 className="panel-title">{title}</h3>
      <div className="activity-feed">
        {activities && activities.length > 0 ? (
          activities.map((activity, index) => (
            <div key={index} className="activity-item">
              <div className="activity-icon">
                {activity.type === "user"
                  ? "👤"
                  : activity.type === "content"
                    ? "📄"
                    : activity.type === "promotion"
                      ? "🚀"
                      : "📊"}
              </div>
              <div className="activity-content">
                <div className="activity-title">{activity.title || "Action performed"}</div>
                <div className="activity-description">
                  {activity.description || "No description available"}
                </div>
                <div className="activity-time">
                  {activity.timestamp
                    ? new Date(activity.timestamp.seconds * 1000).toLocaleString()
                    : "Unknown time"}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">No recent activities to display</div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
