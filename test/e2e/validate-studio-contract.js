#!/usr/bin/env node
// Offline record validation. This never launches Studio, workers or GPU jobs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const files = {
  contract: 'docs/STUDIO-COMPLETION-CONTRACT.md',
  readiness: 'docs/STUDIO-PRODUCT-READINESS.md',
  capabilities: 'test/e2e/studio-capability-matrix.json',
  combinations: 'test/e2e/studio-combination-matrix.json',
  parity: 'test/e2e/studio-preview-render-parity.json',
};
const states = ['UNIMPLEMENTED', 'BROKEN', 'PARTIAL', 'FUNCTIONAL', 'PRO-READY', 'PRODUCTION-READY'];
const gates = ['add_use', 'timeline_project', 'meaningful_controls', 'preview',
  'interactive_adjustment', 'combine', 'undo_redo', 'save', 'close_reopen',
  'exact_state_recovery', 'render_export', 'preview_final_parity'];
const gateStates = new Set(['VERIFIED', 'FAILED', 'BLOCKED', 'UNVERIFIED']);
const tasks = new Set(Array.from({ length: 12 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`));

function refExists(ref) {
  assert.equal(typeof ref, 'string', 'Reference must be a repository path');
  const [filename, fragment] = ref.split('#');
  assert(filename && !path.isAbsolute(filename), `Use relative repository reference: ${ref}`);
  const resolved = path.resolve(root, filename);
  assert(resolved.startsWith(root + path.sep), `Reference escapes repository: ${ref}`);
  assert(fs.existsSync(resolved), `Missing referenced file: ${ref}`);
  if (fragment?.startsWith('/')) {
    let value = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    for (const key of fragment.slice(1).split('/').map(k => k.replace(/~1/g, '/').replace(/~0/g, '~'))) {
      assert(value != null && Object.hasOwn(value, key), `Missing JSON pointer: ${ref}`);
      value = value[key];
    }
  }
}

function unique(items, name) {
  const ids = items.map(item => item.id);
  assert(ids.every(id => typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id)), `${name}: invalid ID`);
  assert.equal(new Set(ids).size, ids.length, `${name}: duplicate ID`);
  return new Set(ids);
}

function lifecycle(row) {
  assert.deepEqual(Object.keys(row.lifecycle).sort(), [...gates].sort(), `${row.id}: all twelve gates required`);
  for (const [id, gate] of Object.entries(row.lifecycle)) {
    assert(gateStates.has(gate.status), `${row.id}/${id}: invalid gate state`);
    assert(Array.isArray(gate.evidenceRefs), `${row.id}/${id}: evidence array required`);
    gate.evidenceRefs.forEach(refExists);
    if (gate.status === 'VERIFIED') assert(gate.evidenceRefs.length, `${row.id}/${id}: evidence required`);
  }
  if (['PRO-READY', 'PRODUCTION-READY'].includes(row.readiness)) {
    assert(gates.every(id => row.lifecycle[id].status === 'VERIFIED'), `${row.id}: unverified completion gate`);
    assert(row.qualificationEvidence?.realUserFlow === true, `${row.id}: real user evidence required`);
    assert(row.qualificationEvidence?.preFinalPairedParity === true, `${row.id}: pre-final parity required`);
    assert(row.qualificationEvidence?.referencePaths?.length, `${row.id}: qualification receipts required`);
    row.qualificationEvidence.referencePaths.forEach(refExists);
  }
  if (row.readiness === 'PRODUCTION-READY') {
    for (const criterion of ['security', 'ordinaryAccounts', 'broadMedia', 'concurrency', 'recovery', 'operations']) {
      assert.equal(row.productionQualification?.[criterion], 'VERIFIED', `${row.id}: production ${criterion} missing`);
    }
  }
}

function validate() {
  Object.values(files).forEach(refExists);
  const cap = read(files.capabilities), combo = read(files.combinations), parity = read(files.parity);
  for (const doc of [cap, combo, parity]) {
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.contractVersion, 1);
    assert(Number.isFinite(Date.parse(doc.updatedAt)), 'Valid audit timestamp required');
    assert.deepEqual(doc.readinessStates, states);
  }
  assert.deepEqual(cap.lifecycleStepIds, gates);
  assert.deepEqual(combo.lifecycleStepIds, gates);
  const capabilityIds = unique(cap.capabilities, 'capability');
  assert.equal(capabilityIds.size, 29, 'Keep the baseline 29 capability identities');
  refExists(cap.baseline.checkpoint);
  refExists(cap.baseline.results);
  const baseline = read(cap.baseline.results);
  const baselineSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, cap.baseline.results))).digest('hex');
  assert.equal(baselineSha, cap.baseline.resultsSha256, 'Retained baseline changed: reconcile classifications/evidence before updating its recorded digest');
  assert.deepEqual([...capabilityIds].sort(), baseline.cases.map(row => row.id).sort());
  assert.equal(cap.baseline.historicalCountsAreCompletionClaims, false);
  const fixtureIds = unique(cap.mediaFixtures, 'fixture');
  for (const fixture of cap.mediaFixtures) {
    assert(['PRESENT', 'PLANNED'].includes(fixture.availability));
    if (fixture.availability === 'PRESENT') {
      refExists(fixture.path);
      assert.match(fixture.sha256, /^[a-f0-9]{64}$/);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, fixture.path))).digest('hex');
      assert.equal(sha, fixture.sha256, `Fixture bytes changed: ${fixture.id}`);
    } else {
      assert.equal(fixture.path, null, `${fixture.id}: do not invent a planned fixture path`);
      assert(fixture.requiredSpecification && fixture.blocker);
    }
  }
  Object.values(cap.sourceRefs).forEach(refExists);
  assert.deepEqual(parity.sourceRefs, cap.sourceRefs, 'Parity and capability source registries must agree');
  const combinationIds = unique(combo.combinations, 'combination');
  const parityIds = unique(parity.checks, 'parity');
  const requiredCombinations = ['captions_reframe_speed', 'mask_track_text_behind', 'three_d_footage_alpha',
    'broll_captions_music_transitions', 'ramp_sfx_motion', 'multi_source_vo_captions',
    'track_mask_camera_cuts', 'generated_live_vfx', 'color_composite_overlays',
    'multiple_effects_one_clip', 'director_then_manual'];
  requiredCombinations.forEach(id => assert(combinationIds.has(id), `Missing required combination: ${id}`));
  for (const row of cap.capabilities) {
    assert(states.includes(row.readiness), `${row.id}: invalid readiness`);
    assert(row.assessmentReason && row.verifiedScope && row.remainingIssues.length, `${row.id}: scope/gaps required`);
    assert(row.controls.existing.length && row.controls.auditCoverage, `${row.id}: control audit required`);
    assert(row.controls.unverifiedIsFake === false, `${row.id}: unknown is not a fake-control finding`);
    if (row.controls.confirmedUnwired.length) assert(['PARTIAL', 'BROKEN', 'UNIMPLEMENTED'].includes(row.readiness), `${row.id}: active ignored controls cannot qualify the broader feature`);
    if (row.readiness === 'FUNCTIONAL') assert.equal(row.strongestVerifiedSlice.readiness, 'FUNCTIONAL', `${row.id}: missing functional retained slice`);
    assert.equal(row.complete, ['PRO-READY', 'PRODUCTION-READY'].includes(row.readiness), `${row.id}: unearned complete flag`);
    row.blockers.concat(row.nextTaskIds).forEach(id => assert(tasks.has(id), `${row.id}: unknown backlog ID ${id}`));
    row.evidence.forEach(e => refExists(e.path + (e.jsonPointer ? `#${e.jsonPointer}` : '')));
    const baselineIndex = Number(row.legacyEvidence.jsonPointer.split('/').at(-1));
    assert.equal(baseline.cases[baselineIndex]?.id, row.id, `${row.id}: evidence pointer targets a different capability`);
    assert.equal(baseline.cases[baselineIndex]?.status, row.strongestVerifiedSlice.legacyOutcome, `${row.id}: retained result classification changed`);
    row.combinationIds.forEach(id => assert(combinationIds.has(id), `${row.id}: unknown combination ${id}`));
    row.previewRenderParity.checkIds.forEach(id => assert(parityIds.has(id), `${row.id}: unknown parity check ${id}`));
    row.canonicalState.sourceRefs.forEach(id => assert(cap.sourceRefs[id], `Unknown source ref ${id}`));
    for (const id of row.media.qualifiedFixtureIds) {
      assert(fixtureIds.has(id), `${row.id}: unknown qualified fixture`);
      assert.equal(cap.mediaFixtures.find(f => f.id === id).availability, 'PRESENT', `${row.id}: planned fixture cannot be qualified`);
    }
    lifecycle(row);
  }
  for (const row of combo.combinations) {
    assert(states.includes(row.readiness));
    row.capabilityIds.forEach(id => assert(capabilityIds.has(id), `${row.id}: unknown capability`));
    row.fixtureIds.forEach(id => assert(fixtureIds.has(id), `${row.id}: unknown fixture`));
    row.evidenceRefs.forEach(refExists);
    lifecycle(row);
    if (row.execution.kind === 'PLANNED_COMBINATION_HARNESS') assert.equal(row.execution.commands.length, 0, `${row.id}: do not present invented runnable tests`);
    for (const command of row.execution.commands) {
      const match = command.match(/^node (test\/e2e\/[A-Za-z0-9_./-]+\.js)(?: |$)/);
      assert(match, `${row.id}: unknown runner command`);
      refExists(match[1]);
    }
  }
  for (const check of parity.checks) {
    assert(states.includes(check.readiness));
    check.capabilityIds.forEach(id => assert(capabilityIds.has(id)));
    check.sourceRefs.forEach(id => assert(cap.sourceRefs[id]));
    check.automatedGuardFiles.forEach(refExists);
    if (['PRO-READY', 'PRODUCTION-READY'].includes(check.readiness)) {
      assert(check.measurement && check.qualificationEvidence?.preFinalPairedParity === true, `${check.id}: real paired measurements required`);
    }
  }
  const counts = Object.fromEntries(states.map(state => [state, cap.capabilities.filter(row => row.readiness === state).length]));
  const readiness = fs.readFileSync(path.join(root, files.readiness), 'utf8');
  for (const state of states) assert(readiness.includes(`${counts[state]} ${state}`), `Readiness summary drift: ${state}`);
  for (const id of tasks) assert(readiness.includes(id), `Missing backlog task ${id}`);
  assert(tasks.has(cap.continuity?.nextHighestPriorityTaskId), 'A valid next highest-priority task is required');
  for (const doc of [combo, parity]) assert.equal(doc.continuity?.nextHighestPriorityTaskId, cap.continuity.nextHighestPriorityTaskId, 'Matrix continuation points disagree');
  assert(readiness.includes(`Next highest-priority task: ${cap.continuity.nextHighestPriorityTaskId}`), 'Readiness and capability continuation points disagree');
  if (process.argv.includes('--list')) cap.capabilities.forEach(row => console.log(`${row.id}\t${row.readiness}\t${row.assessmentReason}`));
  console.log(JSON.stringify({ valid: true, capabilities: capabilityIds.size, counts,
    combinations: combinationIds.size, parityChecks: parityIds.size,
    presentFixtures: cap.mediaFixtures.filter(f => f.availability === 'PRESENT').length,
    newCapabilityExecutions: 0, note: 'Record validation only; no browser, provider or GPU execution.' }, null, 2));
}

try { validate(); } catch (error) { console.error(`Studio contract validation failed: ${error.message}`); process.exitCode = 1; }
