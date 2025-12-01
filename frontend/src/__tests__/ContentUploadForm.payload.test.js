import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContentUploadForm from '../ContentUploadForm';

describe('ContentUploadForm payloads', () => {
  test('Preview payload contains platforms and platform_options', async () => {
    const onUpload = jest.fn(async (payload) => ({ previews: [{ platform: 'youtube', title: payload.title }] }));
    render(<ContentUploadForm onUpload={onUpload} />);

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Test Title' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Test Description' } });

    // Add a dummy file to allow preview
    const file = new File(['dummy'], 'test.mp4', { type: 'video/mp4' });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Select platforms: Discord and YouTube
    const discordToggle = screen.getByLabelText(/Discord/i);
    fireEvent.click(discordToggle);
    const youtubeToggle = screen.getByLabelText(/YouTube/i);
    fireEvent.click(youtubeToggle);

    // Set Discord channel id (platform option)
    const discordChannel = screen.getByPlaceholderText(/Discord channel ID/i);
    fireEvent.change(discordChannel, { target: { value: '12345' } });

    // Click preview button
    const previewBtn = screen.getByText(/Preview Content/i);
    fireEvent.click(previewBtn);

    // Wait for onUpload to be called
    expect(onUpload).toHaveBeenCalled();
    const payload = onUpload.mock.calls[0][0];
    expect(Array.isArray(payload.platforms)).toBeTruthy();
    expect(payload.platforms).toContain('discord');
    expect(payload.platforms).toContain('youtube');
    expect(payload.platform_options).toBeDefined();
    expect(payload.platform_options.discord.channelId).toBe('12345');
  });

  test('Submit payload includes platforms and platform_options', async () => {
    const onUpload = jest.fn(async () => ({}));
    render(<ContentUploadForm onUpload={onUpload} />);

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Upload Title' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Desc' } });
    const file = new File(['dummy'], 'test.mp4', { type: 'video/mp4' });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText(/YouTube/i));

    // Submit the form
    const uploadBtn = screen.getByText(/Upload Content/i);
    fireEvent.click(uploadBtn);

    expect(onUpload).toHaveBeenCalled();
    const payload = onUpload.mock.calls[0][0];
    expect(Array.isArray(payload.platforms)).toBeTruthy();
    expect(payload.platforms).toContain('youtube');
  });
});

export {};
