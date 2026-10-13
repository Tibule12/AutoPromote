// Publisher source identity is derived from workflow metadata saved with the
// content, never from a title, caption, or user's description.
const STUDIO = new Set(["studio", "viral_clip_studio", "viral-clip-studio", "viral-clip-rendered", "clip_studio"]);
const GENERATED = new Set(["generated", "idea_video", "idea-to-video", "smart_promo", "smart-promo", "smart_promo_summary"]);

function directContentSource(content = {}) {
  for (const value of [content.source, content.meta?.source, content.sourceContext,
    content.meta?.sourceContext, content.workflowAction, content.meta?.workflowAction, content.sourceType]) {
    const source = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (STUDIO.has(source)) return "studio";
    if (GENERATED.has(source)) return "generated";
    if (source === "ai_clip" && content.sourceClipId && content.sourceAnalysisId) return "studio";
  }
  return null;
}

function contentSource(content = {}, recordsById, visited = new Set()) {
  const direct = directContentSource(content);
  if (direct) return direct;
  const parentId = content.meta?.sourceContentId;
  if (!parentId || !recordsById || visited.has(parentId)) return null;
  visited.add(parentId);
  const parent = recordsById.get(parentId);
  return parent ? contentSource(parent, recordsById, visited) : null;
}

module.exports = { directContentSource, contentSource };
