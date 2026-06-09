import Footer from "./components/Footer";
import TopNav from "./components/landing/TopNav";
import HeroScreenshot from "./components/landing/HeroScreenshot";
import SectionHeading from "./components/landing/SectionHeading";
import FeatureGrid from "./components/landing/FeatureGrid";
import WorkflowSection from "./components/landing/WorkflowSection";
import ProofSection from "./components/landing/ProofSection";
import PricingSection from "./components/landing/PricingSection";
import FinalCta from "./components/landing/FinalCta";
import {
  exampleContent,
  featureCards,
  pricingCards,
  testimonials,
  usageStats,
  workflowSteps,
} from "./data/landingPageData";
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
    subtitle: "Reporting and posting depth vary by connected account permissions and platform APIs.",
  },
];

const WelcomePage = ({ onGetStarted, onSignIn }) => {
  const handleWatchDemo = () => {
    window.open("/demo-teaser.mp4", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="ap-landing-page">
      <div className="ap-bg-glow ap-bg-glow-1" />
      <div className="ap-bg-glow ap-bg-glow-2" />
      <div className="ap-shell">
        <TopNav onSignIn={onSignIn} />

        <section className="ap-hero" id="top">
          <div className="ap-hero-copy">
            <p className="ap-eyebrow">Creator Operating System</p>
            <h1>
              Create Once.
              <br />
              Edit Smarter.
              <br />
              Publish Everywhere.
            </h1>
            <p className="ap-hero-subtext">
              AutoPromote helps creators turn long-form content into viral clips, publish across
              platforms, and grow faster with AI.
            </p>
            <div className="ap-hero-ctas">
              <button className="ap-btn ap-btn-primary" onClick={onGetStarted}>
                Start Free
              </button>
              <button className="ap-btn ap-btn-outline" onClick={handleWatchDemo}>
                Watch Demo
              </button>
            </div>
          </div>
          <HeroScreenshot />
        </section>

        <section className="ap-section" id="features">
          <SectionHeading
            eyebrow="Product capabilities"
            title="Designed for modern creator teams"
            copy="Visual, practical tools that replace scattered workflows."
          />
          <FeatureGrid items={featureCards} />
        </section>

        <section className="ap-section" id="availability">
          <SectionHeading
            eyebrow="Availability Snapshot"
            title="What Works Today"
            copy="A conservative view of the product today so teams can plan around live functionality instead of aspirational copy."
          />
          <FeatureGrid items={availabilityCards} />
        </section>

        <section className="ap-section" id="workflow">
          <SectionHeading
            eyebrow="Workflow loop"
            title="From upload to growth insights"
            copy="A single pass keeps every step connected."
          />
          <WorkflowSection steps={workflowSteps} />
        </section>

        <ProofSection
          testimonials={testimonials}
          usageStats={usageStats}
          exampleContent={exampleContent}
        />

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
