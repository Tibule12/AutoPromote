import React, { useState } from "react";
import "./SchedulesPanel.css";
import { toast } from "react-hot-toast";

const SchedulesPanel = ({
  schedulesList,
  contentList,
  onCreate,
  onPause,
  onResume,
  onReschedule,
  onDelete,
}) => {
  const [viewMode, setViewMode] = useState("orchestrator"); // 'orchestrator' | 'list'
  const [currentDate] = useState(new Date());

  // Injection State (Creation)
  const [showInjector, setShowInjector] = useState(false);
  const [injectData, setInjectData] = useState({
    contentId: "",
    date: new Date().toISOString().split("T")[0],
    time: "12:00",
    platforms: [],
    frequency: "once",
  });
  const [isInjecting, setIsInjecting] = useState(false);

  // Platform Definitions
  const platforms = [
    { id: "youtube", name: "YouTube", color: "#ff0000" },
    { id: "instagram", name: "Instagram", color: "#E1306C" },
    { id: "tiktok", name: "TikTok", color: "#00f2ea" },
    { id: "twitter", name: "Twitter/X", color: "#1DA1F2" },
    { id: "linkedin", name: "LinkedIn", color: "#0077b5" },
    { id: "facebook", name: "Facebook", color: "#1877F2" },
  ];

  // Helper: Get days for the timeline header (Next 7 days)
  const getTimelineDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const handleInject = async e => {
    e.preventDefault();
    if (!injectData.contentId) return toast.error("Select content payload");
    if (injectData.platforms.length === 0) return toast.error("Target at least one platform");

    setIsInjecting(true);
    const isoDateTime = `${injectData.date}T${injectData.time}:00.000Z`; // Simple ISO construction

    try {
      if (onCreate) {
        await onCreate({
          contentId: injectData.contentId,
          time: isoDateTime,
          frequency: injectData.frequency,
          platforms: injectData.platforms,
        });
        toast.success("Payload injected into timeline.");
        setShowInjector(false);
        // Reset
        setInjectData(prev => ({ ...prev, contentId: "", platforms: [] }));
      }
    } catch (err) {
      console.error(err);
      toast.error("Injection failed.");
    } finally {
      setIsInjecting(false);
    }
  };

  const togglePlatform = pid => {
    setInjectData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(pid)
        ? prev.platforms.filter(p => p !== pid)
        : [...prev.platforms, pid],
    }));
  };

  // Helper to position events on the timeline
  const getEventStyle = scheduleDate => {
    const eventTime = new Date(scheduleDate);
    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);

    // Calculate offset in days from current view start
    const diffTime = eventTime - startOfDay;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    // If it's outside the 7 day view (negative or > 7), hide or handle
    if (diffDays < 0 || diffDays >= 7) return null;

    // Calculate percentage left
    const leftPercent = (diffDays / 7) * 100;

    return {
      left: `${leftPercent}%`,
      width: "13%", // Approx width of one day
    };
  };

  return (
    <div className="schedules-panel">
      {/* Header */}
      <div className="orchestrator-header">
        <div>
          <h2 className="orchestrator-title">TEMPORAL ORCHESTRATOR</h2>
          <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
            Manage your automated publishing timeline
          </div>
        </div>

        <div className="time-controls">
          <button
            className={`control-btn ${viewMode === "orchestrator" ? "active" : ""}`}
            onClick={() => setViewMode("orchestrator")}
          >
            TIMELINE
          </button>
          <button
            className={`control-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
          >
            DATA LIST
          </button>
          <button
            className="control-btn"
            style={{ borderColor: "#10b981", color: "#10b981" }}
            onClick={() => setShowInjector(!showInjector)}
          >
            {showInjector ? "CLOSE INJECTOR" : "+ INJECT EVENT"}
          </button>
        </div>
      </div>

      {/* Injection Panel (Create Form) */}
      {showInjector && (
        <div className="injection-panel">
          <h4 style={{ marginBottom: "15px", color: "#fff" }}>NEW TRANSMISSION</h4>
          <form onSubmit={handleInject} className="injection-form">
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                }}
              >
                PAYLOAD (CONTENT)
              </label>
              <select
                className="cyber-input"
                aria-label="Select Content"
                value={injectData.contentId}
                onChange={e => setInjectData({ ...injectData, contentId: e.target.value })}
              >
                <option value="">Select Content Node...</option>
                {contentList?.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title || "Untitled Node"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                }}
              >
                TARGET VECTOR (DATE/TIME)
              </label>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  type="date"
                  className="cyber-input"
                  aria-label="Schedule Date"
                  value={injectData.date}
                  onChange={e => setInjectData({ ...injectData, date: e.target.value })}
                />
                <input
                  type="time"
                  className="cyber-input"
                  aria-label="Schedule Time"
                  value={injectData.time}
                  onChange={e => setInjectData({ ...injectData, time: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "5px",
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                }}
              >
                CHANNELS
              </label>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                {platforms.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "4px",
                      border: "1px solid",
                      borderColor: injectData.platforms.includes(p.id) ? p.color : "#334155",
                      background: injectData.platforms.includes(p.id)
                        ? `${p.color}33`
                        : "transparent",
                      color: injectData.platforms.includes(p.id) ? p.color : "#64748b",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="submit"
                className="control-btn"
                style={{
                  width: "100%",
                  background: "#10b981",
                  color: "black",
                  borderColor: "#10b981",
                  fontWeight: "bold",
                }}
                disabled={isInjecting}
              >
                {isInjecting ? "INJECTING..." : "INITIATE SCHEDULE"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Orchestrator View */}
      {viewMode === "orchestrator" ? (
        <div className="chronoline-container">
          {/* Timeline Header (Days) */}
          <div className="chronoline-header">
            <div style={{ width: "120px", borderRight: "1px solid rgba(255,255,255,0.08)" }}></div>
            {getTimelineDays().map((date, i) => (
              <div key={i} className={`timeline-column ${i === 0 ? "today" : ""}`}>
                <div style={{ fontWeight: "bold" }}>
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div style={{ fontSize: "0.7rem" }}>
                  {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Body (Swimlanes) */}
          <div className="chronoline-body">
            {/* Current Time Playhead (Mock) */}
            <div className="chronoline-playhead" style={{ left: "14%" }}>
              {" "}
              {/* 14% is approx partly into first day */}
              <div className="playhead-label">NOW</div>
            </div>

            {platforms.map(platform => (
              <div key={platform.id} className="platform-swimlane">
                <div className="swimlane-header">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: platform.color,
                    }}
                  ></span>
                  {platform.name}
                </div>
                <div className="swimlane-track">
                  {/* AI Prime Time Suggestions (Mock) */}
                  {platform.id === "instagram" && (
                    <div
                      className="ai-suggestion-slot"
                      style={{ left: "35%", width: "5%" }}
                      title="High Engagement Probability"
                    >
                      PRIME
                    </div>
                  )}

                  {/* Render Scheduled Events */}
                  {schedulesList
                    ?.filter(s => {
                      const sp = s.platforms || (s.platform ? [s.platform] : []);
                      return sp.includes(platform.id);
                    })
                    .map((sched, idx) => {
                      const time = sched.startTime || sched.time;
                      const style = getEventStyle(time);
                      if (!style) return null;

                      const content = contentList?.find(c => c.id === sched.contentId);

                      return (
                        <div
                          key={idx}
                          className="timeline-event-node"
                          style={{
                            ...style,
                            borderLeft: `3px solid ${platform.color}`,
                            background: "rgba(30, 41, 59, 0.9)",
                          }}
                          onClick={() => toast(`Scheduled: ${content?.title || "Unknown"}`)}
                        >
                          {content?.title || "Unknown Payload"}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Legacy List View */
        <div className="schedules-list-legacy">
          {(!schedulesList || schedulesList.length === 0) && (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              NO ACTIVE TRANSMISSIONS FOUND
            </div>
          )}
          {schedulesList?.map((sch, i) => {
            const content = contentList?.find(c => c.id === sch.contentId);
            const time = sch.startTime || sch.time;
            const channelList = sch.platforms || (sch.platform ? [sch.platform] : []);

            return (
              <div
                key={i}
                className="control-module"
                style={{
                  marginBottom: "10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold", color: "white" }}>
                    {content?.title || "Unknown Content"}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    Target: {time ? new Date(time).toLocaleString() : "Unscheduled"} •{" "}
                    {sch.frequency}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "5px" }}>
                  {channelList.map(p => (
                    <span
                      key={p}
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(255,255,255,0.1)",
                        fontSize: "0.7rem",
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => onDelete && onDelete(sch.id)}
                  className="control-btn"
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.7rem",
                    borderColor: "#ef4444",
                    color: "#ef4444",
                  }}
                >
                  ABORT
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SchedulesPanel;
