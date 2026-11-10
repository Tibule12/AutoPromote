import {
  directorCompositionContext,
  compileDirectorComposition,
} from "./studioDirectorComposition";
const { materializeDirectorNodePlan } = require("./studioDirectorNodeContract");
export function directorNodeContext(snapshot, brief, duration) {
  return { ...directorCompositionContext(snapshot, brief, duration), compositionVersion: 3 };
}
export function compileDirectorNodePlan(result, snapshot) {
  const context = directorNodeContext(snapshot, result.brief, result.duration),
    composition = materializeDirectorNodePlan(result.nodePlan, context);
  const edges = composition.layers.map(l => ({
    id: l.id,
    parent: l.parentId,
    matte: l.matteId,
    mode: l.matteMode,
  }));
  // Let the normal node-wiring operation author edges, after all ordinary
  // picture nodes and keys exist. Avoid a parallel automatic graph state.
  const flat = {
    ...composition,
    layers: composition.layers.map(l => ({ ...l, parentId: "", matteId: "", matteMode: "" })),
  };
  const compiled = compileDirectorComposition(
    { ...result, version: 2, composition: flat },
    snapshot
  );
  for (const node of result.nodePlan.nodes.filter(n => n.kind === "ring")) {
    const art = compiled.plan.graphics?.layers.find(l => l.id === node.id);
    if (!art) throw Error("Director ring has no ordinary artwork layer.");
    art.svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><circle cx="640" cy="360" r="348" fill="none" stroke="${node.color}" stroke-width="12"/></svg>`;
  }
  for (const edge of edges) {
    if (edge.parent)
      compiled.plan.actions.push({
        type: "node_connect",
        sourceId: edge.parent,
        targetId: edge.id,
        port: "Parent",
      });
    if (edge.matte)
      compiled.plan.actions.push({
        type: "node_connect",
        sourceId: edge.matte,
        targetId: edge.id,
        port: "Mask",
        mode: edge.mode,
      });
  }
  for (const d of result.nodePlan.drivers)
    compiled.plan.actions.push({
      type: "motion_driver",
      targetId: d.target,
      property: d.property,
      driver:
        d.type === "spin"
          ? { type: "spin", enabled: true, ratePerSecond: d.rate }
          : {
              type: "pulse",
              enabled: true,
              waveform: "sine",
              frequencyHz: d.frequency,
              amplitude: d.amount,
              phaseDeg: d.phase || 0,
            },
    });
  if (compiled.plan.actions.length > 64)
    throw Error("Director node composition exceeds the native action limit.");
  return {
    ...compiled,
    nodeSummary: {
      nodes: result.nodePlan.nodes.length,
      connections: result.nodePlan.links.length,
      drivers: result.nodePlan.drivers.length,
    },
    concept: result.nodePlan.concept,
  };
}
