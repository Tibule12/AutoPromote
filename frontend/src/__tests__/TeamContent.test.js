import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TeamContent from "../UserDashboardTabs/TeamContent";

const release = {
  id: "a".repeat(64),
  revision: 3,
  status: "pending_review",
  media: { generation: "123" },
  payload: {
    title: "Shared movie",
    description: "Reviewed description",
    platforms: ["telegram"],
    platformOptions: { telegram: { message: "Exact caption" } },
    time: null,
  },
  comments: [],
};
const payload = role => ({
  role,
  sharedPlatforms: ["telegram"],
  releases: [release],
  activity: [],
  projects: [],
});
beforeEach(() => {
  global.fetch = jest.fn();
});
const respond = value => ({ ok: true, json: async () => value });
const mount = role => {
  global.fetch.mockResolvedValue(respond(payload(role)));
  return render(
    <TeamContent
      workspace={{ id: "workspace-1", ownerUid: "owner" }}
      members={[{ uid: "editor", email: "editor@example.test" }]}
      onNavigate={jest.fn()}
    />
  );
};
test("Editor sees preparation and revision without approval or shared-connection management", async () => {
  mount("editor");
  await screen.findByRole("heading", { name: "Shared movie" });
  expect(screen.queryByRole("button", { name: /^Approve revision/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save shared connections" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Revise release" })).toBeEnabled();
});
test("Viewer can comment without preparation, revision, approval or editable project upload", async () => {
  mount("viewer");
  await screen.findByRole("heading", { name: "Shared movie" });
  expect(screen.queryByRole("button", { name: "Prepare a team release" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Revise release" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Native project backup")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Review comment"), {
    target: { value: "Please shorten the ending." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/comments"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Please shorten the ending." }),
      })
    )
  );
});
test("Admin approves exactly the displayed revision", async () => {
  mount("admin");
  await screen.findByRole("heading", { name: "Shared movie" });
  fireEvent.click(screen.getByRole("button", { name: "Approve revision 3" }));
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/review"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ revision: 3, decision: "approved" }),
      })
    )
  );
  expect(
    screen.queryByRole("button", { name: "Schedule approved release" })
  ).not.toBeInTheDocument();
});
test("a failed approval remains visible without suggesting it was scheduled", async () => {
  mount("admin");
  await screen.findByRole("heading", { name: "Shared movie" });
  global.fetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: "release_changed", message: "A newer revision exists." }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve revision 3" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("A newer revision exists.");
  expect(screen.queryByText(/Scheduled once/)).not.toBeInTheDocument();
});
test("revising copy sends the expected version and clearly resets approval", async () => {
  mount("editor");
  await screen.findByRole("heading", { name: "Shared movie" });
  fireEvent.click(screen.getByRole("button", { name: "Revise release" }));
  fireEvent.change(screen.getByLabelText("telegram message"), {
    target: { value: "Revised caption" },
  });
  expect(screen.getByText("Saving a revision clears the previous approval.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save revision for review" }));
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/releases\/a+$/),
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"message":"Revised caption"'),
      })
    )
  );
});
