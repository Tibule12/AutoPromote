// Legacy URLs and persisted navigation intents never recreate retired tools.
const RETIRED = {
  analytics: "schedules",
  metrics: "schedules",
  smart_promo: "viral_clip_studio",
  "smart-promo": "viral_clip_studio",
  smartpromo: "viral_clip_studio",
  idea_video: "viral_clip_studio",
  "idea-video": "viral_clip_studio",
  "idea-to-video": "viral_clip_studio",
  idea_to_video: "viral_clip_studio",
};

export function workspaceDestination(tab) {
  const key = String(tab || "").toLowerCase();
  return RETIRED[key] || (["clips", "find_viral_clips"].includes(key) ? "clip_studio" : key);
}

export function requestedWorkspace(search = "") {
  const params = new URLSearchParams(search);
  const requested = params.get("tab") || params.get("workspace") || params.get("feature");
  // Team invitation workspace IDs are not navigation intents.
  const active = [
    "profile",
    "schedules",
    "upload",
    "viral_clip_studio",
    "clip_studio",
    "cam_combiner",
    "billing",
    "connections",
  ];
  const destination = workspaceDestination(requested);
  return active.includes(destination) ? destination : null;
}

export const RETIRED_PUBLIC_PATH =
  /^\/(?:analytics|metrics|smart[-_]promo|smartpromo|idea[-_]video|idea[-_]to[-_]video)(?:\/.*)?$/i;

export function retiredWorkspacePath(path) {
  if (!RETIRED_PUBLIC_PATH.test(path)) return null;
  return `/?tab=${workspaceDestination(path.split("/")[1])}`;
}
