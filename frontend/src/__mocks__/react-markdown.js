import React from "react";

// Minimal mock for react-markdown used in Jest tests.
// Renders children or text content simply so components importing
// react-markdown can render in tests without transpiling ESM packages.
export default function ReactMarkdown(props) {
  const { children, components, ...rest } = props || {};
  if (typeof children === "string") return <div>{children}</div>;
  return <div {...rest}>{children || null}</div>;
}
