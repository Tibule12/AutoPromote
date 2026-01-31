import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlatformSettingsOverride from "../PlatformSettingsOverride";

describe("PlatformSettingsOverride", () => {
  test("YouTube role buttons call setPlatformOption and show sponsored fields", async () => {
    const setPlatformOption = jest.fn();
    render(
      <PlatformSettingsOverride
        selectedPlatforms={["youtube"]}
        youtubeSettings={{ privacy: "public" }}
        setYoutubeSettings={() => {}}
        setPlatformOption={setPlatformOption}
      />
    );

    // Click the Sponsored button
    const sponsoredBtn = screen.getByRole("button", { name: /Sponsored/i });
    await userEvent.click(sponsoredBtn);

    expect(setPlatformOption).toHaveBeenCalledWith("youtube", "role", "sponsored");

    // Sponsored role should reveal sponsor input
    const sponsorInput = screen.getByPlaceholderText("Sponsor name");
    expect(sponsorInput).toBeInTheDocument();
  });

  test("Facebook role selector persists via setPlatformOption and shows boost input", async () => {
    const setPlatformOption = jest.fn();
    render(
      <PlatformSettingsOverride
        selectedPlatforms={["facebook"]}
        instagramSettings={{ shareToFeed: true }}
        setInstagramSettings={() => {}}
        setPlatformOption={setPlatformOption}
      />
    );

    const boostedBtn = screen.getByRole("button", { name: /Boosted/i });
    await userEvent.click(boostedBtn);

    expect(setPlatformOption).toHaveBeenCalledWith("facebook", "role", "boosted");

    // Boosted role should reveal boost budget input
    const boostInput = screen.getByPlaceholderText("e.g., 50");
    expect(boostInput).toBeInTheDocument();
  });
});
