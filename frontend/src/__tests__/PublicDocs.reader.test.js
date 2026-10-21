import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Docs, { documentFile, documentationLink, guideAnchorPlugin } from "../Docs";

let pathname = "/docs/studio";
beforeEach(() => {
  require("react-router").useLocation = () => ({ pathname });
});
afterEach(() => jest.restoreAllMocks());

test("reads the reviewed public guide and offers a working retry after failure", async () => {
  const fetcher = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({
      ok: true,
      text: async () => "# Studio\n\nThe current reviewed Studio guide.",
    });
  render(<Docs />);
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("The current reviewed Studio guide.")).toBeInTheDocument();
  expect(fetcher).toHaveBeenLastCalledWith(
    expect.stringContaining("/api/product-assistance/docs/studio/index.md"),
    expect.objectContaining({ headers: { Accept: "text/plain" } })
  );
});

test("a late guide response cannot replace the next route's document", async () => {
  let finishOld;
  jest
    .spyOn(global, "fetch")
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishOld = resolve;
        })
    )
    .mockResolvedValueOnce({ ok: true, text: async () => "# Audio\n\nThe current sound guide." });
  pathname = "/docs/studio";
  const view = render(<Docs />);
  pathname = "/docs/audio";
  view.rerender(<Docs />);
  expect(await screen.findByText("The current sound guide.")).toBeInTheDocument();
  finishOld({ ok: true, text: async () => "# Stale studio\n\nThis old response must be ignored." });
  await waitFor(() =>
    expect(screen.queryByText(/old response must be ignored/)).not.toBeInTheDocument()
  );
});

test("relative guide links stay in the reader while unsafe paths and protocols are rejected", () => {
  expect(documentFile("studio")).toBe("studio/index.md");
  expect(documentFile("../../private")).toBeNull();
  expect(documentationLink("../audio/index.md", "studio/index.md")).toEqual({
    to: "/docs/audio/index",
  });
  expect(documentationLink("javascript:alert(1)", "studio/index.md")).toBeNull();
});

test("only complete empty generated anchors become document targets", () => {
  const tree = {
    type: "root",
    children: [
      { type: "raw", value: '<a id="studio-transform-x">' },
      { type: "raw", value: "</a>" },
      { type: "raw", value: '<a id="unsafe" onclick="alert(1)">' },
      { type: "raw", value: "</a>" },
    ],
  };
  guideAnchorPlugin()(tree);
  expect(tree.children[0]).toMatchObject({
    type: "element",
    tagName: "span",
    properties: { id: "studio-transform-x" },
    children: [],
  });
  expect(tree.children[1]).toMatchObject({ type: "text", value: "" });
  expect(tree.children[2].type).toBe("raw");
});
