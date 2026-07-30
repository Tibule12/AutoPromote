import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import LogoutConfirmDialog from "../LogoutConfirmDialog";

describe("LogoutConfirmDialog", () => {
  test("keeps the session active when the user cancels", () => {
    const onCancel = jest.fn();

    render(
      <LogoutConfirmDialog
        user={{ name: "Creator", email: "creator@example.com" }}
        onCancel={onCancel}
        onConfirm={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /stay signed in/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("only requests sign out after explicit confirmation", () => {
    const onConfirm = jest.fn();

    render(
      <LogoutConfirmDialog
        user={{ name: "Creator", email: "creator@example.com" }}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /sign out safely/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
