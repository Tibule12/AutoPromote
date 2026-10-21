import { lazy, Suspense, useEffect, useState } from "react";
import LandingNavbar from "./components/landing/LandingNavbar";
import HeroSection from "./components/landing/HeroSection";
import LandingFeatures from "./components/landing/LandingFeatures";
import LandingWorkflow from "./components/landing/LandingWorkflow";
import LandingCreators from "./components/landing/LandingCreators";
import LandingFooter, { LandingCTA } from "./components/landing/LandingFooter";
import LandingDemo from "./components/landing/LandingDemo";
import LandingProductShowcase from "./components/landing/LandingProductShowcase";
import { WORKSPACE_ENDPOINTS } from "./config/workspaceApi";
import "./components/landing/LandingPage.css";
import "./components/landing/LandingMotion.css";
import "./components/landing/LandingCompositing.css";
import "./components/landing/LandingEditorial.css";

const StudioWelcomePreview = lazy(() => import("./components/landing/StudioWelcomePage"));

function getWorkspaceInviteParams() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const workspaceId = params.get("workspace");
  const inviteId = params.get("invite");
  const token = params.get("token");
  return workspaceId && inviteId && token ? { workspaceId, inviteId, token } : null;
}

const WorkspaceInviteNotice = ({ onCreateAccount, onSignIn }) => {
  const [inviteState, setInviteState] = useState(() =>
    getWorkspaceInviteParams() ? { status: "loading" } : null
  );

  useEffect(() => {
    const invite = getWorkspaceInviteParams();
    if (!invite) return undefined;

    const controller = new AbortController();
    fetch(WORKSPACE_ENDPOINTS.PREVIEW_INVITE(invite.workspaceId, invite.inviteId, invite.token), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(body.error || "invite_preview_failed");
          error.code = body.error;
          throw error;
        }
        setInviteState({ status: "ready", ...body });
      })
      .catch(error => {
        if (error.name === "AbortError") return;
        setInviteState({
          status:
            error.code === "invite_expired" || error.code === "invite_not_pending"
              ? "unavailable"
              : "error",
        });
      });

    return () => controller.abort();
  }, []);

  if (!inviteState) return null;

  if (inviteState.status === "loading") {
    return (
      <section className="ap-invite-card" aria-live="polite">
        <p className="ap-eyebrow">Team invitation</p>
        <h2>Checking your AutoPromote invitation…</h2>
      </section>
    );
  }

  if (inviteState.status === "unavailable") {
    return (
      <section className="ap-invite-card ap-invite-card--warning" role="alert">
        <p className="ap-eyebrow">Team invitation</p>
        <h2>This invitation is no longer available.</h2>
        <p>
          It may have expired, already been accepted, or been cancelled. Ask the workspace owner to
          send you a new invitation.
        </p>
      </section>
    );
  }

  if (inviteState.status === "error") {
    return (
      <section className="ap-invite-card ap-invite-card--warning" role="alert">
        <p className="ap-eyebrow">Team invitation</p>
        <h2>We could not verify this invitation.</h2>
        <p>
          Check that you opened the complete link from the invitation email, or ask the workspace
          owner to send a new one.
        </p>
      </section>
    );
  }

  return (
    <section className="ap-invite-card" aria-labelledby="workspace-invite-title">
      <div className="ap-invite-card__copy">
        <p className="ap-eyebrow">Team invitation</p>
        <h2 id="workspace-invite-title">You’re invited to join {inviteState.workspaceName}</h2>
        <p>
          You’ll join as <strong>{inviteState.role}</strong>. Use the AutoPromote account for{" "}
          <strong>{inviteState.maskedEmail}</strong>; invitations only work with the email address
          that received them.
        </p>
        <ol className="ap-invite-steps">
          <li>Sign in if you already have an account, or create one with the invited email.</li>
          <li>Verify your email if prompted, then sign in.</li>
          <li>AutoPromote will accept the invitation and open the shared Team workspace.</li>
        </ol>
      </div>
      <div className="ap-invite-card__actions">
        <button className="lp-button lp-button-primary" onClick={onSignIn}>
          Sign In to Accept
        </button>
        <button className="lp-button lp-button-secondary" onClick={onCreateAccount}>
          Create Account to Join
        </button>
      </div>
    </section>
  );
};

const WelcomePage = ({ onGetStarted, onSignIn }) => {
  const [demoOpen, setDemoOpen] = useState(false);

  if (process.env.REACT_APP_WELCOME_STUDIO_PREVIEW === "true" && !getWorkspaceInviteParams()) {
    return <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0b0b10" }} />}><StudioWelcomePreview onGetStarted={onGetStarted} onSignIn={onSignIn} /></Suspense>;
  }
  return (
    <div className="lp-page lp-editorial">
      <a
        className="lp-skip-link"
        href="#landing-main"
        onClick={event => {
          event.preventDefault();
          document.getElementById("landing-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="lp-shell">
        <LandingNavbar onSignIn={onSignIn} onGetStarted={onGetStarted} />
        <WorkspaceInviteNotice onCreateAccount={onGetStarted} onSignIn={onSignIn} />
        <main id="landing-main" tabIndex={-1}>
          <HeroSection onGetStarted={onGetStarted} onWatchDemo={() => setDemoOpen(true)} />
          <div className="lp-output-strip" aria-label="Create for social video">
            <span>MAKE ROOM FOR YOUR NEXT RELEASE</span>
            <span>TikTok</span>
            <i />
            <span>YouTube Shorts</span>
            <i />
            <span>Instagram Reels</span>
          </div>
          <LandingProductShowcase onWatchDemo={() => setDemoOpen(true)} />
          <LandingFeatures />
          <LandingWorkflow />
          <LandingCreators />
          <LandingCTA onGetStarted={onGetStarted} />
        </main>
        <LandingFooter />
      </div>
      {demoOpen && <LandingDemo onClose={() => setDemoOpen(false)} />}
    </div>
  );
};

export default WelcomePage;
