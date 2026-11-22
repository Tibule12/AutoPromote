import React from "react";
import { render, screen } from "@testing-library/react";
import PublisherReleaseWorkspace from "../PublisherReleaseWorkspace";
import { preparePlatformOptions } from "../../utils/publisherWorkflow";

jest.mock("../../../../components/PlatformIcon", () => () => null);

test.each([
  [{}, "No disclosure labels selected"],
  [{ commercialContent: true, yourBrand: true }, "Promotional content"],
  [{ aiGenerated: true }, "AI-generated content"],
  [
    { commercialContent: true, yourBrand: true, brandedContent: true, aiGenerated: true },
    "Paid partnership · AI-generated content",
  ],
])("final review displays the same label choices that are submitted: %j", (data, labels) => {
  render(
    <PublisherReleaseWorkspace
      step={4}
      title="Real footage"
      description="My post"
      assets={[]}
      selected={["tiktok"]}
      focus="tiktok"
      issues={{}}
      visited={{}}
      connections={{}}
      reviewOptions={{ tiktok: preparePlatformOptions("tiktok", data) }}
      getData={() => data}
      nextReason={() => ""}
      delivery={{}}
      mode="now"
    />
  );
  expect(screen.getByText(new RegExp(labels.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeVisible();
  expect(screen.getByText(/TikTok may also apply labels automatically/)).toBeVisible();
});
