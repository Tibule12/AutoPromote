import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminUserList from "../AdminUserList";

jest.mock("firebase/auth", () => ({
  signInWithCustomToken: jest.fn(),
}));

const jsonResponse = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  headers: { get: () => "application/json" },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("AdminUserList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    jest.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    window.confirm.mockRestore();
    window.alert.mockRestore();
  });

  test("grants Founding Tester access from the visible user table", async () => {
    const starterUser = {
      id: "user-bongani",
      name: "Bongani Manganye",
      email: "bongani@example.com",
      role: "user",
      status: "Active",
    };
    const testerUser = {
      ...starterUser,
      testerAccess: {
        programId: "founding_testers_2026",
        status: "active",
        expiresAt: "2099-08-19T00:00:00.000Z",
      },
    };

    global.fetch
      .mockResolvedValueOnce(jsonResponse({ success: true, users: [starterUser] }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          alreadyGranted: false,
          emailSent: true,
          claimedSeats: 1,
          maxSeats: 10,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, users: [testerUser] }));

    render(<AdminUserList />);

    const grantButton = await screen.findByRole("button", { name: /Grant Tester/i });
    fireEvent.click(grantButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/users/user-bongani/tester-access"),
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Seats: 1/10"));
    expect(await screen.findByText("Founding Tester")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend email/i })).toBeEnabled();
  });

  test("resends an active tester email without granting another seat", async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          users: [
            {
              id: "active-tester",
              name: "Bongani",
              email: "bongani@example.com",
              role: "user",
              testerAccess: {
                programId: "founding_testers_2026",
                status: "active",
                expiresAt: "2099-08-19T00:00:00.000Z",
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, emailSent: true, provider: "zeptomail" })
      );

    render(<AdminUserList />);
    fireEvent.click(await screen.findByRole("button", { name: /Resend email/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/active-tester/tester-access/resend-email"),
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("through ZeptoMail"));
  });

  test("searches the simplified user list", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        users: [
          { id: "one", name: "Bongani", email: "bongani@example.com", role: "user" },
          { id: "two", name: "Joyce", email: "joyce@example.com", role: "user" },
        ],
      })
    );

    render(<AdminUserList />);
    expect(await screen.findByText("Bongani")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search users" }), {
      target: { value: "joyce" },
    });

    expect(screen.queryByText("Bongani")).not.toBeInTheDocument();
    expect(screen.getByText("Joyce")).toBeInTheDocument();
  });
});
