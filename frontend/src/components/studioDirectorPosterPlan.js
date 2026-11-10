import { directorCompositionContext } from "./studioDirectorComposition";
const { buildKineticPoster } = require("./studioKineticPoster");
export function directorPosterContext(snapshot, brief, duration) {
  return { ...directorCompositionContext(snapshot, brief, duration), compositionVersion: 4 };
}
export function compileDirectorPoster(result, snapshot) {
  const context = directorPosterContext(snapshot, result.brief, result.duration);
  if (
    result.version !== 4 ||
    result.projectId !== context.projectId ||
    result.baseRevision !== context.baseRevision ||
    !/^[a-f0-9]{64}$/.test(result.fingerprint || "") ||
    result.provenance?.automaticModelPlanning !== true
  )
    throw Error("The project changed or the motion-design proposal is invalid.");
  if (
    result.sourceEvidence?.length !== context.media.length ||
    new Set(result.sourceEvidence.map(s => s.id)).size !== context.media.length ||
    result.sourceEvidence.some(
      s => !context.media.some(m => m.id === s.id && m.contentHash === s.contentHash)
    )
  )
    throw Error("The project media changed after planning.");
  const composition = buildKineticPoster(result.poster, result.duration);
  return {
    plan: {
      format: "autopromote-scene-actions",
      version: 1,
      projectId: context.projectId,
      baseRevision: context.baseRevision,
      name: result.poster.name,
      graphics: composition.graphics,
      actions: composition.actions,
    },
    concept:
      "Editable vector lettering, piece masks, stroke animation, echo shapes and a shared camera.",
    shots: composition.summary.phases.map((treatment, i) => ({
      startTime: ([0, 2.35, 4.55, 7.35][i] * result.duration) / 10,
      endTime: ([2.85, 4.95, 7.85, 10][i] * result.duration) / 10,
      sourceName: result.poster.words.join(" "),
      treatment,
      reason: "Authored motion-design operator; Director chooses copy, palette and energy.",
    })),
    nodeSummary: {
      nodes: composition.graphics.layers.length + 1,
      connections: composition.summary.connections,
      drivers: 0,
    },
    posterSummary: composition.summary,
  };
}
