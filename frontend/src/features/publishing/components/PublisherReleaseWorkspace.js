import React, { useEffect, useState } from "react";
import { getPlatformName } from "../utils/publishingUtils";
import { PUBLISHER_PLATFORMS, PUBLISHER_STEPS, destinationCopy, mediaUrl, sourceLabels } from "../utils/publisherWorkflow";
import { formatScheduleTime, timezoneLabel } from "../../../UserDashboardTabs/scheduleReleaseModel";
import { getSafeMediaSource } from "../../../utils/security";

const glyphs = { facebook: "f", instagram: "◎", linkedin: "in", reddit: "●", tiktok: "♪", youtube: "▶" };
export function PublisherPlatformIcon({ platform }) {
  return <span aria-hidden="true" className={`release-platform-icon ${platform}`}>{glyphs[platform]}</span>;
}

function ReleaseMedia({ file, preview, poster, onMetadata, label = "Release media" }) {
  const [objectUrl, setObjectUrl] = useState("");
  useEffect(() => {
    if (!(file instanceof Blob)) { setObjectUrl(""); return undefined; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const url = getSafeMediaSource(mediaUrl(file) || objectUrl || preview || "");
  const type = String(file?.type || "");
  const image = type.startsWith("image") || /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url);
  if (!url) return <div className="release-media-empty">Choose a finished video or image</div>;
  return image ? <img className="release-media" src={url} alt={label} /> :
    <video className="release-media" src={url} poster={getSafeMediaSource(poster || file?.thumbnailUrl || "") || undefined} controls preload="metadata" aria-label={label} onLoadedMetadata={event => onMetadata?.(event.currentTarget)} />;
}

export default function PublisherReleaseWorkspace({
  embedded, step, moveToStep, title, description, onTitle, onDescription,
  file, preview, poster, duration, dimensions, onMetadata, onUploadFile,
  assetTab, onAssetTab, assets, assetsLoading, onSelectAsset, sourceAsset,
  selected, togglePlatform, focus, activatePlatform, connections, issues,
  visited, forms, copyMaster, mode, setMode, deliveryFields, setDeliveryFields,
  timezone, setTimezone, timezones, delivery, deliveryError, frequency, setFrequency,
  customSchedule, setCustomSchedule, customFields, setCustomFields,
  reviewOptions, getData, nextReason, submit, submitting, feedback, onNavigate,
}) {
  const [assetQuery, setAssetQuery] = useState("");
  const [showAllAssets, setShowAllAssets] = useState(false);
  const matchingAssets = assets.filter(asset => `${asset.name} ${asset.templateName || ""}`.toLowerCase().includes(assetQuery.trim().toLowerCase()));
  const displayedAssets = showAllAssets ? matchingAssets : matchingAssets.slice(0, 12);
  const complete = selected.filter(platform => !issues[platform]?.length).length;
  const source = sourceLabels(sourceAsset || file);
  const releaseTitle = title || file?.name || "New release";
  const focusedData = getData(focus);
  const focusedOptions = reviewOptions[focus] || {};
  const copy = destinationCopy(focus, focusedOptions, title, description);
  const focusedMedia = focusedData.file || file;
  const badge = platform => issues[platform]?.length ? issues[platform][0] : "Complete";
  const buttonLabels = ["Choose destinations", "Customize destinations", "Continue to Delivery", "Review release"];
  const forwardReason = nextReason(step + 1);
  return (
    <div className={`unified-publisher-container publisher-release${embedded ? " is-embedded" : ""}`}>
      {!embedded && <header className="release-page-heading"><h1>Publisher</h1><p>Prepare one release. Complete every destination.</p></header>}
      <div className="release-workflow-heading">
        <ol className="release-stepper" aria-label="Publishing workflow">
          {PUBLISHER_STEPS.map((name, index) => <li key={name} className={step === index ? "active" : step > index ? "complete" : ""}>
            <button type="button" onClick={() => moveToStep(index)} aria-current={step === index ? "step" : undefined}>
              <span>{step > index ? "✓" : index + 1}</span>{name}
            </button>
          </li>)}
        </ol>
      </div>
      <header className="release-identity"><h2>{releaseTitle}</h2><p>{step === 0 ? file ? "Content selected. Continue to destinations or choose another asset." : "Choose a video or image to start." : step === 1 ? "Choose where this content will be published." : step === 2 ? "Customize each destination's post." : step === 3 ? "Choose when to publish." : "Review every post before submitting your release."}</p></header>
      <div className={`release-workspace release-stage-${step}${file ? "" : " is-empty"}`}>
        {(file || step > 0) && <aside className="release-sidebar">
          {file && <section className="release-card release-content-card" aria-label="Release content">
            <h3>Content</h3>
            <ReleaseMedia file={file} preview={preview} poster={poster} onMetadata={onMetadata} />
            <strong className="release-media-name">{releaseTitle}</strong>
            {file && <p className="release-media-meta">{duration > 0 ? `${Math.round(duration)} seconds` : "Duration unavailable"}{dimensions.width && dimensions.height ? ` · ${dimensions.width}:${dimensions.height}` : ""}</p>}
            {source.origin && <p className="release-origin">{source.origin}</p>}
            {source.template && <p className="release-origin">{source.template}</p>}
            {file && step !== 0 && <button type="button" className="release-text-button" onClick={() => moveToStep(0)}>Change content</button>}
          </section>}
          {step > 1 && <section className="release-card release-destination-list" aria-label="Selected destinations">
            <h3>Destinations</h3>{selected.length > 0 && <p>{selected.length} selected · {complete} complete</p>}
            {selected.map(platform => <button key={platform} type="button" className={`release-destination-row ${focus === platform ? "active" : ""}`} onClick={() => { activatePlatform(platform); moveToStep(2); }}>
              <PublisherPlatformIcon platform={platform} /><strong>{getPlatformName(platform)}</strong>
              <span className={`release-connection ${connections[platform]?.connected ? "connected" : ""}`}>{connections[platform]?.label}</span>
              <span className={`release-form-status ${issues[platform]?.length ? "attention" : "complete"}`}>{badge(platform)}</span>
              <span aria-hidden="true">›</span>
            </button>)}
            {!selected.length && <p>{file ? "Choose where this content will be published." : "Choose content first, then select destinations."}</p>}
            {step > 1 && <button type="button" className="release-text-button" onClick={() => moveToStep(1)}>Change destinations</button>}
          </section>}
        </aside>}
        <main className="release-main">
          {step === 0 && <section className="release-card release-content-chooser" aria-label="Choose release content">
            <h3>Choose your content</h3><p>Use media AutoPromote already owns, or upload a video or image.</p>
            <div className="release-source-tabs" role="tablist" aria-label="Content sources">
              {[ ["studio", "Studio"], ["generated", "Generated"], ["assets", "Project assets"], ["upload", "Upload"] ].map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={assetTab === id} onClick={() => { setAssetQuery(""); setShowAllAssets(false); onAssetTab(id); }}>{name}</button>)}
            </div>
            {assetTab !== "upload" && !assetsLoading && assets.length > 12 && <label className="release-asset-search">Find an asset<input type="search" value={assetQuery} onChange={event => { setAssetQuery(event.target.value); setShowAllAssets(false); }} placeholder="Search by name or template" /></label>}
            {assetTab === "upload" ? <label className="release-upload"><strong>Choose a video or image</strong><span>Upload from your device</span><input aria-label="Upload release media" type="file" accept="video/*,image/*" onChange={onUploadFile} /></label> : <div className="release-asset-grid" aria-busy={assetsLoading}>
              {!assetsLoading && displayedAssets.map(asset => <button key={asset.sourceContentId} type="button" aria-pressed={!!file && sourceAsset?.sourceContentId === asset.sourceContentId} onClick={() => onSelectAsset(asset)}>
                {asset.thumbnailUrl ? <img src={getSafeMediaSource(asset.thumbnailUrl)} alt="" /> : <span className="release-asset-placeholder" aria-hidden="true">▷</span>}
                <strong>{asset.name}</strong>{sourceLabels(asset).template && <small>{sourceLabels(asset).template}</small>}
              </button>)}
              {assetsLoading ? <p role="status">Loading {assetTab === "assets" ? "project" : assetTab} assets…</p> : !matchingAssets.length && <p>{assetQuery ? "No assets match that search." : `No available ${assetTab === "assets" ? "project" : assetTab} assets in this workspace. Use another source or upload media.`}</p>}
              {!assetsLoading && !showAllAssets && matchingAssets.length > displayedAssets.length && <button type="button" className="release-show-assets" onClick={() => setShowAllAssets(true)}>Show all {matchingAssets.length} assets</button>}
            </div>}
          </section>}
          {step === 1 && <section className="release-card" aria-label="Choose destinations"><h3>Choose destinations</h3><p>Select the destinations for this release. You can customize each post next.</p>
            <div className="release-platform-grid">{PUBLISHER_PLATFORMS.map(platform => <label key={platform} className={selected.includes(platform) ? "selected" : ""}>
              <input type="checkbox" checked={selected.includes(platform)} onChange={() => togglePlatform(platform)} /><PublisherPlatformIcon platform={platform} /><strong>{getPlatformName(platform)}</strong><small>{connections[platform]?.label}</small>
            </label>)}</div>
            {onNavigate && <button type="button" className="release-text-button" onClick={() => onNavigate("connections")}>Manage provider connections →</button>}
          </section>}
          <section className="release-customize" hidden={step !== 2} aria-label="Customize destinations">
            <div className="release-card release-master-copy"><h3>Starting copy</h3><p>Edit the copy shared with your destinations. Each destination can keep its own edits.</p>
              <label>Master title<input value={title} onChange={event => onTitle(event.target.value)} maxLength={160} /></label>
              <label>Master description<textarea value={description} onChange={event => onDescription(event.target.value)} maxLength={5000} rows={4} /></label>
            </div>
            <div className="release-platform-tabs" role="tablist" aria-label="Destination forms">{selected.map(platform => <button type="button" key={platform} role="tab" aria-selected={focus === platform} onClick={() => activatePlatform(platform)}><PublisherPlatformIcon platform={platform} />{getPlatformName(platform)}</button>)}</div>
            {selected.filter(platform => visited[platform]).map(platform => <section key={platform} className="release-card release-form-card" hidden={focus !== platform} aria-label={`${getPlatformName(platform)} form`}>
              <div className="release-form-heading"><div><h3>{getPlatformName(platform)} post</h3><p>Complete the required fields for this destination.</p></div><button type="button" className="release-text-button" onClick={() => copyMaster(platform)}>Use master copy</button></div>
              {!!issues[platform]?.length && <div className="release-issues" role="status"><strong>Before delivery</strong><ul>{issues[platform].map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
              {forms(platform)}
            </section>)}
          </section>
          {step === 3 && <section className="release-card release-delivery" aria-label="Delivery settings"><h3>Delivery</h3><p>Choose when the completed posts are sent.</p>
            <div className="release-delivery-modes">{[["now", "Publish now", "Send to selected destinations now."], ["schedule", "Schedule", "Choose date, time and timezone."]].map(([id, name, help]) => <label key={id} className={mode === id ? "selected" : ""}><input type="radio" name="release-delivery" checked={mode === id} onChange={() => setMode(id)} /><strong>{name}</strong><span>{help}</span></label>)}</div>
            {mode === "now" ? <p>Submission queues delivery immediately. Each destination confirms delivery separately.</p> : <>
              <div className="release-date-time"><label>Date<input type="date" value={deliveryFields.date} onChange={event => setDeliveryFields({ ...deliveryFields, date: event.target.value })} /></label><label>Time<input type="time" value={deliveryFields.time} onChange={event => setDeliveryFields({ ...deliveryFields, time: event.target.value })} /></label></div>
              <label>Timezone<select value={timezone} onChange={event => setTimezone(event.target.value)}>{timezones.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
              {delivery?.scheduledTime && <p className="release-exact-time">{formatScheduleTime(delivery.scheduledTime, timezone)} · {timezoneLabel(timezone, delivery.scheduledTime)}<small>{delivery.scheduledTime} (UTC)</small></p>}
              <label>Repeat<select value={frequency} onChange={event => setFrequency(event.target.value)}>{["once", "daily", "weekly", "monthly"].map(value => <option key={value} value={value}>{value === "once" ? "Once" : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
              <label className="release-check"><input type="checkbox" checked={customSchedule} onChange={event => setCustomSchedule(event.target.checked)} />Use a different time for each destination</label>
              {customSchedule && selected.map(platform => <fieldset key={platform} className="release-custom-time"><legend>{getPlatformName(platform)}</legend><label>Date<input type="date" value={customFields[platform]?.date || deliveryFields.date} onChange={event => setCustomFields(platform, { ...customFields[platform], date: event.target.value })} /></label><label>Time<input type="time" value={customFields[platform]?.time || deliveryFields.time} onChange={event => setCustomFields(platform, { ...customFields[platform], time: event.target.value })} /></label></fieldset>)}
              {deliveryError && <p className="release-error" role="alert">{deliveryError}</p>}
            </>}
          </section>}
          {step === 4 && <section className="release-card release-review" aria-label="Review release"><h3>Review your release</h3><p>{selected.length} destinations · {mode === "schedule" ? "Scheduled delivery" : "Publish now"}</p>
            {mode === "schedule" && delivery?.scheduledTime && <p className="release-exact-time">{formatScheduleTime(delivery.scheduledTime, timezone)} · {timezoneLabel(timezone, delivery.scheduledTime)}<small>Repeat: {frequency}</small></p>}
            <p>Review the submitted copy, media and destination settings below. Providers may format captions, links or media.</p>
            {selected.map(platform => { const options = reviewOptions[platform]; const content = destinationCopy(platform, options, title, description); const instant = delivery?.platformTimes?.[platform] || delivery?.scheduledTime; return <details key={platform} open={focus === platform} className="release-review-destination"><summary><PublisherPlatformIcon platform={platform} /><strong>{getPlatformName(platform)}</strong><span>{issues[platform]?.length ? "Needs attention" : "Form complete"}</span></summary><div>
              <h4>{content.title || "No title"}</h4><p className="release-full-copy">{content.body || "No caption/body"}</p><ReleaseMedia file={getData(platform).file || file} preview={preview} poster={poster} label={`${getPlatformName(platform)} review media`} />
              <dl>{[["Page", options.pageName || options.pageId], ["Subreddit", options.subreddit], ["Post type", options.kind || options.postType], ["Link", options.url], ["Visibility", options.privacy || options.visibility], ["Company Page", options.companyId], ["Category", options.category], ["Tags", options.tags], ["Made for kids", typeof options.madeForKids === "boolean" ? options.madeForKids ? "Yes" : "No" : ""], ["Commercial disclosure", options.commercialContent ? "Enabled" : ""], ["Paid promotion", options.paidPromotion ? "Enabled" : ""]].filter(([, value]) => value !== undefined && value !== null && value !== "").map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd></div>)}</dl>
              <p>{mode === "schedule" && instant ? `${formatScheduleTime(instant, timezone)} · ${timezoneLabel(timezone, instant)}` : "Send immediately after submission"}</p><button type="button" className="release-text-button" onClick={() => { activatePlatform(platform); moveToStep(2); }}>Edit {getPlatformName(platform)} settings</button>
            </div></details>; })}
          </section>}
        </main>
        {step === 2 && <aside className="release-inspector">
          <section className="release-card release-post-preview" aria-label={`${getPlatformName(focus)} post preview`}><h3><PublisherPlatformIcon platform={focus} />{getPlatformName(focus)} preview</h3><div className="release-social-preview">
            <small>{focus === "reddit" ? focusedOptions.subreddit ? `r/${focusedOptions.subreddit}` : "Subreddit not selected" : getPlatformName(focus)}</small><h4>{copy.title}</h4><p className="release-full-copy">{copy.body || "Your post copy will appear here."}</p><ReleaseMedia file={focusedMedia} preview={preview} poster={poster} label={`${getPlatformName(focus)} post media`} />
          </div><small>Preview of your submitted media and copy.</small></section>
        </aside>}
      </div>
      <footer className="release-footer"><div>{step > 0 && <button type="button" className="release-text-button" onClick={() => moveToStep(step - 1)}>← Back to {PUBLISHER_STEPS[step - 1]}</button>}</div><div className="release-footer-action">
        {(feedback || forwardReason) && <p className="release-error" role="status">{feedback || forwardReason}</p>}
        {step < 4 ? <button type="button" className="release-primary" disabled={!!forwardReason || submitting} onClick={() => moveToStep(step + 1)}>{buttonLabels[step]} →</button> : <button type="button" className="release-primary" disabled={!!nextReason(4) || submitting} onClick={submit}>{submitting ? "Submitting…" : mode === "schedule" ? `Schedule ${selected.length} posts` : `Publish to ${selected.length} destinations`} →</button>}
      </div></footer>
    </div>
  );
}
