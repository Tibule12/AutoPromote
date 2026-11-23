import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import Terms from "../Terms";
import Privacy from "../Privacy";
import policies from "../content/legalPolicies.json";

const root = path.resolve(__dirname, "../../..");
const text = node => node.textContent.replace(/\s+/g, " ").trim();

test.each([
  ["terms", Terms],
  ["privacy", Privacy],
])(
  "%s public, API, legacy and in-app policies have identical current content",
  (key, Component) => {
    const { container } = render(<Component />);
    const content = container.querySelector("[data-legal-content]");
    const copy = [...content.querySelectorAll("h2, p, li")].map(text);
    const links = [...content.querySelectorAll("a")].map(link => [
      text(link),
      link.getAttribute("href"),
    ]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(policies[key].title);
    expect(text(content)).not.toMatch(/draft policy|December 10, 2025|November 15, 2025/);
    expect([...content.querySelectorAll("h2")].map(text)).toEqual(
      policies[key].sections.map((section, index) => `${index + 1}. ${section.title}`)
    );
    expect([...content.querySelectorAll("time")].map(node => node.dateTime)).toEqual([
      policies.effectiveDate,
      policies.updatedDate,
    ]);
    for (const file of [
      `frontend/public/${key}/index.html`,
      `frontend/public/legal/${key}.html`,
      `public/legal/${key}.html`,
      `docs/${key}/index.html`,
      `frontend/docs/${key}/index.html`,
    ]) {
      const html = new DOMParser().parseFromString(
        fs.readFileSync(path.join(root, file), "utf8"),
        "text/html"
      );
      const staticContent = html.querySelector("[data-legal-content]");
      expect([...staticContent.querySelectorAll("h2, p, li")].map(text)).toEqual(copy);
      expect(
        [...staticContent.querySelectorAll("a")].map(link => [
          text(link),
          link.getAttribute("href"),
        ])
      ).toEqual(links);
      expect(html.querySelector('link[rel="canonical"]').getAttribute("href")).toBe(
        `https://autopromote.org/${key}/`
      );
    }
  }
);

test("privacy provides working request and platform revocation links", () => {
  render(<Privacy />);
  expect(screen.getByRole("link", { name: "Revoke Google/YouTube access" })).toHaveAttribute(
    "href",
    "https://security.google.com/settings/security/permissions"
  );
  expect(screen.getByRole("link", { name: "Google Privacy Policy" })).toHaveAttribute(
    "href",
    "https://policies.google.com/privacy"
  );
  expect(screen.getAllByRole("link", { name: "Contact AutoPromote" })[0]).toHaveAttribute(
    "href",
    "mailto:thulani@autopromote.org"
  );
});
