import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TikTokForm from "../PlatformForms/TikTokForm";
import { preparePlatformOptions } from "../../features/publishing/utils/publisherWorkflow";

jest.mock("../EmojiPicker", () => () => null);
jest.mock("../FilterEffects", () => () => null);

test("ordinary footage requests no labels and shows that choice with advanced controls closed", () => {
  const onChange = jest.fn();
  render(<TikTokForm onChange={onChange} publisherRelease />);
  expect(screen.getByRole("status", { name: "TikTok disclosure labels" })).toBeVisible();
  expect(screen.getByRole("status", { name: "TikTok disclosure labels" })).toHaveTextContent(
    "No disclosure labels selected"
  );
  const data = onChange.mock.calls.at(-1)[0];
  expect(preparePlatformOptions("tiktok", data)).toMatchObject({
    is_aigc: false,
    brand_organic_toggle: false,
    brand_content_toggle: false,
  });
});

test("commercial and AI choices remain independent and turning commercial off clears its labels", async () => {
  const onChange = jest.fn();
  render(<TikTokForm onChange={onChange} publisherRelease />);
  await userEvent.click(screen.getByText("Advanced TikTok disclosures and consent"));
  await userEvent.click(screen.getByLabelText(/This content is commercial or promotional/));
  await userEvent.click(screen.getByLabelText("Your Brand"));
  expect(screen.getByRole("status", { name: "TikTok disclosure labels" })).toHaveTextContent(
    "Promotional content"
  );
  expect(screen.getByRole("status", { name: "TikTok disclosure labels" })).not.toHaveTextContent(
    "AI-generated content"
  );
  await userEvent.click(screen.getByLabelText("This content is AI-generated"));
  expect(preparePlatformOptions("tiktok", onChange.mock.calls.at(-1)[0])).toMatchObject({
    is_aigc: true,
    brand_organic_toggle: true,
  });
  await userEvent.click(screen.getByLabelText(/This content is commercial or promotional/));
  expect(preparePlatformOptions("tiktok", onChange.mock.calls.at(-1)[0])).toMatchObject({
    is_aigc: true,
    brand_organic_toggle: false,
    brand_content_toggle: false,
  });
  await userEvent.click(screen.getByLabelText("This content is AI-generated"));
  expect(screen.getByRole("status", { name: "TikTok disclosure labels" })).toHaveTextContent(
    "No disclosure labels selected"
  );
});

test("reopening an off commercial draft does not restore stale brand selections", () => {
  const onChange = jest.fn();
  render(
    <TikTokForm
      onChange={onChange}
      initialData={{
        commercialContent: false,
        yourBrand: true,
        brandedContent: true,
        aiGenerated: false,
      }}
      publisherRelease
    />
  );
  expect(preparePlatformOptions("tiktok", onChange.mock.calls.at(-1)[0])).toMatchObject({
    commercialContent: false,
    yourBrand: false,
    brandedContent: false,
    is_aigc: false,
  });
});

test("legacy drafts retain explicitly selected AI and brand disclosures", () => {
  const onChange = jest.fn();
  render(
    <TikTokForm
      onChange={onChange}
      initialData={{ is_aigc: true, brand_organic_toggle: true }}
      publisherRelease
    />
  );
  expect(preparePlatformOptions("tiktok", onChange.mock.calls.at(-1)[0])).toMatchObject({
    commercialContent: true,
    yourBrand: true,
    is_aigc: true,
  });
  expect(screen.getByRole("status", { name: "TikTok disclosure labels" })).toHaveTextContent(
    "Promotional content · AI-generated content"
  );
});
