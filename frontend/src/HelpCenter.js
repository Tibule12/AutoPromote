import React from "react";
import { Link } from "react-router";
import PublicPage, { PageCard } from "./components/public/PublicPage";

export default function HelpCenter() {
  return (
    <PublicPage
      eyebrow="HELP / FIND YOUR NEXT STEP"
      title="Where did the workflow get stuck?"
      intro="Start with the task you’re trying to complete. The right guide is usually more useful than another guess."
    >
      <div className="public-grid">
        <PageCard title="Start a project" to="/docs/getting-started">
          <p>Import owned footage, open the workspace and prepare the first version.</p>
        </PageCard>
        <PageCard title="Edit in Studio" to="/docs/studio">
          <p>Find layers, inspector controls, keyframes, sound and project backups.</p>
        </PageCard>
        <PageCard title="Connect and publish" to="/docs/publishing">
          <p>Review destination options, reconnect an account and follow the release state.</p>
        </PageCard>
        <PageCard title="Understand the numbers" to="/metrics">
          <p>Separate publication status from the performance data each platform returns.</p>
        </PageCard>
        <PageCard title="Plans and billing" to="/pricing" link="View current plans">
          <p>Check allowances, editing access and credits on the current plan cards.</p>
        </PageCard>
        <PageCard title="Contact support" to="/support" link="Open support">
          <p>
            Check your plan’s support access and tracked tickets, or use email for a general
            inquiry.
          </p>
        </PageCard>
      </div>
      <section className="public-faq" aria-label="Common questions">
        <details>
          <summary>Why is a submitted video still processing?</summary>
          <p>
            A platform can accept an upload before the published post is ready. Check the
            destination state in the queue before creating another submission.
          </p>
        </details>
        <details>
          <summary>Why are some analytics missing?</summary>
          <p>
            Platforms expose different metrics and update them at different times. Unavailable data
            is separate from an observed zero.
          </p>
        </details>
        <details>
          <summary>Can every destination have its own time and caption?</summary>
          <p>
            Use the destination settings in Publisher to prepare its available copy, media and
            scheduling options. Review the timezone before confirming.
          </p>
        </details>
        <details>
          <summary>What should I send with a support request?</summary>
          <p>
            Include the page, destination, approximate time, what you expected and what happened.
            Add a post or task reference if available. Keep passwords and access tokens private.
          </p>
        </details>
      </section>
      <div className="public-callout">
        Need a direct contact? <Link to="/contact">Tell us about the issue</Link> or email{" "}
        <a href="mailto:thulani@autopromote.org">thulani@autopromote.org</a>.
      </div>
    </PublicPage>
  );
}
