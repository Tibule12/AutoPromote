const React = require("react");

function flattenChildren(children) {
  if (children == null) return "";
  if (Array.isArray(children)) {
    return children.map(flattenChildren).join("");
  }
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (React.isValidElement(children)) {
    return flattenChildren(children.props.children);
  }
  return "";
}

function ReactMarkdownMock({ children }) {
  return React.createElement(
    "div",
    { "data-testid": "react-markdown-mock" },
    flattenChildren(children)
  );
}

module.exports = ReactMarkdownMock;
module.exports.default = ReactMarkdownMock;