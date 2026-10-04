import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StudioControlMenu from "../StudioControlMenu";

test("Escape dismisses only the open menu and restores its trigger focus", () => {
  const outside = jest.fn();
  const { container } = render(
    <div onKeyDown={outside}>
      <StudioControlMenu label="View options">
        <button>Fit full</button>
      </StudioControlMenu>
    </div>
  );
  const menu = container.querySelector("details");
  menu.open = true;
  screen.getByRole("button").focus();
  fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
  expect(menu.open).toBe(false);
  expect(container.querySelector("summary")).toHaveFocus();
  expect(outside).not.toHaveBeenCalled();
  // Once closed, Escape is available to the containing preview again.
  fireEvent.keyDown(container.querySelector("summary"), { key: "Escape" });
  expect(outside).toHaveBeenCalledTimes(1);
});

test("outside clicks and selected actions dismiss the menu", () => {
  const action = jest.fn();
  const { container } = render(
    <>
      <StudioControlMenu label="More actions">
        <button onClick={action}>Split</button>
      </StudioControlMenu>
      <button>Outside</button>
    </>
  );
  const menu = container.querySelector("details");
  menu.open = true;
  fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
  expect(menu.open).toBe(false);
  menu.open = true;
  fireEvent.click(screen.getByRole("button", { name: "Split" }));
  expect(action).toHaveBeenCalledTimes(1);
  expect(menu.open).toBe(false);
});
