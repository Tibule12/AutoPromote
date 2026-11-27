import React from "react";
import PublicPage from "./PublicPage";
import policies from "../../content/legalPolicies.json";

const formatDate = value =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

export default function LegalPolicyPage({ policy }) {
  const document = policies[policy];
  return (
    <PublicPage eyebrow={document.eyebrow} title={document.title} intro={document.intro}>
      <div className="public-prose" data-legal-content={policy}>
        <p>
          Effective date:{" "}
          <time dateTime={policies.effectiveDate}>{formatDate(policies.effectiveDate)}</time>
          {" · "}Last updated:{" "}
          <time dateTime={policies.updatedDate}>{formatDate(policies.updatedDate)}</time>
        </p>
        <div className="public-policy">
          {document.sections.map((section, index) => (
            <section key={section.id} aria-labelledby={`${policy}-${section.id}`}>
              <h2 id={`${policy}-${section.id}`}>
                {index + 1}. {section.title}
              </h2>
              {section.paragraphs?.map(paragraph => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.items && (
                <ul>
                  {section.items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.links && (
                <ul>
                  {section.links.map(link => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </PublicPage>
  );
}
