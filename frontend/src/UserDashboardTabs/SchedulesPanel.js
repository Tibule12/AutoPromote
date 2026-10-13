import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  PLATFORM_NAMES,
  PLATFORM_ORDER,
  aggregateStatus,
  displayTimezone,
  formatScheduleTime,
  groupSchedules,
  isValidTimezone,
  localFields,
  releaseMedia,
  scheduleCopy,
  zonedFieldsToIso,
} from "./scheduleReleaseModel";
import "./SchedulesPanel.css";

const dateLabel = (value, timezone) =>
  formatScheduleTime(value, timezone, { dateStyle: "medium", timeStyle: undefined });
const clockLabel = (value, timezone) =>
  formatScheduleTime(value, timezone, { dateStyle: undefined, timeStyle: "short" });
const actionIds = release =>
  Array.from(new Set(release.destinations.map(item => item.schedule.id)));

function originLabel(content) {
  if (!content) return "";
  const source = String(
    content.source || content.origin || content.createdWith || ""
  ).toLowerCase();
  if (["viral_clip_studio", "viral-clip-studio", "studio"].includes(source))
    return "Created in Studio";
  const template = content.templateName || content.template?.name;
  return typeof template === "string" && template.trim() ? `Template: ${template.trim()}` : "";
}

function StatusPill({ status }) {
  return (
    <span className={`schedule-status schedule-status-${status.toLowerCase()}`}>{status}</span>
  );
}

