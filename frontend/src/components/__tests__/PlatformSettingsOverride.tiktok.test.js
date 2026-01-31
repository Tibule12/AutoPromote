import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformSettingsOverride from '../PlatformSettingsOverride';

describe('PlatformSettingsOverride TikTok role', () => {
  test('TikTok role buttons call setPlatformOption and show sponsor/boost fields', async () => {
    const setPlatformOption = jest.fn();
    render(
      <PlatformSettingsOverride
        selectedPlatforms={["tiktok"]}
        tiktokCommercial={{ isCommercial: false }}
        setTiktokCommercial={() => {}}
        tiktokConsentChecked={false}
        setTiktokConsentChecked={() => {}}
        setPlatformOption={setPlatformOption}
      />
    );

    // Click the Sponsored button
    const sponsoredBtn = screen.getByRole('button', { name: /Sponsored/i });
    await userEvent.click(sponsoredBtn);

    expect(setPlatformOption).toHaveBeenCalledWith('tiktok', 'role', 'sponsored');

    // Sponsored role should reveal sponsor input
    const sponsorInput = screen.getByPlaceholderText('Sponsor name');
    expect(sponsorInput).toBeInTheDocument();

    // Click Boosted button
    const boostedBtn = screen.getByRole('button', { name: /Boosted/i });
    await userEvent.click(boostedBtn);

    expect(setPlatformOption).toHaveBeenCalledWith('tiktok', 'role', 'boosted');

    const boostInput = screen.getByPlaceholderText('e.g., 25');
    expect(boostInput).toBeInTheDocument();
  });
});