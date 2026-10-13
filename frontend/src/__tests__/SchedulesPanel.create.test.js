import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SchedulesPanel from "../UserDashboardTabs/SchedulesPanel";

test("New release opens the existing Publisher without creating a schedule", () => {
  const onNavigate = jest.fn();
  const onCreate = jest.fn();
  const { rerender } = render(
    <SchedulesPanel schedulesList={[]} contentList={[]} onNavigate={onNavigate} onCreate={onCreate} />
  );
  fireEvent.click(screen.getByRole("button", { name: "+ New release" }));
  expect(onNavigate).toHaveBeenCalledWith("upload");
  expect(onCreate).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Select Content")).not.toBeInTheDocument();
  rerender(<SchedulesPanel schedulesList={[]} contentList={[]} onCreate={onCreate} />);
  expect(screen.queryByRole("button", { name: "+ New release" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Schedule post" })).not.toBeInTheDocument();
});
