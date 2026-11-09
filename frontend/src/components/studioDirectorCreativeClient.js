import { API_BASE_URL } from "../config";
const { expandFragmentTransition } = require("./studioFragmentTransition");
const { validateKineticPoster } = require("./studioKineticPoster");

export async function reviseDirectorPoster(plan, poster) {
  if (plan.version !== 4 || !plan.poster)
    throw Error("This proposal has no editable motion design.");
  validateKineticPoster(poster);
  const core = {
    version: 4,
    projectId: plan.projectId,
    baseRevision: plan.baseRevision,
    brief: plan.brief,
    duration: plan.duration,
    sourceEvidence: plan.sourceEvidence,
    poster,
  };
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(core)))
  );
  return {
    ...core,
    fingerprint: [...bytes].map(v => v.toString(16).padStart(2, "0")).join(""),
    provenance: {
      ...plan.provenance,
      manualOperatorRevision: true,
      initialModelFingerprint: plan.provenance.initialModelFingerprint || plan.fingerprint,
    },
  };
}

export async function reviseDirectorFragment(plan, fragment) {
  if (plan.version !== 3 || !plan.provenance?.fragmentIntent)
    throw Error("This proposal has no editable fragment intent.");
  const nodePlan = expandFragmentTransition(
    { name: plan.nodePlan.name, concept: plan.nodePlan.concept, fragment },
    plan.duration
  );
  const core = {
    version: 3,
    projectId: plan.projectId,
    baseRevision: plan.baseRevision,
    brief: plan.brief,
    duration: plan.duration,
    sourceEvidence: plan.sourceEvidence,
    nodePlan,
  };
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(core)))
  );
  return {
    ...core,
    fingerprint: [...bytes].map(v => v.toString(16).padStart(2, "0")).join(""),
    provenance: {
      ...plan.provenance,
      manualOperatorRevision: true,
      initialModelFingerprint: plan.provenance.initialModelFingerprint || plan.fingerprint,
      fragmentIntent: { ...fragment },
    },
  };
}
export async function studioCreativePlannerStatus(token, signal) {
  const response = await fetch(`${API_BASE_URL}/api/studio/director/creative-plan`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) return { available: false };
  return response.json();
}
export async function requestStudioCreativePlan(context, token, signal) {
  const response = await fetch(`${API_BASE_URL}/api/studio/director/creative-plan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(context),
    signal,
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true || !data.plan)
    throw Error(data.error || "The Director could not prepare this edit.");
  const plan = data.plan,
    core = {
      version: plan.version,
      projectId: plan.projectId,
      baseRevision: plan.baseRevision,
      brief: plan.brief,
      duration: plan.duration,
      sourceEvidence: plan.sourceEvidence,
      ...(plan.version === 4
        ? { poster: plan.poster }
        : plan.version === 3
          ? { nodePlan: plan.nodePlan }
          : plan.version === 2
            ? { composition: plan.composition }
            : { storyboard: plan.storyboard }),
    };
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(core)))
  );
  const hash = [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
  if (
    hash !== plan.fingerprint ||
    plan.projectId !== context.projectId ||
    plan.baseRevision !== context.baseRevision ||
    plan.brief !== context.brief ||
    plan.duration !== context.duration
  )
    throw Error("The Director returned a plan for different project content.");
  return plan;
}
