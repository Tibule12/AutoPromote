#!/usr/bin/env node
// Package existing native exports for private review. This renders no films,
// grants no approval and does not write the public showroom catalogue.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { hash, referenceFor } = require('../../src/creativeTemplates/contract');
const definition = require('../../frontend/src/templates/product_launch_cinematic_v1.json');
const root = path.resolve(__dirname, '../..');
const folder = path.join(root, 'reports/model-capability-runtime-v1-20261009/proof/launch-template');
const versioned = (file, directory) => {
  const digest = hash(fs.readFileSync(file));
  const destination = path.join(directory, digest + path.extname(file));
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(destination)) assert.equal(hash(fs.readFileSync(destination)), digest);
  else fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL);
  return { path: path.relative(folder, destination), sha256: digest };
};
const outputs = [];
for (const name of ['ember', 'velo', 'onda']) {
  const directory = path.join(folder, name);
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'render-receipt.json')));
  const project = JSON.parse(fs.readFileSync(path.join(folder, `${name}-project.private.json`)));
  const requestFile = path.join(folder, `${name}-render-request.private.json`);
  assert.deepEqual(receipt.templateRef, referenceFor(definition));
  assert.equal(hash(project.snapshot.studioDocument), receipt.projectHash);
  assert.equal(hash(fs.readFileSync(path.join(directory, 'final.mp4'))), receipt.outputSha256);
  assert.equal(receipt.serverOutputSha256, receipt.outputSha256);
  assert.equal(hash(fs.readFileSync(requestFile)), receipt.requestBytesSha256);
  const before = project.snapshot.projectMedia.find(asset =>
    asset.id === project.snapshot.creativeTemplateInstance.bindings.productFootage.assetId);
  const beforeFile = path.join(folder, before.name);
  assert.equal(hash(fs.readFileSync(beforeFile)), before.contentHash);
  const poster = path.join(directory, 'poster.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-ss', '18.75', '-i', path.join(directory, 'final.mp4'),
    '-frames:v', '1', '-y', poster]);
  outputs.push({ name: name.toUpperCase(), templateRef: receipt.templateRef,
    projectId: project.id, projectHash: receipt.projectHash, renderJobId: receipt.submittedJobId,
    requestBytesSha256: receipt.requestBytesSha256,
    before: { path: path.relative(folder, beforeFile), sha256: before.contentHash },
    poster: versioned(poster, path.join(directory, 'versions')),
    final: versioned(path.join(directory, 'final.mp4'), path.join(directory, 'versions')),
    editableDocument: versioned(path.join(folder, `${name}-document.json`), path.join(directory, 'versions')),
    capabilityEvidence: ['owned moving footage', 'ordinary cuts and timed typography',
      'editable Bezier motion keys', 'music and deterministic timed sound cues', 'native Studio export/download'],
    modelJobs: 0, creativeReviewStatus: 'PENDING_FULL_MOVING_FILM_AND_SOUND_REVIEW',
    founderApproved: false, publicationAllowed: false, heroQualified: false });
}
fs.writeFileSync(path.join(folder, 'private-review.json'), JSON.stringify({
  schemaVersion: 1, kind: 'private_review_materials', generatedAt: new Date().toISOString(),
  templateRef: referenceFor(definition), outputs,
  sourceReceipts: 'source-receipts.json', soundtrack: 'launch-pulse-original.wav',
  publicCandidateCreated: false, publicReleasePermission: false,
  blocker: 'Full moving-film/sound creative review, founder acceptance and whole preview/final parity remain unqualified.'
}, null, 2), { mode: 0o600 });
console.log(`Packaged ${outputs.length} existing native outputs for private review; no publication or approval.`);
