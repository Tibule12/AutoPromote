import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginForm from "../LoginForm";
import RegisterForm from "../RegisterForm";
import EmailVerificationScreen from "../components/EmailVerificationScreen";

describe("email verification onboarding", () => {
  test("moves from the redesigned registration form to sign in", () => {
    const onLogin = jest.fn();

    render(
      <RegisterForm
        onRegister={() => {}}
        onResendVerification={() => {}}
        onLogin={onLogin}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("heading", { name: /Create your workspace/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Already have an account/i }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  test("keeps a new user on a clear verification screen and supports resend", async () => {
    const onRegister = jest.fn().mockResolvedValue({ verificationEmailSent: true });
    const onResendVerification = jest.fn().mockResolvedValue({ sent: true });

    render(
      <RegisterForm
        onRegister={onRegister}
        onResendVerification={onResendVerification}
        onLogin={() => {}}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Enter your full name"), {
      target: { value: "Mobile Tester" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "tester@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Create a password"), {
      target: { value: "secure-pass" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your password"), {
      target: { value: "secure-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create autopromote account/i }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByText(/tester@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/workspace stays locked/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /I verified|go to sign in/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/sign you in automatically/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    await waitFor(() => expect(onResendVerification).toHaveBeenCalledWith("tester@example.com"));
  });

  test("throttled resends display a cooldown and cannot be clicked repeatedly", async () => {
    const onResend = jest.fn().mockRejectedValue({ code: "auth/too-many-requests" });
    render(<EmailVerificationScreen email="owner@example.test" onResend={onResend} />);
    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    const waiting = await screen.findByRole("button", { name: /Resend available in 120s/i });
    expect(waiting).toBeDisabled();
    fireEvent.click(waiting);
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Firebase: Error/i)).not.toBeInTheDocument();
  });

  test("offers resend when login is blocked by an unverified email", async () => {
    const loginError = Object.assign(new Error("Verify your email"), {
      code: "auth/email-not-verified",
    });
    const onLogin = jest.fn().mockRejectedValue(loginError);
    const onResendVerification = jest.fn().mockResolvedValue({ sent: true });

    render(
      <LoginForm onLogin={onLogin} onResendVerification={onResendVerification} onClose={() => {}} />
    );

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "tester@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secure-pass" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /enter autopromote/i }));

    const resendButton = await screen.findByRole("button", {
      name: /resend verification email/i,
    });
    fireEvent.click(resendButton);
    await waitFor(() => expect(onResendVerification).toHaveBeenCalledWith("tester@example.com"));
  });
});
