import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import TeamPanel from "../UserDashboardTabs/TeamPanel";

const workspacePayload = {
  ok: true,
  workspace: {
    id: "workspace-1",
    name: "Launch Team",
    planName: "Studio",
    usedSeats: 2,
    seatLimit: 3,
    remainingSeats: 1,
  },
  membership: { uid: "test-user", role: "owner", status: "active" },
  permissions: { canManageMembers: true, canManageBilling: true, canEdit: true },
  members: [
    { uid: "test-user", email: "owner@example.com", role: "owner", status: "active" },
    { uid: "editor-1", email: "editor@example.com", role: "editor", status: "active" },
  ],
  pendingInvites: [],
};

describe("TeamPanel", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => workspacePayload,
    });
  });

  test("shows workspace seats, members, and management controls", async () => {
    render(<TeamPanel onWorkspaceChanged={() => {}} onNavigate={() => {}} />);

    expect(await screen.findByText("Launch Team")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("editor@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Invitation" })).toBeEnabled();
    expect(window.localStorage.getItem("autopromote.activeWorkspaceId")).toBe("workspace-1");
  });

  test("accepts an invitation from the signed-in landing URL", async () => {
    window.history.replaceState(
      {},
      "",
      "/?workspace=workspace-1&invite=invite-1&token=secret-token"
    );
    const onWorkspaceChanged = jest.fn();

    render(<TeamPanel onWorkspaceChanged={onWorkspaceChanged} onNavigate={() => {}} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch.mock.calls[0][0]).toContain(
      "/api/workspaces/workspace-1/invite/invite-1/accept"
    );
    expect(global.fetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "secret-token" }) })
    );
    await waitFor(() => expect(onWorkspaceChanged).toHaveBeenCalled());
    expect(window.location.search).toBe("");
  });
});
