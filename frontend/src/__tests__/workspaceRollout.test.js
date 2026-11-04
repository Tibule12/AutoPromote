import { getActiveWorkspaceId, isTeamCollaborationAvailable, withWorkspaceHeaders } from "../utils/workspace";

afterEach(() => {
  window.localStorage.clear();
  delete process.env.REACT_APP_TEAM_COLLABORATION_LOCAL;
  delete process.env.REACT_APP_LOCAL_EMULATORS;
  delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
});

test("a retained local workspace cannot activate Team in a normal production build", () => {
  window.localStorage.setItem("autopromote.activeWorkspaceId", "historical-team");
  expect(isTeamCollaborationAvailable()).toBe(false);
  expect(getActiveWorkspaceId()).toBe("");
  expect(withWorkspaceHeaders({ Authorization: "fixture" })).toEqual({ Authorization: "fixture" });
});

test("the explicit local demo retains workspace selection and authenticated scope", () => {
  Object.assign(process.env, {
    REACT_APP_TEAM_COLLABORATION_LOCAL: "true",
    REACT_APP_LOCAL_EMULATORS: "true",
    REACT_APP_FIREBASE_PROJECT_ID: "demo-autopromote-credits",
  });
  window.localStorage.setItem("autopromote.activeWorkspaceId", "demo-team");
  expect(getActiveWorkspaceId()).toBe("demo-team");
  expect(withWorkspaceHeaders()).toEqual({ "X-Workspace-Id": "demo-team" });
  process.env.REACT_APP_FIREBASE_PROJECT_ID = "autopromote-cc6d3";
  expect(getActiveWorkspaceId()).toBe("");
});
