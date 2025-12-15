import React, { useMemo, useState } from "react";
import "./UserDashboard.css";
import ContentUploadForm from "./ContentUploadForm";
import ScheduleCard from "./components/ScheduleCard";
import { auth } from "./firebaseClient";
import { API_ENDPOINTS } from "./config";

const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ""}/image.png`;

const UserDashboard = ({
  user,
  content,
  stats,
  badges,
  notifications,
  userDefaults,
  onSaveDefaults,
  onLogout,
  onUpload,
  mySchedules = [],
  onSchedulesChanged,
}) => {
  const [activeTab, setActiveTab] = useState("profile");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentList = useMemo(() => (Array.isArray(content) ? content : []), [content]);
  const schedulesList = useMemo(
    () => (Array.isArray(mySchedules) ? mySchedules : []),
    [mySchedules]
  );

  const handleNav = tab => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };
  const triggerSchedulesRefresh = () => {
    onSchedulesChanged && onSchedulesChanged();
  };
  const withAuth = async cb => {
    const currentUser = auth?.currentUser;
    if (!currentUser) {
      alert("Please sign in first");
      return;
    }
    const token = await currentUser.getIdToken(true);
    return cb(token);
  };

  const doPause = async id => {
    await withAuth(async token => {
      try {
        await fetch(`${API_ENDPOINTS.SCHEDULE_PAUSE}/${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        triggerSchedulesRefresh();
      } catch (e) {
        console.warn(e);
        alert("Failed to pause schedule");
      }
    });
  };
  const doResume = async id => {
    await withAuth(async token => {
      try {
        await fetch(`${API_ENDPOINTS.SCHEDULE_RESUME}/${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        triggerSchedulesRefresh();
      } catch (e) {
        console.warn(e);
        alert("Failed to resume schedule");
      }
    });
  };
  const doReschedule = async (id, when) => {
    await withAuth(async token => {
      try {
        await fetch(`${API_ENDPOINTS.SCHEDULE_RESCHEDULE}/${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ time: when }),
        });
        triggerSchedulesRefresh();
      } catch (e) {
        console.warn(e);
        alert("Failed to reschedule");
      }
    });
  };
  const doDelete = async id => {
    if (!window.confirm("Delete this schedule?")) return;
    await withAuth(async token => {
      try {
        await fetch(`${API_ENDPOINTS.SCHEDULE_DELETE}/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        triggerSchedulesRefresh();
      } catch (e) {
        console.warn(e);
        alert("Failed to delete schedule");
      }
    });
  };

  return (
    <div className="dashboard-root">
      <header className="dashboard-topbar" aria-label="Top navigation">
        <button
          className="hamburger"
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(v => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-title">Your Dashboard</div>
        <div className="topbar-user">{user?.name || "Guest"}</div>
      </header>

      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Sidebar">
        <div className="profile-section">
          <img className="profile-avatar" src={user?.avatarUrl || DEFAULT_IMAGE} alt="Avatar" />
          <h2>{user?.name || "User Name"}</h2>
        </div>
        <nav className="dashboard-navbar-vertical" role="navigation">
          <ul>
            <li
              className={activeTab === "profile" ? "active" : ""}
              onClick={() => handleNav("profile")}
            >
              Profile
            </li>
            <li
              className={activeTab === "upload" ? "active" : ""}
              onClick={() => handleNav("upload")}
            >
              Upload
            </li>
            <li
              className={activeTab === "schedules" ? "active" : ""}
              onClick={() => handleNav("schedules")}
            >
              Schedules
            </li>
            <li
              className={activeTab === "analytics" ? "active" : ""}
              onClick={() => handleNav("analytics")}
            >
              Analytics
            </li>
          </ul>
        </nav>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </aside>

      <main className="dashboard-main">
        {activeTab === "profile" && (
          <section className="profile-details">
            <h3>Welcome to your profile</h3>
            <div style={{ color: "#9aa4b2" }}>This is a simplified profile panel.</div>
            <div style={{ marginTop: ".5rem" }}>
              <div>
                <strong>Views:</strong> {stats?.views ?? 0}
              </div>
              <div>
                <strong>Clicks:</strong> {stats?.clicks ?? 0}
              </div>
              <div>
                <strong>CTR:</strong> {stats?.ctr ?? 0}%
              </div>
            </div>
          </section>
        )}

        {activeTab === "upload" && (
          <section className="upload-panel">
            <ContentUploadForm onUpload={onUpload} />
          </section>
        )}

        {activeTab === "schedules" && (
          <section className="schedules-panel">
            <h3>My Schedules</h3>
            {schedulesList.length === 0 ? (
              <div style={{ color: "#9aa4b2" }}>
                No schedules yet. Create one by uploading content.
              </div>
            ) : (
              <div
                className="schedules-list"
                style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "1fr" }}
              >
                {schedulesList.map((sch, i) => (
                  <ScheduleCard
                    key={i}
                    schedule={sch}
                    content={contentList.find(c => c.id === sch.contentId) || null}
                    onPause={doPause}
                    onResume={doResume}
                    onReschedule={doReschedule}
                    onDelete={doDelete}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "analytics" && (
          <section className="analytics-panel">
            <h3>Analytics</h3>
            <div style={{ color: "#9aa4b2" }}>Analytics coming soon.</div>
          </section>
        )}
      </main>
    </div>
  );
};

export default UserDashboard;
