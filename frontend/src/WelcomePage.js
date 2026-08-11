import { useEffect, useState } from "react";
import TopNav from "./components/landing/TopNav";
import FeatureShowcase from "./components/landing/FeatureShowcase";
import SectionHeading from "./components/landing/SectionHeading";
import PricingSection from "./components/landing/PricingSection";
import FinalCta from "./components/landing/FinalCta";
import Footer from "./components/Footer";
import { pricingCards } from "./data/landingPageData";
import { WORKSPACE_ENDPOINTS } from "./config/workspaceApi";
import "./WelcomePage.css";

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
        <button className="ap-btn ap-btn-primary" onClick={onSignIn}>
          Sign In to Accept
        </button>
        <button className="ap-btn ap-btn-outline" onClick={onCreateAccount}>
          Create Account to Join
        </button>
      </div>
    </section>
  );
};

const WelcomePage = ({ onGetStarted, onSignIn }) => {
  const handleExploreScreens = () => {
    document
      .getElementById("product-tour")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="ap-landing-page">
      <div className="ap-bg-glow ap-bg-glow-1" />
      <div className="ap-bg-glow ap-bg-glow-2" />
      <div className="ap-shell">
        <TopNav onSignIn={onSignIn} />

        <WorkspaceInviteNotice onCreateAccount={onGetStarted} onSignIn={onSignIn} />

        <section className="ap-hero" id="top">
          <div className="ap-hero-copy">
            <div className="ap-hero-status">
              <span className="ap-hero-status__dot" aria-hidden="true" />
              <span>Real product preview</span>
              <small>11 redesigned pages</small>
            </div>
            <h1>
              See AutoPromote
              <span> before you sign up.</span>
            </h1>
            <p className="ap-hero-subtext">
              Real screens. Short explanations. One connected creator workspace.
            </p>
            <div className="ap-hero-ctas">
              <button className="ap-btn ap-btn-primary" onClick={onGetStarted}>
                Create free account
              </button>
              <button
                className="ap-btn ap-btn-outline"
                onClick={handleExploreScreens}
                aria-label="Explore product screens"
              >
                Explore the screens
              </button>
            </div>
          </div>
          <FeatureShowcase />
        </section>

        <section className="ap-section" id="pricing">
          <SectionHeading
            eyebrow="Pricing"
            title="Choose the workspace that fits."
            copy="Start free. Upgrade when your output grows."
          />
          <PricingSection cards={pricingCards} onGetStarted={onGetStarted} />
        </section>

        <FinalCta onGetStarted={onGetStarted} />

        <Footer />
      </div>
    </div>
  );
};

export default WelcomePage;
