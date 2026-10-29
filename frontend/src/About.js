import React from "react";
import { Link } from "react-router";
import PublicPage from "./components/public/PublicPage";
import "./components/public/CompanyPages.css";

export default function About() {
  return (
    <PublicPage
      pageType="about"
      eyebrow="ABOUT US"
      title="About AutoPromote"
      intro="An editing and publishing workspace for creators and small teams who want to spend more time making their work."
      next={false}
    >
      <section className="about-story" aria-labelledby="about-purpose">
        <h2 id="about-purpose">Good work deserves a thoughtful release.</h2>
        <div className="company-prose">
          <p>
            Making a video is only part of a creator’s day. There is also the caption to write, the
            account to switch, the release to schedule and the result to check. AutoPromote brings
            those steps into one workspace.
          </p>
          <p>
            Studio is where the edit takes shape. Publisher prepares a post for each connected
            destination. Queue keeps upcoming releases visible. The aim is to make the handoff
            between creating and publishing easier to manage.
          </p>
          <p>
            You keep the creative decisions: your footage, your edit, your words and when to
            publish. Available tools and platform connections depend on your plan and the
            permissions you choose to grant.
          </p>
        </div>
      </section>

      <section className="about-principles" aria-labelledby="about-principles">
        <div>
          <p className="public-eyebrow">WHAT MATTERS TO US</p>
          <h2 id="about-principles">Keep the creator in control.</h2>
        </div>
        <dl>
          <div>
            <dt>Work you can return to</dt>
            <dd>
              An editable project should stay useful beyond its first export. Save it, keep a backup
              and come back to the decisions behind the finished video.
            </dd>
          </div>
          <div>
            <dt>A release for each audience</dt>
            <dd>
              Different destinations need different copy, formats and timing. Preparing a release
              should make those choices visible.
            </dd>
          </div>
          <div>
            <dt>Clear expectations</dt>
            <dd>
              Tools can help you prepare and publish. Reach, audience growth and revenue depend on
              many things; AutoPromote does not guarantee them.
            </dd>
          </div>
        </dl>
      </section>

      <section className="company-connect" aria-labelledby="about-contact">
        <div>
          <h2 id="about-contact">Talk to the people building AutoPromote.</h2>
          <p>
            Have a question about the product or feedback from your own workflow? We’d like to hear
            it.
          </p>
        </div>
        <Link className="public-button" to="/contact">
          Contact AutoPromote <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </PublicPage>
  );
}
