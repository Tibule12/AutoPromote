import React from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import SchedulesPanel from "../UserDashboardTabs/SchedulesPanel";
import {
  aggregateStatus,
  groupSchedules,
  localFields,
  zonedFieldsToIso,
} from "../UserDashboardTabs/scheduleReleaseModel";

const platforms = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "youtube"];
const pieces = [
  ["Coffee", "timeline", "2026-10-13T09:00:00.000Z"],
  ["Coffee", "final edit", "2026-10-14T09:00:00.000Z"],
  ["Cycling", "timeline", "2026-10-15T09:00:00.000Z"],
  ["Cycling", "final edit", "2026-10-16T09:00:00.000Z"],
  ["Headphones", "timeline", "2026-10-17T09:00:00.000Z"],
  ["Headphones", "final edit", "2026-10-18T09:00:00.000Z"],
];
const schedules = pieces.flatMap(([subject, variant, time], index) =>
  platforms.map(platform => ({
    id: `${subject}-${variant}-${platform}`,
    contentId: platform === "reddit" ? `reddit-content-${index}` : `content-${index}`,
    title: `Made in AutoPromote: ${subject} — the ${variant}`,
    startTime: time,
    timezone: "UTC",
    platform,
    status: "pending",
    isActive: true,
    platformSpecificSettings:
      platform === "facebook" && subject === "Coffee" && variant === "final edit"
        ? { title: "Coffee launch", caption: "A long caption ".repeat(75) }
        : {},
  }))
);

const callbacks = () => ({
  onPause: jest.fn(),
  onResume: jest.fn(),
  onReschedule: jest.fn(),
  onDelete: jest.fn(),
  onPauseMany: jest.fn(),
  onResumeMany: jest.fn(),
  onRescheduleMany: jest.fn(),
  onDeleteMany: jest.fn(),
  onEditCopy: jest.fn().mockResolvedValue(true),
});

test("groups the audited 36 platform assignments into six distinct releases without losing IDs", () => {
  const releases = groupSchedules(schedules, []);
  expect(releases).toHaveLength(6);
  expect(releases.map(release => release.variant)).toEqual([
    "Timeline",
    "Final Edit",
    "Timeline",
    "Final Edit",
    "Timeline",
    "Final Edit",
  ]);
  releases.forEach(release =>
    expect(release.destinations.map(item => item.platform)).toEqual(platforms)
  );
  expect(
    new Set(releases.flatMap(release => release.destinations.map(item => item.schedule.id))).size
  ).toBe(36);
  expect(aggregateStatus(releases[1].destinations)).toBe("6/6 destinations scheduled");
  expect(
    aggregateStatus([{ status: "Published" }, { status: "Publishing" }, { status: "Failed" }])
  ).toBe("1 publishing · 1 published · 1 failed");
});

test("calendar selects the release detail, expands Reddit, and viewing makes no writes", () => {
  const actions = callbacks();
  render(
    <SchedulesPanel
      schedulesList={schedules}
      contentList={[]}
      defaultTimezone="Africa/Johannesburg"
      {...actions}
    />
  );
  expect(screen.getByText("36", { selector: ".schedule-kpis strong" })).toBeInTheDocument();
  expect(screen.getAllByText("Reddit").length).toBeGreaterThan(0);
  const calendar = screen.getByRole("region", { name: "Release calendar" });
  fireEvent.click(
    within(calendar).getByRole("button", {
      name: /Select Made in AutoPromote: Headphones — the final edit/i,
    })
  );
  const detail = screen.getByRole("article", { name: /Headphones — the final edit details/i });
  expect(within(detail).getByText("6/6 destinations scheduled")).toBeInTheDocument();
  fireEvent.click(within(detail).getByRole("button", { name: /Reddit Scheduled/i }));
  expect(within(detail).getByText("No platform-specific caption stored")).toBeInTheDocument();
  Object.values(actions).forEach(action => expect(action).not.toHaveBeenCalled());
});

