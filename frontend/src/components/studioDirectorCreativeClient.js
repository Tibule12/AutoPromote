import { API_BASE_URL } from '../config';

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
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(context),
    signal,
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true || !data.plan) {
    throw Error(data.error || 'The Director could not prepare this edit.');
  }
  const plan = data.plan;
  const core = {
    version: plan.version,
    projectId: plan.projectId,
    baseRevision: plan.baseRevision,
    brief: plan.brief,
    duration: plan.duration,
    sourceEvidence: plan.sourceEvidence,
    ...(plan.version === 2 ? { composition: plan.composition } : { storyboard: plan.storyboard }),
  };
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(core)))
  );
  const hash = [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
  if (
    hash !== plan.fingerprint ||
    plan.projectId !== context.projectId ||
    plan.baseRevision !== context.baseRevision ||
    plan.brief !== context.brief ||
    plan.duration !== context.duration
  ) {
    throw Error('The Director returned a plan for different project content.');
  }
  return plan;
}
