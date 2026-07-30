import { useEffect, useState } from "react";
import TopNav from "./components/landing/TopNav";
import HeroScreenshot from "./components/landing/HeroScreenshot";
import SectionHeading from "./components/landing/SectionHeading";
import FeatureGrid from "./components/landing/FeatureGrid";
import WorkflowSection from "./components/landing/WorkflowSection";
import ProofSection from "./components/landing/ProofSection";
import PricingSection from "./components/landing/PricingSection";
import FinalCta from "./components/landing/FinalCta";
import Footer from "./components/Footer";
import {
  exampleContent,
  featureCards,
  pricingCards,
  proofChecklist,
  workflowSteps,
} from "./data/landingPageData";
import { WORKSPACE_ENDPOINTS } from "./config/workspaceApi";
import "./WelcomePage.css";

const availabilityCards = [
  {
    title: "Publishing queue and scheduling",
    subtitle: "Upload, queue, and schedule content across connected platforms.",
  },
  {
    title: "Editing and clip preparation",
    subtitle: "Trim, caption, and format media inside the product before you publish.",
  },
  {
    title: "Analytics and account depth",
    subtitle:
      "Reporting and posting depth vary by connected account permissions and platform APIs.",
  },
];

const commandStages = [
  {
    index: "01",
    label: "Create",
    title: "Direct the source",
    copy: "Combine cameras, shape ideas, or start from a finished recording.",
  },
  {
    index: "02",
    label: "Repurpose",
    title: "Find the moments",
    copy: "Turn long-form content into focused clips and promo-ready outputs.",
  },
  {
    index: "03",
    label: "Distribute",
    title: "Publish with control",
    copy: "Customize destinations, schedule the queue, and review performance.",
  },
];

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
  const handleWatchDemo = () => {
    document.getElementById("demo-player")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
              <span>Creator workspace</span>
              <small>One connected production loop</small>
            </div>
            <h1>
              Your content moves.
              <br />
              Your workflow should
              <span> move with it.</span>
            </h1>
            <p className="ap-hero-subtext">
              Direct multi-camera recordings, surface strong moments, build promo cuts, and publish
              across supported channels without stitching together five different tools.
            </p>
            <div className="ap-hero-ctas">
              <button className="ap-btn ap-btn-primary" onClick={onGetStarted}>
                Open your workspace
              </button>
              <button
                className="ap-btn ap-btn-outline"
                onClick={handleWatchDemo}
                aria-label="Watch Demo"
              >
                Watch the workflow
              </button>
            </div>
            <div className="ap-hero-proof" aria-label="Core AutoPromote workflows">
              <span>Multi-camera direction</span>
              <span>Viral moment discovery</span>
              <span>Connected publishing</span>
            </div>
          </div>
          <HeroScreenshot />
        </section>

        <section className="ap-command-ribbon" aria-label="AutoPromote workflow overview">
          <div className="ap-command-ribbon__intro">
            <span>One operating system</span>
            <strong>From source recording to published result.</strong>
          </div>
          <div className="ap-command-ribbon__stages">
            {commandStages.map(stage => (
              <article key={stage.index}>
                <span>{stage.index}</span>
                <div>
                  <small>{stage.label}</small>
                  <strong>{stage.title}</strong>
                  <p>{stage.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ap-section" id="features">
          <SectionHeading
            eyebrow="Inside the workspace"
            title="Five focused tools. One visual system."
            copy="Every feature has a clear job, but the source media and decisions stay connected."
          />
          <FeatureGrid items={featureCards} />
        </section>

        <section className="ap-section" id="availability">
          <SectionHeading
            eyebrow="Availability Snapshot"
            title="What Works Today"
            copy="A clear view of the live product, its connected publishing support, and where platform permissions still matter."
          />
          <FeatureGrid items={availabilityCards} />
        </section>

        <section className="ap-section" id="workflow">
          <SectionHeading
            eyebrow="Workflow loop"
            title="From upload to performance insights"
            copy="A single pass keeps every step connected."
          />
          <WorkflowSection steps={workflowSteps} />
        </section>

        <ProofSection proofChecklist={proofChecklist} exampleContent={exampleContent} />

        <section className="ap-section" id="pricing">
          <SectionHeading
            eyebrow="Pricing"
            title="Simple plans for every stage"
            copy="Start quickly and scale with your output."
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
