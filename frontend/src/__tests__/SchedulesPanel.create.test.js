import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SchedulesPanel from "../UserDashboardTabs/SchedulesPanel";

test("New release opens the existing Publisher without creating a schedule", () => {
  const onNavigate = jest.fn();
  const onCreate = jest.fn();
  const { rerender } = render(
    <SchedulesPanel
      schedulesList={[]}
      contentList={[]}
      onNavigate={onNavigate}
      onCreate={onCreate}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "+ New release" }));
  expect(onNavigate).toHaveBeenCalledWith("upload");
  expect(onCreate).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Select Content")).not.toBeInTheDocument();
  rerender(<SchedulesPanel schedulesList={[]} contentList={[]} onCreate={onCreate} />);
  expect(screen.queryByRole("button", { name: "+ New release" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Schedule post" })).not.toBeInTheDocument();
});

test("period selection and pagination preserve queue controls", () => {
  const onScopeChanged = jest.fn(),
    onLoadMore = jest.fn();
  const { rerender } = render(
    <SchedulesPanel
      schedulesList={[]}
      scheduleScope="week"
      hasMore
      onScopeChanged={onScopeChanged}
      onLoadMore={onLoadMore}
    />
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Queue period" }), {
    target: { value: "all" },
  });
  expect(onScopeChanged).toHaveBeenCalledWith("all");
  fireEvent.click(screen.getByRole("button", { name: "Load more schedules" }));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  rerender(
    <SchedulesPanel
      schedulesList={[]}
      hasMore
      loading
      onScopeChanged={onScopeChanged}
      onLoadMore={onLoadMore}
    />
  );
  expect(screen.getByRole("button", { name: "Loading schedules…" })).toBeDisabled();
});