test("loading does not flash empty counts; missing media and long copy are handled", () => {
  const { rerender } = render(<SchedulesPanel schedulesList={[]} loading contentList={[]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your scheduled releases");
  expect(screen.queryByText("No scheduled releases yet")).not.toBeInTheDocument();
  rerender(<SchedulesPanel schedulesList={schedules} loading={false} contentList={[]} />);
  expect(screen.getByText(/Media preview unavailable/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Final Edit Oct 14/i }));
  fireEvent.click(screen.getByRole("button", { name: /Facebook Scheduled/i }));
  expect(screen.getAllByText(/A long caption A long caption/).length).toBeGreaterThan(0);
});

test("upcoming view hides old history while keeping the six destinations together", () => {
  const old = {
    id: "old-post",
    contentId: "old",
    title: "Old release",
    startTime: "2025-01-01T09:00:00Z",
    platform: "youtube",
    status: "executed",
  };
  render(
    <SchedulesPanel
      schedulesList={[old, ...schedules]}
      contentList={[]}
      currentTime={new Date("2026-10-13T06:00:00Z").getTime()}
    />
  );
  expect(screen.getAllByText("6", { selector: ".schedule-kpis strong" })).toHaveLength(2);
  expect(screen.getByText("36", { selector: ".schedule-kpis strong" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Old release Jan/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View history (1)" }));
  expect(screen.getByRole("button", { name: /Old release Jan/i })).toBeInTheDocument();
});

test("timezone conversion round trips and rejects nonexistent DST time", () => {
  expect(localFields("2026-10-14T09:00:00.000Z", "Africa/Johannesburg")).toEqual({
    date: "2026-10-14",
    time: "11:00",
  });
  expect(zonedFieldsToIso("2026-10-14", "09:00", "Africa/Johannesburg")).toBe(
    "2026-10-14T07:00:00.000Z"
  );
  expect(() => zonedFieldsToIso("2026-03-08", "02:30", "America/New_York")).toThrow(
    /does not exist/
  );
});

test("post copy editor targets one destination and does not write until saved", async () => {
  const actions = callbacks();
  render(<SchedulesPanel schedulesList={schedules} contentList={[]} {...actions} />);
  fireEvent.click(screen.getByRole("button", { name: /Final Edit Oct 14/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Edit post\/copy$/i }));
  const editor = screen.getByRole("dialog", { name: "Edit post copy" });
  expect(within(editor).getByText(/Facebook only/)).toBeInTheDocument();
  expect(actions.onEditCopy).not.toHaveBeenCalled();
  fireEvent.change(within(editor).getByLabelText("Caption / post text"), {
    target: { value: "New Facebook caption" },
  });
  fireEvent.click(within(editor).getByRole("button", { name: "Save destination copy" }));
  await waitFor(() =>
    expect(actions.onEditCopy).toHaveBeenCalledWith("Coffee-final edit-facebook", {
      title: "Coffee launch",
      caption: "New Facebook caption",
    })
  );
  Object.entries(actions)
    .filter(([name]) => name !== "onEditCopy")
    .forEach(([, action]) => expect(action).not.toHaveBeenCalled());
});

test("reschedule dialog submits an instant and its selected timezone", async () => {
  const actions = callbacks();
  actions.onRescheduleMany.mockResolvedValue(true);
  render(<SchedulesPanel schedulesList={schedules} contentList={[]} {...actions} />);
  fireEvent.click(screen.getByRole("button", { name: "Reschedule release" }));
  const dialog = screen.getByRole("dialog", { name: "Reschedule" });
  expect(actions.onRescheduleMany).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByLabelText("Publish date"), {
    target: { value: "2030-10-14" },
  });
  fireEvent.change(within(dialog).getByLabelText("Timezone"), {
    target: { value: "Africa/Johannesburg" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reschedule 6 destinations" }));
  await waitFor(() =>
    expect(actions.onRescheduleMany).toHaveBeenCalledWith(
      expect.arrayContaining(["Coffee-timeline-reddit"]),
      "2030-10-14T07:00:00.000Z",
      "Africa/Johannesburg"
    )
  );
});
