import React, { useState } from "react";
import ScheduleCard from "../components/ScheduleCard";

const SchedulesPanel = ({
  schedulesList,
  contentList,
  onCreate,
  onPause,
  onResume,
  onReschedule,
  onDelete,
}) => {
  const [newContentId, setNewContentId] = useState("");
  const [newWhen, setNewWhen] = useState("");
  const [newPlatforms, setNewPlatforms] = useState([]);
  const [newFrequency, setNewFrequency] = useState("once");
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  const toggleNewPlatform = p =>
    setNewPlatforms(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));

  const handleCreate = async e => {
    e.preventDefault();
    if (!newContentId) return alert("Select content to schedule");
    if (creatingSchedule) return;
    // Confirm if scheduling to many platforms
    if ((newPlatforms || []).length > 4) {
      const ok = window.confirm(
        `You're scheduling to ${(newPlatforms || []).length} platforms. Continue?`
      );
      if (!ok) return;
    }
    try {
      setCreatingSchedule(true);
      (await onCreate) &&
        onCreate({
          contentId: newContentId,
          time: newWhen || new Date().toISOString(),
          frequency: newFrequency,
          platforms: newPlatforms,
        });
      setNewContentId("");
      setNewWhen("");
      setNewPlatforms([]);
      setNewFrequency("once");
    } catch (e) {
      console.warn(e);
      alert("Failed to create schedule");
    } finally {
      setCreatingSchedule(false);
    }
  };
  return (
    <section className="schedules-panel">
      <h3>My Schedules</h3>
      <div
        className="create-schedule"
        style={{
          marginBottom: ".75rem",
          padding: ".75rem",
          border: "1px solid #e7edf3",
          borderRadius: 8,
        }}
      >
        <h4>Create Schedule</h4>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 8 }}>
          <select
            aria-label="Select content"
            value={newContentId}
            onChange={e => setNewContentId(e.target.value)}
          >
            <option value="">Select content</option>
            {(contentList || []).map(c => (
              <option key={c.id} value={c.id}>
                {c.title || c.id}
              </option>
            ))}
          </select>
          <input
            aria-label="When"
            type="datetime-local"
            value={newWhen}
            onChange={e => setNewWhen(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              "youtube",
              "tiktok",
              "instagram",
              "facebook",
              "twitter",
              "linkedin",
              "reddit",
              "discord",
              "telegram",
              "pinterest",
              "spotify",
              "snapchat",
            ].map(p => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={newPlatforms.includes(p)}
                  onChange={() => toggleNewPlatform(p)}
                />{" "}
                {p}
              </label>
            ))}
          </div>
          <select
            aria-label="Frequency"
            value={newFrequency}
            onChange={e => setNewFrequency(e.target.value)}
          >
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn primary" disabled={creatingSchedule}>
              {creatingSchedule ? "Creating..." : "Create Schedule"}
            </button>
          </div>
        </form>
      </div>
      {!schedulesList || schedulesList.length === 0 ? (
        <div style={{ color: "#9aa4b2" }}>No schedules yet.</div>
      ) : (
        <div className="schedules-list" style={{ display: "grid", gap: ".75rem" }}>
          {schedulesList.map((sch, i) => (
            <ScheduleCard
              key={i}
              schedule={sch}
              content={contentList.find(c => c.id === sch.contentId) || null}
              onPause={onPause}
              onResume={onResume}
              onReschedule={onReschedule}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default SchedulesPanel;
