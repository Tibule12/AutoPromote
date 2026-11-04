import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConnectionsPanelRedesign from "../UserDashboardTabs/ConnectionsPanelRedesign";

jest.mock("../components/ExplainButton", () => () => null);

test("Login Kit identity is connected without claiming publishing access", () => {
  const manage = jest.fn();
  render(
    <ConnectionsPanelRedesign
      snapchatStatus={{
        connected: true,
        identityOnly: true,
        profile: { displayName: "Snap User" },
      }}
      handleManagePlatform={manage}
    />
  );
  expect(screen.getByText("Identity connected")).toBeInTheDocument();
  expect(
    screen.getByText("Account connected. Publishing permissions are required separately.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Connect Snapchat" })).not.toBeInTheDocument();
});

test("an unconnected Snapchat account keeps its normal Connect action", () => {
  const connect = jest.fn();
  render(
    <ConnectionsPanelRedesign
      snapchatStatus={{ connected: false }}
      handleConnectSnapchat={connect}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect Snapchat" }));
  expect(connect).toHaveBeenCalledTimes(1);
});
