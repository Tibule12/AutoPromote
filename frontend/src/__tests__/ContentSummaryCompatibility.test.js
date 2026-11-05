import { assetFromContent } from "../features/publishing/utils/publisherWorkflow";
import {
  groupSchedules,
  releaseMedia,
  scheduleCopy,
  scheduleMedia,
} from "../UserDashboardTabs/scheduleReleaseModel";
const { contentListSummary } = require("../../../src/utils/contentListSummary");

const source = {
  id: "release",
  title: "Podcast",
  description: "Reviewed description",
  type: "video",
  url: "https://media.test/source.mp4?token=private",
  persistentMediaUrl: "https://media.test/final.mp4",
  posterUrl: "https://media.test/poster.png",
  template: { name: "Studio template" },
  downloadInfo: { url: "https://media.test/download.mp4", diagnostic: "not needed" },
  meta: {
    source: "studio",
    sourceContentId: "parent",
    duration: 6,
    storagePath: "studio/sources/owner/a.mp4",
    renderOutputHash: "hash",
    width: 720,
    height: 900,
    studioDocument: { private: "graph" },
  },
  virtualClip: { start: 1, end: 5 },
  platform_options: {
    discord: { message: "Channel-specific copy", media_url: "https://media.test/destination.mp4" },
  },
  editor_timeline: { private: "large project graph" },
};

test("compact list preserves the actual Queue grouping, source media and destination copy", () => {
  const compact = { id: source.id, ...contentListSummary(source) };
  const schedule = {
    id: "schedule",
    contentId: source.id,
    platform: "discord",
    status: "scheduled",
    startTime: "2026-11-06T12:00:00Z",
    title: source.title,
  };
  expect(releaseMedia(compact)).toEqual(releaseMedia(source));
  expect(scheduleMedia(schedule, compact)).toEqual(scheduleMedia(schedule, source));
  expect(scheduleCopy(schedule, compact)).toEqual(scheduleCopy(schedule, source));
  const full = groupSchedules([schedule], [source])[0];
  const small = groupSchedules([schedule], [compact])[0];
  for (const key of ["id", "title", "subject", "time", "variant"])
    expect(small[key]).toEqual(full[key]);
  expect(small.destinations[0].status).toBe(full.destinations[0].status);
});

test("Publisher fallback retains exact asset identity and source/output metadata", () => {
  const compact = { id: source.id, ...contentListSummary(source) };
  expect(assetFromContent(compact)).toEqual(assetFromContent(source));
  const expired = { ...source, storageRetentionStatus: "deleted_after_publication" };
  expect(assetFromContent(contentListSummary(expired))).toBeNull();
  expect(releaseMedia(contentListSummary(expired))).toEqual(releaseMedia(expired));
});
