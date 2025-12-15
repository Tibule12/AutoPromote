import React from "react";
import "../AdminDashboard.css";
import AdminChart from "./AdminChart";

const ContentPerformance = ({ contentData, totalContent }) => {
  // Process data for different visualizations
  const prepareEngagementData = () => {
    if (!contentData) return [];

    return [
      { label: "Comments", value: contentData.engagementMetrics?.comments || 0 },
      { label: "Likes", value: contentData.engagementMetrics?.likes || 0 },
      { label: "Shares", value: contentData.engagementMetrics?.shares || 0 },
      { label: "Saves", value: contentData.engagementMetrics?.saves || 0 },
    ];
  };

  const prepareViewsByTypeData = () => {
    if (!contentData) return {};

    return (
      contentData.viewsByType || {
        Articles: 45,
        Videos: 30,
        Images: 15,
        Audio: 10,
      }
    );
  };

  return (
    <div className="content-performance">
      <div className="dashboard-panel">
        <h3 className="panel-title">Content Health Analysis</h3>

        <div className="content-metrics-grid">
          <div className="content-metric-card">
            <div className="metric-label">Engagement Rate</div>
            <div className="metric-value">{contentData?.overallEngagementRate || "3.8"}%</div>
            <div className="metric-comparison">
              {contentData?.engagementTrend > 0 ? (
                <span className="trend-up">
                  ↑ {Math.abs(contentData?.engagementTrend || 0.5)}% vs last period
                </span>
              ) : (
                <span className="trend-down">
                  ↓ {Math.abs(contentData?.engagementTrend || 0.5)}% vs last period
                </span>
              )}
            </div>
          </div>

          <div className="content-metric-card">
            <div className="metric-label">Avg. Time on Content</div>
            <div className="metric-value">{contentData?.avgTimeOnContent || "2m 34s"}</div>
            <div className="metric-comparison">
              {contentData?.timeOnContentTrend > 0 ? (
                <span className="trend-up">
                  ↑ {Math.abs(contentData?.timeOnContentTrend || 0.3)}% vs last period
                </span>
              ) : (
                <span className="trend-down">
                  ↓ {Math.abs(contentData?.timeOnContentTrend || 0.3)}% vs last period
                </span>
              )}
            </div>
          </div>

          <div className="content-metric-card">
            <div className="metric-label">Completion Rate</div>
            <div className="metric-value">{contentData?.completionRate || "68.5"}%</div>
            <div className="metric-comparison">
              {contentData?.completionRateTrend > 0 ? (
                <span className="trend-up">
                  ↑ {Math.abs(contentData?.completionRateTrend || 0.8)}% vs last period
                </span>
              ) : (
                <span className="trend-down">
                  ↓ {Math.abs(contentData?.completionRateTrend || 0.8)}% vs last period
                </span>
              )}
            </div>
          </div>

          <div className="content-metric-card">
            <div className="metric-label">Bounce Rate</div>
            <div className="metric-value">{contentData?.bounceRate || "42.3"}%</div>
            <div className="metric-comparison">
              {contentData?.bounceRateTrend < 0 ? (
                <span className="trend-up">
                  ↑ {Math.abs(contentData?.bounceRateTrend || 0.6)}% vs last period
                </span>
              ) : (
                <span className="trend-down">
                  ↓ {Math.abs(contentData?.bounceRateTrend || 0.6)}% vs last period
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <div style={{ flex: 1 }}>
          <AdminChart
            type="bar"
            data={prepareEngagementData()}
            title="Engagement by Type"
            colors={["#1976d2", "#5e35b1", "#2e7d32", "#ed6c02"]}
          />
        </div>
        <div style={{ flex: 1 }}>
          <AdminChart
            type="pie"
            data={prepareViewsByTypeData()}
            title="Views by Content Type"
            colors={["#1976d2", "#5e35b1", "#2e7d32", "#ed6c02"]}
          />
        </div>
      </div>

      <div className="dashboard-panel">
        <h3 className="panel-title">Content Distribution</h3>

        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-label">High Performing</span>
            <span className="progress-value">
              {contentData?.highPerforming || Math.round(totalContent * 0.2)}
              <span className="progress-secondary">
                {" "}
                (
                {Math.round(
                  ((contentData?.highPerforming || totalContent * 0.2) / totalContent) * 100
                )}
                %)
              </span>
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar"
              style={{
                width: `${Math.round(((contentData?.highPerforming || totalContent * 0.2) / totalContent) * 100)}%`,
                backgroundColor: "#2e7d32",
              }}
            />
          </div>
        </div>

        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-label">Medium Performing</span>
            <span className="progress-value">
              {contentData?.mediumPerforming || Math.round(totalContent * 0.6)}
              <span className="progress-secondary">
                {" "}
                (
                {Math.round(
                  ((contentData?.mediumPerforming || totalContent * 0.6) / totalContent) * 100
                )}
                %)
              </span>
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar"
              style={{
                width: `${Math.round(((contentData?.mediumPerforming || totalContent * 0.6) / totalContent) * 100)}%`,
                backgroundColor: "#ed6c02",
              }}
            />
          </div>
        </div>

        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-label">Low Performing</span>
            <span className="progress-value">
              {contentData?.lowPerforming || Math.round(totalContent * 0.2)}
              <span className="progress-secondary">
                {" "}
                (
                {Math.round(
                  ((contentData?.lowPerforming || totalContent * 0.2) / totalContent) * 100
                )}
                %)
              </span>
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar"
              style={{
                width: `${Math.round(((contentData?.lowPerforming || totalContent * 0.2) / totalContent) * 100)}%`,
                backgroundColor: "#d32f2f",
              }}
            />
          </div>
        </div>
      </div>

      <div className="dashboard-panel">
        <h3 className="panel-title">Content Recommendations</h3>

        <div className="recommendation-list">
          <div className="recommendation-item">
            <div
              className="recommendation-icon"
              style={{ backgroundColor: "#e3f2fd", color: "#1976d2" }}
            >
              📈
            </div>
            <div className="recommendation-content">
              <h4 className="recommendation-title">Increase Video Content</h4>
              <p className="recommendation-description">
                Videos have 32% higher engagement than other content types. Consider converting some
                of your text-based content into short video formats.
              </p>
            </div>
          </div>

          <div className="recommendation-item">
            <div
              className="recommendation-icon"
              style={{ backgroundColor: "#f3e5f5", color: "#9c27b0" }}
            >
              ⏱️
            </div>
            <div className="recommendation-content">
              <h4 className="recommendation-title">Optimize Content Length</h4>
              <p className="recommendation-description">
                Content between 800-1200 words performs best for engagement. Your current average is
                1450 words, which may be leading to higher bounce rates.
              </p>
            </div>
          </div>

          <div className="recommendation-item">
            <div
              className="recommendation-icon"
              style={{ backgroundColor: "#e8f5e9", color: "#2e7d32" }}
            >
              🎯
            </div>
            <div className="recommendation-content">
              <h4 className="recommendation-title">Target Trending Topics</h4>
              <p className="recommendation-description">
                Content related to &quot;automation&quot; and &quot;AI tools&quot; is trending with
                your audience. Consider creating more content around these topics.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentPerformance;
