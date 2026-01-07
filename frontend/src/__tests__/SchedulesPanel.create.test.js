import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SchedulesPanel from "../UserDashboardTabs/SchedulesPanel";

describe("SchedulesPanel create schedule", () => {
  test("Calls onCreate with contentId and platforms", async () => {
    const mockOnCreate = jest.fn(async () => {});
    const contentList = [
      { id: "c1", title: "Content 1" },
      { id: "c2", title: "Content 2" },
    ];
    render(
      <SchedulesPanel
        schedulesList={[]}
        contentList={contentList}
        onCreate={mockOnCreate}
        onPause={() => {}}
        onResume={() => {}}
        onReschedule={() => {}}
        onDelete={() => {}}
      />
    );

    // 1. Open Injector
    const injectBtn = screen.getByText(/\+ INJECT EVENT/i);
    fireEvent.click(injectBtn);

    // 2. Choose Content
    const contentSelect = screen.getByLabelText("Select Content");
    fireEvent.change(contentSelect, { target: { value: "c1" } });

    // 3. Set Date/Time
    const dateInput = screen.getByLabelText("Schedule Date");
    const timeInput = screen.getByLabelText("Schedule Time");

    // Set a future date/time
    fireEvent.change(dateInput, { target: { value: "2030-01-01" } });
    fireEvent.change(timeInput, { target: { value: "12:00" } });

    // 4. Select Platform
    const ytBtn = screen.getByRole("button", { name: "YouTube" });
    fireEvent.click(ytBtn);

    // 5. Submit
    const submitBtn = screen.getByText(/INITIATE SCHEDULE/i);
    fireEvent.click(submitBtn);

    // Wait for async onCreate
    await waitFor(() => expect(mockOnCreate).toHaveBeenCalled(), { timeout: 10000 });

    const payload = mockOnCreate.mock.calls[0][0];
    expect(payload.contentId).toBe("c1");
    // The component constructs the ISO string: `2030-01-01T12:00:00.000Z`
    expect(payload.time).toContain("2030-01-01T12:00");
    expect(Array.isArray(payload.platforms)).toBe(true);
    expect(payload.platforms).toContain("youtube");
  });
});
