import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadPanel from "../UserDashboardTabs/UploadPanel";

const mockUnifiedPublisher = jest.fn();

jest.mock("../features/publishing/UnifiedPublisher", () => props => {
  mockUnifiedPublisher(props);
  return (
    <div>
      <div>Unified Publisher Mock</div>
      <div data-testid="publisher-initial-file">
        {typeof props.initialFile === "string"
          ? props.initialFile
          : props.initialFile?.name || "none"}
      </div>
      <button type="button" onClick={() => props.onUpload?.({ id: "upload-123" })}>
        Trigger Upload
      </button>
    </div>
  );
});

describe("UploadPanel", () => {
  beforeEach(() => {
    mockUnifiedPublisher.mockClear();
  });

  test("renders the upload heading and unified publisher", () => {
    render(<UploadPanel />);

    expect(screen.getByRole("heading", { name: /Upload Content/i })).toBeInTheDocument();
    expect(screen.getByText("Unified Publisher Mock")).toBeInTheDocument();
  });

  test("forwards the initial file to UnifiedPublisher", () => {
    render(<UploadPanel initialFile={{ name: "launch-cut.mp4" }} />);

    expect(screen.getByTestId("publisher-initial-file")).toHaveTextContent("launch-cut.mp4");
    expect(mockUnifiedPublisher).toHaveBeenCalled();
    expect(mockUnifiedPublisher.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        initialFile: expect.objectContaining({ name: "launch-cut.mp4" }),
      })
    );
  });

  test("wraps UnifiedPublisher onUpload and clears the initial file after success", async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    const onClearInitialFile = jest.fn();

    render(<UploadPanel onUpload={onUpload} onClearInitialFile={onClearInitialFile} />);

    fireEvent.click(screen.getByRole("button", { name: /Trigger Upload/i }));

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith({ id: "upload-123" });
    });
    expect(onClearInitialFile).toHaveBeenCalledTimes(1);
  });
});
