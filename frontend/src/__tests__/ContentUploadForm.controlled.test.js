import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContentUploadForm from '../ContentUploadForm';

describe('ContentUploadForm controlled mode', () => {
  test('toggles platform selection via external setter', () => {
    const setSelectedPlatforms = jest.fn();
    render(<ContentUploadForm onUpload={async ()=>{}} selectedPlatforms={['youtube']} setSelectedPlatforms={setSelectedPlatforms} />);
    const youtubeTile = screen.getByLabelText(/YouTube/i);
    expect(youtubeTile).toBeInTheDocument();
    // Toggle off via keyboard
    fireEvent.keyDown(youtubeTile, { key: ' ', code: 'Space', charCode: 32 });
    expect(setSelectedPlatforms).toHaveBeenCalled();
  });

  test('calls setPlatformOption when platform option changes', () => {
    const setPlatformOption = jest.fn();
    render(<ContentUploadForm onUpload={async ()=>{}} selectedPlatforms={['discord']} setPlatformOption={setPlatformOption} />);
    const discordInput = screen.getByPlaceholderText(/Discord channel ID/i);
    fireEvent.change(discordInput, { target: { value: '12345' } });
    expect(setPlatformOption).toHaveBeenCalledWith('discord', 'channelId', '12345');
  });

  test('show dragging visual on drop-zone drag events', () => {
    const { container } = render(<ContentUploadForm onUpload={async ()=>{}} />);
    const drop = container.querySelector('.drop-zone');
    expect(drop).toBeInTheDocument();
    fireEvent.dragEnter(drop);
    expect(drop.classList.contains('dragging')).toBeTruthy();
    fireEvent.dragLeave(drop);
    expect(drop.classList.contains('dragging')).toBeFalsy();
  });
});

export {};
