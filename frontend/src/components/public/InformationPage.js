import React from "react";
import { Link } from "react-router";
import PublicPage, { PageCard } from "./PublicPage";
import { publicPages } from "../../publicPageContent";

export default function InformationPage({ page }) {
  const content = publicPages[page];
  return (
    <PublicPage eyebrow={content.eyebrow} title={content.title} intro={content.intro}>
      {content.note && <div className="public-callout">{content.note}</div>}
      <div className={`public-grid${content.twoColumns ? " public-grid-two" : ""}`}>
        {content.cards.map((card, index) => (
          <PageCard
            key={card.title}
            title={card.title}
            platform={card.platform}
            number={card.platform ? undefined : String(index + 1).padStart(2, "0")}
            to={card.to}
            link={card.link}
          >
            <p>{card.copy}</p>
            {card.email && (
              <a
                className="public-text-link"
                href={`mailto:thulani@autopromote.org?subject=${encodeURIComponent(card.email)}`}
              >
                {card.action || "Email AutoPromote"} <span aria-hidden="true">↗</span>
              </a>
            )}
            {card.external && (
              <a
                className="public-text-link"
                href={card.external.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {card.external.label} <span aria-hidden="true">↗</span>
              </a>
            )}
          </PageCard>
        ))}
      </div>
      {content.sections && (
        <div className="public-prose">
          {content.sections.map(section => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.copy}</p>
              {section.to && (
                <Link className="public-text-link" to={section.to}>
                  {section.link || "Learn more"} ↗
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
      {content.questions && (
        <section className="public-faq" aria-label="Common questions">
          {content.questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      )}
    </PublicPage>
  );
}
