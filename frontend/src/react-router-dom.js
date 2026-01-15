import React from "react";

export const MemoryRouter = ({ children }) => React.createElement("div", null, children);
export const Link = ({ to, children, ...rest }) =>
  React.createElement("a", { href: to, ...rest }, children);
export const NavLink = ({ to, children, ...rest }) =>
  React.createElement("a", { href: to, ...rest }, children);

const routerExports = { MemoryRouter, Link, NavLink };
export default routerExports;
