import { buildExportEditorHandoff } from "../MultiCamCombiner";
import { MULTICAM_MAX_SOURCES } from "../multicamUtils";

describe("Cam Combiner Studio handoff", () => {
  test("keeps the completed job ID so Studio can copy the temporary master", () => {
    expect(
      buildExportEditorHandoff({
        url: "https://media.example.com/temporary-master.mp4",
        file: { name: "camera-master.mp4" },
        renderJobId: "render-job-123",
        duration: 42,
      })
    ).toEqual(
      expect.objectContaining({
        renderJobId: "render-job-123",
        url: "https://media.example.com/temporary-master.mp4",
        name: "camera-master.mp4",
        duration: 42,
      })
    );
    expect(MULTICAM_MAX_SOURCES).toBe(3);
  });
});
