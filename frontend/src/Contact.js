import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import PublicPage from "./components/public/PublicPage";
import "./components/public/CompanyPages.css";

const EMAIL = "thulani@autopromote.org";
const TOPICS = [
  "Product or account help",
  "Billing question",
  "Privacy request",
  "Report a security issue",
  "Partnership or other question",
];

export default function Contact() {
  const [interactive, setInteractive] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(null);
  useEffect(() => setInteractive(true), []);

  function prepareEmail(event) {
    event.preventDefault();
    setDraft({
      subject: `AutoPromote — ${topic}: ${subject.trim()}`,
      message: message.trim(),
    });
  }
  function update(setter, value) {
    setter(value);
    setDraft(null);
  }

  return (
    <PublicPage
      pageType="contact"
      eyebrow="CONTACT US"
      title="Contact AutoPromote"
      intro="Questions about your account, a publishing problem or an idea to share? Here’s how to reach us."
      next={false}
    >
      <div className="contact-layout">
        <section className="contact-details" aria-labelledby="contact-email">
          <p className="public-eyebrow">EMAIL US DIRECTLY</p>
          <h2 id="contact-email">Let’s talk.</h2>
          <a className="contact-email" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <p>
            Product, account, billing, privacy and partnership questions all reach us at this
            address.
          </p>
          <div className="contact-checklist">
            <h3>For a problem with the app</h3>
            <ul>
              <li>Tell us which page or tool you were using.</li>
              <li>Describe what you expected and what happened.</li>
              <li>Include the approximate time and a post or job reference, if you have one.</li>
            </ul>
          </div>
          <p className="contact-private">
            Please keep passwords, access tokens and payment card details out of your message.
          </p>
          <nav className="contact-help" aria-label="Contact resources">
            <Link to="/help">
              Browse the Help Center <span aria-hidden="true">↗</span>
            </Link>
            <Link to="/support">
              Existing account support <span aria-hidden="true">↗</span>
            </Link>
            <Link to="/privacy">
              Privacy policy <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </section>

        <section
          className="contact-compose"
          aria-labelledby="contact-compose"
          hidden={!interactive}
        >
          <h2 id="contact-compose">Prepare your message</h2>
          <p>This opens a draft in your own email app. You review and send it there.</p>
          <form onSubmit={prepareEmail}>
            <label htmlFor="contact-topic">What is this about?</label>
            <select
              id="contact-topic"
              value={topic}
              onChange={event => update(setTopic, event.target.value)}
            >
              {TOPICS.map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <label htmlFor="contact-subject">Subject</label>
            <input
              id="contact-subject"
              value={subject}
              onChange={event => update(setSubject, event.target.value)}
              required
              maxLength={120}
            />
            <label htmlFor="contact-message">Message</label>
            <textarea
              id="contact-message"
              value={message}
              onChange={event => update(setMessage, event.target.value)}
              required
              maxLength={2000}
              rows={6}
            />
            <button className="public-button" type="submit">
              Prepare email <span aria-hidden="true">↗</span>
            </button>
          </form>
          {draft && (
            <div className="contact-draft" role="status">
              <p>Your draft is ready. No message has been sent.</p>
              <a
                className="public-button"
                href={`mailto:${EMAIL}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.message)}`}
              >
                Open email app <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
          <p className="contact-email-help">
            No email app configured? Copy the address above and write to us from your usual email
            service.
          </p>
        </section>
      </div>
    </PublicPage>
  );
}
