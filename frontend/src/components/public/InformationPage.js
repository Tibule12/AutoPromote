import React from "react";
import { Link } from "react-router";
import PublicPage, { PageCard } from "./PublicPage";
import { publicPages } from "../../publicPageContent";

function CardCopy({ card }) {
  return (
    <>
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
    </>
  );
}

export default function InformationPage({ page }) {
  const content = publicPages[page];
  return (
    <PublicPage
      eyebrow={content.eyebrow}
      title={content.title}
      intro={content.intro}
      pageType={page}
    >
      {content.note && <div className="public-callout">{content.note}</div>}
      {content.table && (
        <section className="public-reference" aria-labelledby={`${page}-reference`}>
          <h2 id={`${page}-reference`}>{content.table.title}</h2>
          <p className="public-table-hint">
            Scroll sideways to read all columns on a small screen.
          </p>
          <div
            className="public-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={content.table.title}
          >
            <table>
              <thead>
                <tr>
                  {content.table.headings.map(heading => (
                    <th key={heading} scope="col">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.table.rows.map(([label, ...cells]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {cells.map(cell => (
                      <td key={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {content.layout === "prose" || content.layout === "brief" ? (
        <div className={content.layout === "brief" ? "public-brief" : "public-prose"}>
          {content.cards.map((card, index) => (
            <section key={card.title}>
              {content.layout === "brief" && (
                <span className="public-brief-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
              )}
              <div>
                <h2>{card.title}</h2>
                <CardCopy card={card} />
                {card.to && (
                  <Link className="public-text-link" to={card.to}>
                    {card.link || "Read the guide"} <span aria-hidden="true">↗</span>
                  </Link>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
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
              <CardCopy card={card} />
            </PageCard>
          ))}
        </div>
      )}
      {content.contact && (
        <section className="public-contact-action">
          <h2>{content.contact.title}</h2>
          <p>{content.contact.copy}</p>
          <a
            className="public-button"
            href={`mailto:thulani@autopromote.org?subject=${encodeURIComponent(content.contact.subject)}`}
          >
            {content.contact.label} <span aria-hidden="true">↗</span>
          </a>
        </section>
      )}
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
