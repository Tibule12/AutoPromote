// Dashboard/Queue contracts only. Full Publisher reads retain the existing
// response. Project graphs, transcripts, provider payloads and history stay in
// their authoritative records instead of being downloaded on every sign-in.
const CONTENT_LIST_FIELDS = Object.freeze([
  "user_id",
  "userId",
  "uid",
  "workspace_id",
  "teamReleaseId",
  "teamApproval",
  "teamReleaseRevision",
  "title",
  "description",
  "caption",
  "type",
  "mediaType",
  "status",
  "created_at",
  "createdAt",
  "url",
  "persistentMediaUrl",
  "processedUrl",
  "mediaUrl",
  "media_url",
  "video_url",
  "file_url",
  "storagePath",
  "downloadInfo.url",
  "posterUrl",
  "thumbnailUrl",
  "selectedThumbnailUrl",
  "thumbnail",
  "storageRetentionStatus",
  "platform_options",
  "platformOptions",
  "target_platforms",
  "source",
  "origin",
  "createdWith",
  "sourceContext",
  "workflowAction",
  "sourceType",
  "sourceClipId",
  "sourceAnalysisId",
  "meta.source",
  "meta.sourceContext",
  "meta.workflowAction",
  "meta.sourceContentId",
  "templateName",
  "template.name",
  "meta.template.name",
  "duration",
  "width",
  "height",
  "size",
  "mimeType",
  "fileName",
  "contentHash",
  "virtualClip",
  "renderOutputHash",
  "mediaHash",
  "meta.duration",
  "meta.width",
  "meta.height",
  "meta.renderOutputHash",
  "meta.mediaHash",
  "meta.storagePath",
]);

function contentListSummary(data) {
  const result = {};
  for (const field of CONTENT_LIST_FIELDS) {
    const parts = field.split(".");
    let value = data;
    for (const part of parts) value = value?.[part];
    if (value === undefined) continue;
    let output = result;
    for (const part of parts.slice(0, -1)) output = output[part] ||= {};
    output[parts.at(-1)] = value;
  }
  // Ownership fields above are needed to enforce scope, not to render a row.
  for (const key of [
    "user_id",
    "userId",
    "uid",
    "workspace_id",
    "teamReleaseId",
    "teamApproval",
    "teamReleaseRevision",
  ])
    delete result[key];
  return result;
}

module.exports = { CONTENT_LIST_FIELDS, contentListSummary };
