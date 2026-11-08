// Bundled for Node by build-studio-director-replay.js. This is the same pure
// command executor used by the browser; keep its import pointed at that source.
export { dryRunStudioCommandBatch } from "../frontend/src/components/studioCommands";
export { validateStudioReframeOperation } from "../frontend/src/components/studioReframeCommand";
export { validDirectorReframeEvidence } from "../frontend/src/components/studioDirectorWorkspaceProposals";
// Internal factory callers use the actual Studio adapters and renderer contract.
export { adaptStudioSnapshotToDocument, validateStudioProjectDocument, projectStudioEditableStateToSnapshot } from "../frontend/src/components/studioProjectDocument";
export { compileStudioTimelineForRender, assertStudioExportTimelineMatchesDocument, compileStudioFinishForRender, compileStudioCompositionForRender } from "../frontend/src/components/studioRenderCompiler";
export { compileStudioOverlaysForRender } from "../frontend/src/components/studioRenderCompiler";
export { buildViralRenderData } from "../frontend/src/components/viralRenderPayload";
export { mapCaptionSegmentsToTimeline } from "../frontend/src/components/viralRenderPayload";
export { createModelArtifactReference } from "../frontend/src/components/studioModelArtifactReference";
export { instantiateStudioCreativeTemplate, proposeStudioDirectorTemplate, PRODUCT_LAUNCH_TEMPLATE } from "../frontend/src/components/studioCreativeTemplate";
export { validateCinematicScene, buildCinematicGraph, planCinematicIntent } from "../frontend/src/components/threeD/cinematicContract";
