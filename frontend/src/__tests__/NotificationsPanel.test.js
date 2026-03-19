import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import NotificationsPanel from "../UserDashboardTabs/NotificationsPanel";

test("notifications panel surfaces repost CTA navigation", () => {
  const onNavigate = jest.fn();

  render(
    <NotificationsPanel
      notifs={[
        {
          id: "notif-1",
          title: "Repost preview recommended",
          message: "Open Upload History and build a sharper repost preview.",
          type: "viral",
          read: false,
          created_at: new Date().toISOString(),
          metadata: {
            targetTab: "upload",
            targetPanel: "history",
            ctaLabel: "Build repost preview",
            contentId: "content-1",
          },
        },
      ]}
      onMarkAllRead={() => {}}
      onNavigate={onNavigate}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Build repost preview/i }));

  expect(onNavigate).toHaveBeenCalledWith("upload", {
    uploadTab: "history",
    contentId: "content-1",
  });
});