const SchedulesPanel = ({
  schedulesList,
  contentList,
  loading = false,
  loadError = "",
  defaultTimezone = "UTC",
  currentTime = Date.now(),
  onCreate,
  onPause,
  onResume,
  onReschedule,
  onRescheduleMany,
  onPauseMany,
  onResumeMany,
  onDelete,
  onDeleteMany,
  onEditCopy,
  onNavigate,
}) => {
  const [selectedId, setSelectedId] = useState("");
  const [expandedPlatform, setExpandedPlatform] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reschedule, setReschedule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copyEditor, setCopyEditor] = useState(null);
  const [copySaving, setCopySaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({
    contentId: "",
    date: "",
    time: "12:00",
    platforms: [],
  });

  const allReleases = useMemo(
    () => groupSchedules(schedulesList, contentList),
    [schedulesList, contentList]
  );
  const upcoming = allReleases.filter(
    release =>
      new Date(release.time).getTime() >= currentTime &&
      release.destinations.some(item => ["Ready", "Scheduled", "Paused"].includes(item.status))
  );
  const releases = showHistory ? allReleases : upcoming.length ? upcoming : allReleases.slice(-12);
  const selected = releases.find(release => release.id === selectedId) || releases[0];
  const subjects = useMemo(() => {
    const map = new Map();
    releases.forEach(release => {
      if (!map.has(release.subject)) map.set(release.subject, []);
      map.get(release.subject).push(release);
    });
    return Array.from(map.entries());
  }, [releases]);
  const destinationCount = releases.reduce(
    (count, release) => count + release.destinations.length,
    0
  );
  const pausedCount = releases.reduce(
    (count, release) =>
      count + release.destinations.filter(item => item.status === "Paused").length,
    0
  );
  const platformCount = new Set(
    releases.flatMap(release => release.destinations.map(item => item.platform))
  ).size;
  const timezoneInfo = selected
    ? displayTimezone(selected.destinations[0]?.schedule, defaultTimezone)
    : { value: isValidTimezone(defaultTimezone) ? defaultTimezone : "UTC", recorded: false };
  const timezone = timezoneInfo.value;
  const mixedTimezones =
    selected &&
    selected.destinations.some(
      item => displayTimezone(item.schedule, defaultTimezone).value !== timezone
    );
  const media = releaseMedia(selected?.content);
  const firstCopy = selected
    ? scheduleCopy(selected.destinations[0]?.schedule, selected.content)
    : { title: "", caption: "" };
  const previewTitle =
    firstCopy.title && firstCopy.title !== selected?.title ? firstCopy.title : "";
  const origin = originLabel(selected?.content);

  const selectRelease = release => {
    setSelectedId(release.id);
    setExpandedPlatform("");
    setMediaFailed(false);
  };

  const editable = item => ["Ready", "Scheduled", "Paused"].includes(item.status);
  const releaseEditable = selected?.destinations.every(editable);
  const openCopyEditor = (release, item) => {
    if (!item || !editable(item)) return;
    const copy = scheduleCopy(item.schedule, release.content);
    setCopyEditor({
      releaseId: release.id,
      scheduleId: item.schedule.id,
      platform: item.platform,
      releaseTitle: release.title,
      title: copy.title === release.title ? "" : copy.title,
      caption: copy.caption,
      error: "",
    });
  };

  const submitCopy = async event => {
    event.preventDefault();
    if (!copyEditor || copySaving) return;
    setCopySaving(true);
    try {
      const result = await onEditCopy?.(copyEditor.scheduleId, {
        title: copyEditor.title,
        caption: copyEditor.caption,
      });
      if (!result)
        throw new Error("Could not save this destination's copy. Review its status and retry.");
      setCopyEditor(null);
    } catch (error) {
      setCopyEditor(current => current && { ...current, error: error.message });
    } finally {
      setCopySaving(false);
    }
  };

  const openReschedule = (release, destination = null) => {
    const zone = displayTimezone(
      destination?.schedule || release.destinations[0]?.schedule,
      defaultTimezone
    ).value;
    const fields = localFields(destination?.schedule?.startTime || release.time, zone);
    setReschedule({
      releaseTitle: release.title,
      ids: destination ? [destination.schedule.id] : actionIds(release),
      scope: destination
        ? PLATFORM_NAMES[destination.platform] || destination.platform
        : "entire release",
      date: fields.date,
      time: fields.time,
      timezone: zone,
      error: "",
    });
  };

  const submitReschedule = async event => {
    event.preventDefault();
    if (!reschedule || saving) return;
    try {
      const when = zonedFieldsToIso(reschedule.date, reschedule.time, reschedule.timezone);
      if (new Date(when).getTime() <= Date.now()) throw new Error("Choose a future publish time.");
      setSaving(true);
      const result =
        reschedule.ids.length > 1 && onRescheduleMany
          ? await onRescheduleMany(reschedule.ids, when, reschedule.timezone)
          : await onReschedule?.(reschedule.ids[0], when, reschedule.timezone);
      if (result === false || result === null)
        throw new Error(
          "Some destinations could not be rescheduled. Review their current times before retrying."
        );
      setReschedule(null);
    } catch (error) {
      setReschedule(
        current => current && { ...current, error: error.message || "Could not reschedule." }
      );
    } finally {
      setSaving(false);
    }
  };

  const pauseRelease = async () => {
    if (!selected || !onPauseMany) return;
    const ids = actionIds(selected);
    if (
      !window.confirm(
        `Pause ${selected.title} across ${ids.length} scheduled destination${ids.length === 1 ? "" : "s"}?`
      )
    )
      return;
    await onPauseMany(ids);
  };

  const resumeRelease = async () => {
    if (!selected || !onResumeMany) return;
    await onResumeMany(actionIds(selected));
  };

  const createSchedule = async event => {
    event.preventDefault();
    if (!createData.contentId || !createData.platforms.length || !createData.date) return;
    try {
      const time = zonedFieldsToIso(
        createData.date,
        createData.time,
        isValidTimezone(defaultTimezone) ? defaultTimezone : "UTC"
      );
      await onCreate?.({
        contentId: createData.contentId,
        time,
        frequency: "once",
        platforms: createData.platforms,
      });
      setShowCreate(false);
    } catch (error) {
      toast.error(error.message || "Could not schedule post.");
    }
  };

  const timezoneOptions = Array.from(
    new Set(
      [
        reschedule?.timezone,
        defaultTimezone,
        typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "",
        "UTC",
        "Africa/Johannesburg",
      ].filter(isValidTimezone)
    )
  );

  return (
    <section className="schedules-panel" aria-label="Schedule releases">
      <div className="schedule-toolbar">
        <div>
          <strong>Releases</strong>
          <span>
            {showHistory
              ? "All recent releases"
              : upcoming.length
                ? "Upcoming releases"
                : "Recent release history"}
            {" · "}One release, all its destinations, and the exact time in one place.
          </span>
        </div>
        <div className="schedule-toolbar-actions">
          {allReleases.length > upcoming.length && (
            <button
              className="schedule-history-toggle"
              onClick={() => {
                setShowHistory(!showHistory);
                setSelectedId("");
                setMediaFailed(false);
              }}
            >
              {showHistory
                ? "Show upcoming"
                : `View history (${allReleases.length - upcoming.length})`}
            </button>
          )}
          <button
            className="schedule-primary"
            onClick={() => (onNavigate ? onNavigate("upload") : setShowCreate(!showCreate))}
          >
            + Schedule post
          </button>
        </div>
      </div>

      {showCreate && !onNavigate && (
        <form className="schedule-create-form" onSubmit={createSchedule}>
          <label>
            Content
            <select
              aria-label="Select Content"
              value={createData.contentId}
              onChange={e => setCreateData({ ...createData, contentId: e.target.value })}
              required
            >
              <option value="">Select content</option>
              {(contentList || []).map(content => (
                <option key={content.id} value={content.id}>
                  {content.title || "Untitled"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              aria-label="Schedule Date"
              type="date"
              value={createData.date}
              onChange={e => setCreateData({ ...createData, date: e.target.value })}
              required
            />
          </label>
          <label>
            Time
            <input
              aria-label="Schedule Time"
              type="time"
              value={createData.time}
              onChange={e => setCreateData({ ...createData, time: e.target.value })}
              required
            />
          </label>
          <span>Timezone: {isValidTimezone(defaultTimezone) ? defaultTimezone : "UTC"}</span>
          <fieldset>
            <legend>Destinations</legend>
            {PLATFORM_ORDER.map(platform => (
              <label key={platform}>
                <input
                  type="checkbox"
                  checked={createData.platforms.includes(platform)}
                  onChange={() =>
                    setCreateData(current => ({
                      ...current,
                      platforms: current.platforms.includes(platform)
                        ? current.platforms.filter(value => value !== platform)
                        : [...current.platforms, platform],
                    }))
                  }
                />
                {PLATFORM_NAMES[platform]}
              </label>
            ))}
          </fieldset>
          <button type="submit">Schedule post</button>
        </form>
      )}

      {loading && (
        <div className="schedule-loading" role="status">
          Loading your scheduled releases…
        </div>
      )}
      {loadError && !loading && (
        <div className="schedule-alert" role="alert">
          {loadError}
        </div>
      )}
      {!loading && !loadError && allReleases.length === 0 && (
        <div className="schedule-empty">
          No scheduled releases yet. Choose a finished file in Publisher to schedule your first
          post.
        </div>
      )}

      {!loading && releases.length > 0 && (
        <>
          <div className="schedule-kpis" aria-label="Schedule summary">
            <article>
              <strong>{releases.length}</strong>
              <span>Releases</span>
            </article>
            <article>
              <strong>{destinationCount}</strong>
              <span>Platform posts</span>
            </article>
            <article>
              <strong>{platformCount}</strong>
              <span>Destinations</span>
            </article>
            <article>
              <strong>{pausedCount}</strong>
              <span>Paused</span>
            </article>
          </div>

          <div className="schedule-workspace">
            <nav className="schedule-release-list" aria-label="Releases">
              <h3>Releases</h3>
              {subjects.map(([subject, items]) => (
                <div className="schedule-subject" key={subject}>
                  <h4>{subject}</h4>
                  {items.map(release => {
                    const zone = displayTimezone(
                      release.destinations[0]?.schedule,
                      defaultTimezone
                    ).value;
                    return (
                      <button
                        key={release.id}
                        className={`schedule-release-item ${selected?.id === release.id ? "selected" : ""}`}
                        aria-current={selected?.id === release.id ? "true" : undefined}
                        onClick={() => selectRelease(release)}
                      >
                        <span
                          className={`schedule-variant ${release.variant === "Timeline" ? "timeline" : "final"}`}
                        >
                          {release.variant === "Timeline"
                            ? "BEHIND THE EDIT"
                            : release.variant === "Final Edit"
                              ? "FINAL VIDEO"
                              : "RELEASE"}
                        </span>
                        <strong>{release.variant || release.title}</strong>
                        <small>
                          {dateLabel(release.time, zone)} · {clockLabel(release.time, zone)} {zone}{" "}
                          · {release.destinations.length} destinations
                        </small>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {selected && (
              <article className="schedule-detail" aria-label={`${selected.title} details`}>
                <header className="schedule-detail-header">
                  <div>
                    <span
                      className={`schedule-variant ${selected.variant === "Timeline" ? "timeline" : "final"}`}
                    >
                      {selected.variant === "Timeline"
                        ? "BEHIND THE EDIT"
                        : selected.variant === "Final Edit"
                          ? "FINAL VIDEO"
                          : "RELEASE"}
                    </span>
                    <h3>{selected.title}</h3>
                    {origin && <span className="schedule-origin">{origin}</span>}
                  </div>
                  <strong className="schedule-aggregate">
                    {aggregateStatus(selected.destinations)}
                  </strong>
                </header>
                <div className="schedule-detail-main">
                  <div className="schedule-media">
                    {media.url && media.kind === "video" && !mediaFailed ? (
                      <video
                        controls
                        preload="metadata"
                        poster={media.poster || undefined}
                        src={media.url}
                        aria-label={`${selected.title} video preview`}
                        onError={() => setMediaFailed(true)}
                      />
                    ) : media.url && media.kind === "image" && !mediaFailed ? (
                      <img
                        src={media.url}
                        alt={`${selected.title} scheduled media`}
                        onError={() => setMediaFailed(true)}
                      />
                    ) : media.poster ? (
                      <img src={media.poster} alt={`${selected.title} poster`} />
                    ) : (
                      <div className="schedule-media-empty">
                        Media preview unavailable
                        <br />
                        <small>
                          The queue has no accessible poster or media URL for this release.
                        </small>
                      </div>
                    )}
                  </div>
                  <div className="schedule-overview">
                    <div className="schedule-copy">
                      <strong>{previewTitle || "Post title unavailable"}</strong>
                      <p>{firstCopy.caption || "No caption stored for this release."}</p>
                    </div>
                    <dl className="schedule-timing">
                      <div>
                        <dt>Publish date</dt>
                        <dd>{dateLabel(selected.time, timezone)}</dd>
                      </div>
                      <div>
                        <dt>Time</dt>
                        <dd>{clockLabel(selected.time, timezone)}</dd>
                      </div>
                      <div>
                        <dt>Timezone</dt>
                        <dd>
                          {timezone}
                          {!timezoneInfo.recorded && (
                            <small>Viewing timezone; not recorded on this schedule</small>
                          )}
                        </dd>
                      </div>
                    </dl>
                    {mixedTimezones && (
                      <div className="schedule-alert">
                        Destinations have different recorded timezones. Check each expanded
                        destination.
                      </div>
                    )}
                  </div>
                </div>
                <div className="schedule-destinations">
                  <h4>Destinations ({selected.destinations.length})</h4>
                  {selected.destinations.map(item => {
                    const copy = scheduleCopy(item.schedule, item.content || selected.content);
                    const destinationMedia = releaseMedia(item.content);
                    const expanded = expandedPlatform === `${item.platform}:${item.schedule.id}`;
                    const zone = displayTimezone(item.schedule, defaultTimezone);
                    return (
                      <div
                        key={`${item.platform}:${item.schedule.id}`}
                        className="schedule-destination"
                      >
                        <button
                          className="schedule-destination-toggle"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedPlatform(
                              expanded ? "" : `${item.platform}:${item.schedule.id}`
                            )
                          }
                        >
                          <span className={`schedule-platform-icon platform-${item.platform}`}>
                            {(PLATFORM_NAMES[item.platform] || item.platform).slice(0, 1)}
                          </span>
                          <strong>{PLATFORM_NAMES[item.platform] || item.platform}</strong>
                          <StatusPill status={item.status} />
                          <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
                        </button>
                        {expanded && (
                          <div className="schedule-destination-detail">
                            <div>
                              <span>Post title</span>
                              <p>
                                {copy.title && copy.title !== selected.title
                                  ? copy.title
                                  : "No platform-specific title stored"}
                              </p>
                            </div>
                            <div>
                              <span>Caption</span>
                              <p>{copy.caption || "No platform-specific caption stored"}</p>
                            </div>
                            {item.content?.id !== selected.content?.id &&
                              (destinationMedia.url || destinationMedia.poster) && (
                                <div className="schedule-platform-media">
                                  <span>Media for this destination</span>
                                  {destinationMedia.poster || destinationMedia.kind === "image" ? (
                                    <img
                                      src={destinationMedia.poster || destinationMedia.url}
                                      alt={`${PLATFORM_NAMES[item.platform]} scheduled media`}
                                    />
                                  ) : (
                                    <video
                                      src={destinationMedia.url}
                                      controls
                                      preload="metadata"
                                      aria-label={`${PLATFORM_NAMES[item.platform]} scheduled video`}
                                    />
                                  )}
                                </div>
                              )}
                            <p className="schedule-destination-time">
                              {formatScheduleTime(
                                item.schedule.startTime || item.schedule.time,
                                zone.value
                              )}{" "}
                              · {zone.value}
                              {!zone.recorded ? " (viewing timezone)" : ""}
                            </p>
                            <div className="schedule-destination-actions">
                              <button
                                onClick={() => openCopyEditor(selected, item)}
                                disabled={!editable(item)}
                              >
                                Edit {PLATFORM_NAMES[item.platform] || item.platform} copy
                              </button>
                              <button
                                onClick={() => openReschedule(selected, item)}
                                disabled={!editable(item)}
                              >
                                Reschedule {PLATFORM_NAMES[item.platform] || item.platform}
                              </button>
                              {item.status === "Paused" ? (
                                <button onClick={() => onResume?.(item.schedule.id)}>
                                  Resume destination
                                </button>
                              ) : editable(item) ? (
                                <button
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Pause only ${PLATFORM_NAMES[item.platform] || item.platform} for ${selected.title}?`
                                      )
                                    )
                                      onPause?.(item.schedule.id);
                                  }}
                                >
                                  Pause destination
                                </button>
                              ) : null}
                              <button
                                className="danger"
                                onClick={() => onDelete?.(item.schedule.id)}
                                disabled={!editable(item)}
                              >
                                Cancel destination
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="schedule-release-actions">
                  <button
                    onClick={() => setPreviewOpen(true)}
                    disabled={(!media.url || mediaFailed) && !media.poster}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => openCopyEditor(selected, selected.destinations.find(editable))}
                    disabled={!selected.destinations.some(editable)}
                  >
                    Edit post/copy
                  </button>
                  <button onClick={() => openReschedule(selected)} disabled={!releaseEditable}>
                    Reschedule release
                  </button>
                  {selected.destinations.every(item => item.status === "Paused") ? (
                    <button onClick={resumeRelease}>Resume release</button>
                  ) : (
                    <button onClick={pauseRelease} disabled={!releaseEditable}>
                      Pause release
                    </button>
                  )}
                  <button
                    className="danger"
                    onClick={() => onDeleteMany?.(actionIds(selected))}
                    disabled={!releaseEditable}
                  >
                    Cancel release <small>All {selected.destinations.length} destinations</small>
                  </button>
                </div>
                <p className="schedule-copy-limit">
                  Copy edits affect one destination at a time. Expand a destination to manage it
                  directly. Publishing and published posts cannot be changed here.
                </p>
              </article>
            )}
          </div>

          <section className="schedule-calendar" aria-label="Release calendar">
            <header>
              <div>
                <h3>Release calendar</h3>
                <p>
                  Times shown with the timezone of each release. Select a card to inspect all
                  destinations.
                </p>
              </div>
              <div className="schedule-legend">
                {["Ready", "Scheduled", "Publishing", "Published", "Failed"].map(status => (
                  <span key={status}>
                    <StatusPill status={status} />
                  </span>
                ))}
              </div>
            </header>
            <div className="schedule-calendar-grid">
              {releases.map(release => {
                const zone = displayTimezone(
                  release.destinations[0]?.schedule,
                  defaultTimezone
                ).value;
                return (
                  <button
                    key={release.id}
                    className={`schedule-calendar-card ${selected?.id === release.id ? "selected" : ""}`}
                    onClick={() => selectRelease(release)}
                    aria-label={`Select ${release.title}, ${dateLabel(release.time, zone)}, ${release.destinations.length} destinations`}
                  >
                    <small>
                      {dateLabel(release.time, zone)} · {clockLabel(release.time, zone)} {zone}
                    </small>
                    <span
                      className={`schedule-variant ${release.variant === "Timeline" ? "timeline" : "final"}`}
                    >
                      {release.variant === "Timeline"
                        ? "BEHIND THE EDIT"
                        : release.variant === "Final Edit"
                          ? "FINAL VIDEO"
                          : "RELEASE"}
                    </span>
                    <strong>{release.title}</strong>
                    <em>{aggregateStatus(release.destinations)}</em>
                    <span className="schedule-calendar-platforms">
                      {release.destinations.map(item => (
                        <span
                          key={`${item.platform}:${item.schedule.id}`}
                          title={PLATFORM_NAMES[item.platform] || item.platform}
                          className={`schedule-platform-icon platform-${item.platform}`}
                        >
                          {(PLATFORM_NAMES[item.platform] || item.platform).slice(0, 1)}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {previewOpen && selected && (
        <div
          className="schedule-modal-backdrop"
          role="presentation"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="schedule-modal schedule-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.title} preview`}
            onClick={event => event.stopPropagation()}
          >
            <button
              className="schedule-modal-close"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview"
            >
              ×
            </button>
            <h3>{selected.title}</h3>
            {media.url && media.kind === "video" && !mediaFailed ? (
              <video
                controls
                preload="metadata"
                poster={media.poster || undefined}
                src={media.url}
                onError={() => setMediaFailed(true)}
              />
            ) : (
              <img src={media.poster || media.url} alt={`${selected.title} preview`} />
            )}
          </div>
        </div>
      )}
      {copyEditor && (
        <div
          className="schedule-modal-backdrop"
          role="presentation"
          onClick={() => !copySaving && setCopyEditor(null)}
        >
          <form
            className="schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit post copy"
            onSubmit={submitCopy}
            onClick={event => event.stopPropagation()}
          >
            <h3>Edit post/copy</h3>
            <p>
              {copyEditor.releaseTitle} ·{" "}
              {PLATFORM_NAMES[copyEditor.platform] || copyEditor.platform} only
            </p>
            <label>
              Destination
              <select
                value={copyEditor.scheduleId}
                onChange={event => {
                  const item = selected?.destinations.find(
                    destination => destination.schedule.id === event.target.value
                  );
                  if (item) openCopyEditor(selected, item);
                }}
              >
                {selected?.destinations.map(item => (
                  <option
                    key={item.schedule.id}
                    value={item.schedule.id}
                    disabled={!editable(item)}
                  >
                    {PLATFORM_NAMES[item.platform] || item.platform} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Platform title
              <input
                maxLength={160}
                value={copyEditor.title}
                onChange={event => setCopyEditor({ ...copyEditor, title: event.target.value })}
                placeholder="Optional platform title"
              />
            </label>
            <label>
              Caption / post text
              <textarea
                maxLength={5000}
                rows={6}
                value={copyEditor.caption}
                onChange={event => setCopyEditor({ ...copyEditor, caption: event.target.value })}
                placeholder="Write this destination's post text"
              />
            </label>
            <p className="schedule-modal-note">
              Saving updates only the selected destination before publishing starts. The scheduled
              date and other destinations stay as they are.
            </p>
            {copyEditor.error && (
              <p className="schedule-alert" role="alert">
                {copyEditor.error}
              </p>
            )}
            <div className="schedule-modal-actions">
              <button type="button" onClick={() => setCopyEditor(null)} disabled={copySaving}>
                Discard changes
              </button>
              <button type="submit" disabled={copySaving}>
                {copySaving ? "Saving…" : "Save destination copy"}
              </button>
            </div>
          </form>
        </div>
      )}
      {reschedule && (
        <div
          className="schedule-modal-backdrop"
          role="presentation"
          onClick={() => !saving && setReschedule(null)}
        >
          <form
            className="schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Reschedule"
            onSubmit={submitReschedule}
            onClick={event => event.stopPropagation()}
          >
            <h3>Reschedule {reschedule.scope}</h3>
            <p>
              {reschedule.releaseTitle} · {reschedule.ids.length} destination
              {reschedule.ids.length === 1 ? "" : "s"}
            </p>
            <label>
              Publish date
              <input
                type="date"
                required
                value={reschedule.date}
                onChange={event => setReschedule({ ...reschedule, date: event.target.value })}
              />
            </label>
            <label>
              Time
              <input
                type="time"
                required
                value={reschedule.time}
                onChange={event => setReschedule({ ...reschedule, time: event.target.value })}
              />
            </label>
            <label>
              Timezone
              <select
                value={reschedule.timezone}
                onChange={event => setReschedule({ ...reschedule, timezone: event.target.value })}
              >
                {timezoneOptions.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <p className="schedule-modal-note">
              All selected destinations receive the same instant. If one update fails, the others
              may already have changed; review each status afterward.
            </p>
            {reschedule.error && (
              <p className="schedule-alert" role="alert">
                {reschedule.error}
              </p>
            )}
            <div className="schedule-modal-actions">
              <button type="button" onClick={() => setReschedule(null)} disabled={saving}>
                Keep current time
              </button>
              <button type="submit" disabled={saving}>
                {saving
                  ? "Saving…"
                  : `Reschedule ${reschedule.ids.length} destination${reschedule.ids.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export default SchedulesPanel;
