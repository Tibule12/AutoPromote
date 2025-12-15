import React from "react";
import { render, screen } from "@testing-library/react";
import ScheduleCard from "../components/ScheduleCard";

describe("ScheduleCard", () => {
  it("renders a cute schedule card with content preview and actions", () => {
    const schedule = {
      id: "s1",
      startTime: new Date().toISOString(),
      platform: ["youtube"],
      frequency: "once",
      isActive: true,
    };
    const content = { id: "c1", title: "Cute Content", thumbnailUrl: "/image.png" };
    const mockPause = jest.fn();
    const mockDelete = jest.fn();
    render(
      <ScheduleCard
        schedule={schedule}
        content={content}
        onPause={mockPause}
        onDelete={mockDelete}
      />
    );
    expect(screen.getByText(/Cute Content/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pause/i })).toBeInTheDocument();
  });
});
