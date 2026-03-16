const docs = [
  {
    slug: "getting-started",
    title: "Getting Started",
    content: `# Getting Started

  Welcome to AutoPromote. This quickstart helps you connect platforms, publish deliberately, and learn from the resulting analytics.

## Steps

- Create an account
- Connect your platforms under Connections
- Upload content and choose platforms
- Schedule or post immediately

## Tips

Use the analytics panel to monitor performance and iterate.
Short-link and landing-page behavior may depend on deployment configuration, so treat those features as environment-specific unless your workspace has them enabled.
`,
  },
  {
    slug: "api-reference",
    title: "API Reference",
    content: `# API Reference

The platform exposes a small set of REST endpoints under /api. For example:

- POST /api/content/upload — create a new content upload
- GET /api/users/me — current user info

Contact support for API keys and expanded documentation.
`,
  },
];

export default docs;
