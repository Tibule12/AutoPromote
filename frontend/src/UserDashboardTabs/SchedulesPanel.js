import { useMemo, useRef, useState } from "react";
import {
  PLATFORM_NAMES,
  aggregateStatus,
  displayTimezone,
  browserTimezone,
  timezoneLabel,
  destinationHasOwnSchedule,
  scheduleMedia,
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
const PLATFORM_GLYPHS = {
  facebook: "f",
  instagram: "◎",
  linkedin: "in",
  reddit: "●",
  tiktok: "♪",
  youtube: "▶",
};

function originLabel(content) {
  if (!content) return "";
  const source = String(
    content.source || content.origin || content.createdWith || ""
  ).toLowerCase();
  if (["viral_clip_studio", "viral-clip-studio", "studio"].includes(source))
    return "Created in Studio";
  const template = content.templateName || content.template?.name || content.meta?.template?.name;
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
  defaultTimezone,
  currentTime = Date.now(),
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
  scheduleScope = "week",
  hasMore = false,
  onScopeChanged,
  onLoadMore,
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
  const detailRef = useRef(null);
  const [viewTimezone, setViewTimezone] = useState("");
  const viewingTimezone =
    viewTimezone || (isValidTimezone(defaultTimezone) ? defaultTimezone : browserTimezone());

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
    ? displayTimezone(selected.destinations[0]?.schedule, viewingTimezone)
    : { value: viewingTimezone, recorded: false };
  const timezone = timezoneInfo.value;
  const mixedTimezones =
    selected &&
    selected.destinations.some(
      item => displayTimezone(item.schedule).storedValue !== timezoneInfo.storedValue
    );
  const media = releaseMedia(selected?.content);
  const firstCopy = selected
    ? scheduleCopy(
        selected.destinations[0]?.schedule,
        selected.content,
        selected.destinations[0]?.platform
      )
    : { title: "", caption: "" };
  const previewTitle =
    firstCopy.title && firstCopy.title !== selected?.title ? firstCopy.title : "";
  const origin = originLabel(selected?.content);
  const historyLimitNotice = loadError.startsWith("Only the most recent");

  const selectRelease = release => {
    setSelectedId(release.id);
    setExpandedPlatform("");
    setMediaFailed(false);
  };

  const editable = item => ["Ready", "Scheduled", "Paused"].includes(item.status);
  const canControlDestination = item => destinationHasOwnSchedule(item.schedule, item.platform);
  const releaseEditable = selected?.destinations.every(editable);
  const openCopyEditor = (release, item) => {
    if (!item || !editable(item)) return;
    const copy = scheduleCopy(item.schedule, item.content || release.content, item.platform);
    setCopyEditor({
      releaseId: release.id,
      scheduleId: item.schedule.id,
      platform: item.platform,
      releaseTitle: release.title,
      title: copy.title,
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
      viewingTimezone
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

  const timezoneOptions = Array.from(
    new Set(
      [
        reschedule?.timezone,
        viewingTimezone,
        defaultTimezone,
        typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "",
        "UTC",
        "Africa/Johannesburg",
      ].filter(isValidTimezone)
    )
  );

  return (
    <section className="schedules-panel" aria-label="Schedule releases">
      {onScopeChanged ? (
        <label>
          Queue period{" "}
          <select
            aria-label="Queue period"
            value={scheduleScope}
            disabled={loading}
            onChange={event => onScopeChanged(event.target.value)}
          >
            <option value="week">Next 7 days</option>
            <option value="all">All schedules</option>
          </select>
        </label>
      ) : null}
      {loading && (
        <div className="schedule-loading" role="status">
          Loading your scheduled releases…
        </div>
      )}
      {loadError && !loading && (!historyLimitNotice || showHistory) && (
        <div className="schedule-alert" role="alert">
          {loadError}
        </div>
      )}
      {!loading && !loadError && allReleases.length === 0 && (
        <div className="schedule-empty">
          No scheduled releases yet. Choose a finished file in Publisher to schedule your first
          post.
          {onNavigate && (
            <button className="schedule-primary" onClick={() => onNavigate("upload")}>
              + New release
            </button>
          )}
        </div>
      )}

      {!loading && releases.length > 0 && (
        <>
          <div className="schedule-kpis" aria-label="Schedule summary">
            <article>
              <span className="schedule-kpi-icon releases" aria-hidden="true">
                ▣
              </span>
              <strong>{releases.length}</strong>
              <span>Releases</span>
            </article>
            <article>
              <span className="schedule-kpi-icon posts" aria-hidden="true">
                ▤
              </span>
              <strong>{destinationCount}</strong>
              <span>Platform posts</span>
            </article>
            <article>
              <span className="schedule-kpi-icon destinations" aria-hidden="true">
                ➤
              </span>
              <strong>{platformCount}</strong>
              <span>Destinations</span>
            </article>
            <article>
              <span className="schedule-kpi-icon paused" aria-hidden="true">
                Ⅱ
              </span>
              <strong>{pausedCount}</strong>
              <span>Paused</span>
            </article>
          </div>

          <label className="schedule-view-timezone">
            View times in
            <select value={viewingTimezone} onChange={event => setViewTimezone(event.target.value)}>
              {timezoneOptions.map(zone => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <small>Changes the display only.</small>
          </label>
          <div className="schedule-workspace">
            <nav className="schedule-release-list" aria-label="Releases">
              <div className="schedule-list-heading">
                <h3>Releases</h3>
                {onNavigate && (
                  <button className="schedule-primary" onClick={() => onNavigate("upload")}>
                    + New release
                  </button>
                )}
              </div>
              {subjects.map(([subject, items]) => (
                <div className="schedule-subject" key={subject}>
                  <h4>
                    <span aria-hidden="true">
                      {subject === "Coffee"
                        ? "☕"
                        : subject === "Cycling"
                          ? "🚴"
                          : subject === "Headphones"
                            ? "🎧"
                            : "▣"}
                    </span>
                    {subject}
                  </h4>
                  {items.map(release => {
                    const zone = displayTimezone(
                      release.destinations[0]?.schedule,
                      viewingTimezone
                    ).value;
                    return (
                      <button
                        key={release.id}
                        className={`schedule-release-item ${selected?.id === release.id ? "selected" : ""}`}
                        aria-current={selected?.id === release.id ? "true" : undefined}
                        aria-label={`${release.variant || release.title} ${dateLabel(release.time, zone)} ${clockLabel(release.time, zone)} ${zone}`}
                        onClick={() => selectRelease(release)}
                      >
                        <span className="schedule-release-date">
                          <span aria-hidden="true">▣</span> {dateLabel(release.time, zone)}
                        </span>
                        <span className="schedule-release-kind">
                          <strong>{release.variant || release.title}</strong>
                          <small
                            className={`schedule-variant ${release.variant === "Timeline" ? "timeline" : "final"}`}
                          >
                            {release.variant === "Timeline"
                              ? "BEHIND THE EDIT"
                              : release.variant === "Final Edit"
                                ? "FINAL VIDEO"
                                : "RELEASE"}
                          </small>
                        </span>
                        <span className="schedule-release-arrow" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
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
            </nav>

            {selected && (
              <article
                ref={detailRef}
                className="schedule-detail"
                aria-label={`${selected.title} details`}
              >
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
                    <h3>
                      {selected.subject}
                      {selected.variant ? ` — ${selected.variant}` : ""}
                    </h3>
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
                      <strong>{previewTitle || "Post copy"}</strong>
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
                          {timezoneLabel(timezone, selected.time)}
                          {timezoneInfo.storedValue && !timezoneInfo.recorded && (
                            <small>Stored timezone: {timezoneInfo.storedValue}</small>
                          )}
                          {!timezoneInfo.recorded && (
                            <small>Viewing timezone; stored publish instant unchanged</small>
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
                    <div className="schedule-destinations">
                      <h4>Destinations ({selected.destinations.length})</h4>
                      {selected.destinations.map(item => {
                        const copy = scheduleCopy(item.schedule, item.content, item.platform);
                        const destinationMedia = scheduleMedia(
                          item.schedule,
                          item.content,
                          item.platform
                        );
                        const ownSchedule = canControlDestination(item);
                        const expanded =
                          expandedPlatform === `${item.platform}:${item.schedule.id}`;
                        const zone = displayTimezone(item.schedule, viewingTimezone);
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
                                {PLATFORM_GLYPHS[item.platform] ||
                                  (PLATFORM_NAMES[item.platform] || item.platform).slice(0, 1)}
                              </span>
                              <strong>{PLATFORM_NAMES[item.platform] || item.platform}</strong>
                              <StatusPill status={item.status} />
                              <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
                            </button>
                            {expanded && (
                              <div className="schedule-destination-detail">
                                <div>
                                  <span>Post title</span>
                                  <p>{copy.title || "No title stored for this destination"}</p>
                                </div>
                                <div>
                                  <span>Caption</span>
                                  <p>{copy.caption || "No platform-specific caption stored"}</p>
                                </div>
                                {destinationMedia.url || destinationMedia.poster ? (
                                  <div className="schedule-platform-media">
                                    <span>Media for this destination</span>
                                    {destinationMedia.kind === "image" || !destinationMedia.url ? (
                                      <img
                                        src={
                                          destinationMedia.kind === "image"
                                            ? destinationMedia.url || destinationMedia.poster
                                            : destinationMedia.poster
                                        }
                                        alt={`${PLATFORM_NAMES[item.platform]} scheduled media`}
                                      />
                                    ) : (
                                      <video
                                        src={destinationMedia.url}
                                        poster={destinationMedia.poster || undefined}
                                        controls
                                        preload="metadata"
                                        aria-label={`${PLATFORM_NAMES[item.platform]} scheduled video`}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <p>Media unavailable for this destination.</p>
                                )}
                                <p className="schedule-destination-time">
                                  {formatScheduleTime(
                                    item.schedule.startTime || item.schedule.time,
                                    zone.value
                                  )}{" "}
                                  ·{" "}
                                  {timezoneLabel(
                                    zone.value,
                                    item.schedule.startTime || item.schedule.time
                                  )}
                                  {!zone.recorded ? " (viewing timezone)" : ""}
                                  {zone.storedValue && !zone.recorded && (
                                    <small>Stored timezone: {zone.storedValue}</small>
                                  )}
                                </p>
                                {!ownSchedule && (
                                  <p>
                                    This schedule is shared by multiple destinations. Use release
                                    controls.
                                  </p>
                                )}
                                {ownSchedule && (
                                  <div className="schedule-destination-actions">
                                    {onEditCopy && (
                                      <button
                                        onClick={() => openCopyEditor(selected, item)}
                                        disabled={!editable(item)}
                                      >
                                        Edit {PLATFORM_NAMES[item.platform] || item.platform} copy
                                      </button>
                                    )}
                                    {onReschedule && (
                                      <button
                                        onClick={() => openReschedule(selected, item)}
                                        disabled={!editable(item)}
                                      >
                                        Reschedule {PLATFORM_NAMES[item.platform] || item.platform}
                                      </button>
                                    )}
                                    {item.status === "Paused" && onResume ? (
                                      <button onClick={() => onResume?.(item.schedule.id)}>
                                        Resume destination
                                      </button>
                                    ) : editable(item) && item.status !== "Paused" && onPause ? (
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
                                    {onDelete && (
                                      <button
                                        className="danger"
                                        onClick={() => onDelete(item.schedule.id)}
                                        disabled={!editable(item)}
                                      >
                                        Cancel destination
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="schedule-release-actions">
                  <button
                    onClick={() => setPreviewOpen(true)}
                    disabled={(!media.url || mediaFailed) && !media.poster}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() =>
                      openCopyEditor(
                        selected,
                        selected.destinations.find(
                          item => editable(item) && canControlDestination(item)
                        )
                      )
                    }
                    disabled={
                      !onEditCopy ||
                      !selected.destinations.some(
                        item => editable(item) && canControlDestination(item)
                      )
                    }
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
                  Expand a destination for its exact copy, media, time and individual controls.
                </p>
              </article>
            )}
          </div>

          <section className="schedule-calendar" aria-label="Release calendar">
            <header>
              <div>
                <h3>Release calendar</h3>
                <p>
                  Select a release to inspect all destinations. Times include the recorded or
                  viewing timezone.
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
                  viewingTimezone
                ).value;
                return (
                  <button
                    key={release.id}
                    className={`schedule-calendar-card ${selected?.id === release.id ? "selected" : ""}`}
                    onClick={() => {
                      selectRelease(release);
                      detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                    }}
                    aria-label={`Select ${release.title}, ${dateLabel(release.time, zone)}, ${release.destinations.length} destinations`}
                  >
                    <span className="schedule-calendar-date">
                      <small>{dateLabel(release.time, zone)}</small>
                      <StatusPill status={release.destinations[0]?.status || "Ready"} />
                    </span>
                    <span
                      className={`schedule-variant ${release.variant === "Timeline" ? "timeline" : "final"}`}
                    >
                      {release.variant === "Timeline"
                        ? "BEHIND THE EDIT"
                        : release.variant === "Final Edit"
                          ? "FINAL VIDEO"
                          : "RELEASE"}
                    </span>
                    <strong>
                      {release.subject}
                      {release.variant ? ` — ${release.variant}` : ""}
                    </strong>
                    <em>
                      {release.destinations.length} destinations · {clockLabel(release.time, zone)}{" "}
                      {timezoneLabel(zone, release.time)}
                    </em>
                    <span className="schedule-calendar-platforms">
                      {release.destinations.map(item => (
                        <span
                          key={`${item.platform}:${item.schedule.id}`}
                          title={PLATFORM_NAMES[item.platform] || item.platform}
                          className={`schedule-platform-icon platform-${item.platform}`}
                        >
                          {PLATFORM_GLYPHS[item.platform] ||
                            (PLATFORM_NAMES[item.platform] || item.platform).slice(0, 1)}
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
      {hasMore && onLoadMore ? (
        <button type="button" className="control-btn" disabled={loading} onClick={onLoadMore}>
          {loading ? "Loading schedules…" : "Load more schedules"}
        </button>
      ) : null}
    </section>
  );
};

export default SchedulesPanel;
