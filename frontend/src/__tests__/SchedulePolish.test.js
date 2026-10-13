import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import SchedulesPanel from "../UserDashboardTabs/SchedulesPanel";
import {
  displayTimezone, timezoneLabel, scheduleCopy, scheduleMedia,
} from "../UserDashboardTabs/scheduleReleaseModel";

const instant = "2030-10-14T09:00:00.000Z";
const platforms = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "youtube"];
const fields = { facebook: "message", instagram: "caption", linkedin: "commentary", reddit: "text", tiktok: "caption", youtube: "description" };
const media = { id: "media", title: "Coffee", type: "video", url: "https://example.test/coffee.mp4", posterUrl: "https://example.test/poster.jpg" };
const schedules = platforms.map(platform => ({
  id: `schedule-${platform}`, platform, contentId: "media", title: "Coffee",
  startTime: instant, timezone: "UTC", status: "pending", isActive: true,
  platformSpecificSettings: { title: `${platform} title`, [fields[platform]]: `${platform} full copy\n${"Full caption. ".repeat(70)}` },
}));

test("expanding all six destinations exposes full copy and shared media without a write", () => {
  const mutations = { onPause: jest.fn(), onResume: jest.fn(), onReschedule: jest.fn(), onDelete: jest.fn(), onEditCopy: jest.fn() };
  const before = JSON.stringify(schedules);
  render(<SchedulesPanel schedulesList={schedules} contentList={[media]} defaultTimezone="Africa/Johannesburg" {...mutations} />);
  for (const platform of platforms) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${platform} Scheduled`, "i") }));
    const detail = document.querySelector(".schedule-destination-detail");
    expect(within(detail).getByText(`${platform} title`)).toBeInTheDocument();
    expect(within(detail).getByText(new RegExp(`${platform} full copy`))).toHaveTextContent("Full caption. ".repeat(70).trim());
    expect(detail.querySelector("video")).toHaveAttribute("src", media.url);
    expect(detail.querySelector("video")).toHaveAttribute("poster", media.posterUrl);
    expect(detail).toHaveTextContent("11:00 AM");
    expect(detail).toHaveTextContent("Africa/Johannesburg (UTC+02)");
    expect(detail).toHaveTextContent("Stored timezone: UTC");
  }
  fireEvent.change(screen.getByRole("combobox", { name: /View times in/ }), { target: { value: "UTC" } });
  expect(document.querySelector(".schedule-destination-detail")).toHaveTextContent("9:00 AM");
  expect(JSON.stringify(schedules)).toBe(before);
  Object.values(mutations).forEach(callback => expect(callback).not.toHaveBeenCalled());
});

test("display zone preserves stored metadata and uses the offset at the scheduled instant", () => {
  const schedule = { timezone: "UTC", startTime: instant };
  expect(displayTimezone(schedule, "Africa/Johannesburg")).toEqual({ value: "Africa/Johannesburg", recorded: false, storedValue: "UTC" });
  expect(schedule.startTime).toBe(instant);
  expect(timezoneLabel("America/New_York", "2030-01-14T09:00:00Z")).toBe("America/New_York (UTC-05)");
  expect(timezoneLabel("America/New_York", "2030-07-14T09:00:00Z")).toBe("America/New_York (UTC-04)");
  expect(timezoneLabel("Asia/Kolkata", instant)).toBe("Asia/Kolkata (UTC+05:30)");
  expect(displayTimezone({}, "Africa/Johannesburg").storedValue).toBe("");
  expect(timezoneLabel("invalid/zone", instant)).toBe("UTC (UTC+00)");
});

test("copy aliases use persisted settings and real platform options", () => {
  expect(scheduleCopy({ message: "edited", platformSpecificSettings: { text: "old" } }, media).caption).toBe("edited");
  expect(scheduleCopy({ platform: "linkedin" }, { ...media, platform_options: { linkedin: { commentary: "LinkedIn-specific" } } }).caption).toBe("LinkedIn-specific");
  expect(scheduleCopy({}, media, "facebook").title).toBe("Coffee");
});

test("destination media uses its recorded override and source media before processed fallback", () => {
  expect(scheduleMedia({ platformSpecificSettings: { media_url: "https://example.test/override.mp4" } }, media).url).toBe("https://example.test/override.mp4");
  expect(scheduleMedia({}, { ...media, processedUrl: "https://example.test/old.mp4" }).url).toBe(media.url);
  expect(scheduleMedia({ platform: "reddit" }, { ...media, platform_options: { reddit: { media_url: "https://example.test/reddit.png", media_type: "IMAGE" } } }).kind).toBe("image");
  expect(scheduleMedia({ platformSpecificSettings: { media_url: "javascript:bad" } }, null).url).toBe("");
});

test("a shared schedule never offers misleading individual actions", () => {
  const shared = { ...schedules[0], platform: undefined, platforms: ["facebook", "instagram"] };
  const action = jest.fn();
  render(<SchedulesPanel schedulesList={[shared]} contentList={[media]} onEditCopy={action} onPause={action} onResume={action} onReschedule={action} onDelete={action} />);
  fireEvent.click(screen.getByRole("button", { name: /Facebook Scheduled/ }));
  const detail = document.querySelector(".schedule-destination-detail");
  expect(detail).toHaveTextContent("shared by multiple destinations");
  expect(within(detail).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit post/copy" })).toBeDisabled();
  expect(action).not.toHaveBeenCalled();
});

test("missing callback hides an unsupported destination control", () => {
  render(<SchedulesPanel schedulesList={[schedules[0]]} contentList={[media]} />);
  fireEvent.click(screen.getByRole("button", { name: /Facebook Scheduled/ }));
  expect(within(document.querySelector(".schedule-destination-detail")).queryByRole("button")).not.toBeInTheDocument();
});

test("origin is shown only when explicit metadata exists", () => {
  const { rerender } = render(<SchedulesPanel schedulesList={[schedules[0]]} contentList={[media]} />);
  expect(screen.queryByText(/Created in Studio|Template:/)).not.toBeInTheDocument();
  rerender(<SchedulesPanel schedulesList={[schedules[0]]} contentList={[{ ...media, source: "viral_clip_studio" }]} />);
  expect(screen.getByText("Created in Studio")).toBeInTheDocument();
  rerender(<SchedulesPanel schedulesList={[schedules[0]]} contentList={[{ ...media, meta: { template: { name: "Coffee launch" } } }]} />);
  expect(screen.getByText("Template: Coffee launch")).toBeInTheDocument();
});
