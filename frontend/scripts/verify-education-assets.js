// A normal production build must not publish unreleased teaching media merely
// because the files exist in the source workspace. Originals remain untouched.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),root=path.resolve(__dirname,'..'),catalog=require('../src/education/lessons.json');
const build=path.resolve(root,process.env.BUILD_PATH||'build'),base=path.join(build,'education/it-studio-v1'),preview=process.env.REACT_APP_EDUCATION_PREVIEW==='true';let excluded=0,released=0;
for(const lesson of catalog.lessons){const proof=lesson.evidence||{};const practice=proof.realMovingSource||(proof.nativeMotionScene&&proof.realMovingPreview);const complete=practice&&['nativeControls','canonicalExport','fullDurationInspected','previewExportReviewed','independentReproduction','teacherReview'].every(flag=>proof[flag]===true);if(lesson.releaseStatus==='published'){assert(complete,`Unreviewed education release: ${lesson.id}`);released++}for(const [kind,name]of Object.entries(lesson.media)){assert(/^[a-zA-Z0-9._-]+$/.test(name),'Unsafe education asset name');const file=path.join(base,name);const original=kind==='source'||(kind==='poster'&&proof.realMovingSource);if(!preview&&lesson.releaseStatus!=='published'&&!original){if(fs.existsSync(file)){fs.unlinkSync(file);excluded++}}else assert(fs.statSync(file).size>0,`Missing lesson media ${name}`)}if(!preview&&lesson.releaseStatus!=='published')for(const asset of lesson.assets.filter(a=>a.file.endsWith('.graphics.json'))){const file=path.join(base,asset.file);if(fs.existsSync(file)){fs.unlinkSync(file);excluded++}}}console.log(JSON.stringify({educationBuild:preview?'private-review':'public',releasedLessons:released,excludedUnreleasedMedia:excluded}));

// Control screenshots and chapter files also stay private while their parent
// lesson is under review, including files captured before catalog packaging.
if (!preview && catalog.lessons.find(l=>l.id==='bubble-sort')?.releaseStatus!=='published' && fs.existsSync(base)) {
  for (const name of fs.readdirSync(base)) if (/^click-.*\.(png|jpg)$/.test(name) || (/^first-swap-/.test(name) && name!=='first-swap-stage.mp4')) {
    const target=path.join(base,name);if(fs.statSync(target).isFile())fs.unlinkSync(target);
  }
}

// The owner explicitly requires no caption tracks in this education package.
if(fs.existsSync(base))for(const name of fs.readdirSync(base))if(name.endsWith('.vtt'))fs.unlinkSync(path.join(base,name));

// The owner authorised a public, read-only CAT teacher presentation. This is
// distinct from an approved learner release; IT gates remain unchanged.
const catCatalog = require('../src/education/catCatalog.json');
// Keep unapproved technical material private; the separately authorised
// four-lesson teacher presentation is validated below.
const technicalCatalog = require('../src/education/technicalCatalog.json');
const { hasTechnicalPresentationRelease } = require('../src/education/technicalPresentationRelease');
const technicalBuild = path.join(build, 'education/technical-v1');
if (!preview && !hasTechnicalPresentationRelease(technicalCatalog)) {
  assert(!technicalCatalog.presentationRelease, 'Invalid technical presentation release');
  fs.rmSync(technicalBuild, { recursive: true, force: true });
} else if (!preview) {
  const crypto = require('crypto');
  assert.equal(technicalCatalog.presentationRelease.manifest, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(path.join(technicalBuild, 'release-manifest.json')));
  assert.equal(manifest.format, 'autopromote-technical-presentation');
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.lessonIds, technicalCatalog.presentationRelease.lessonIds);
  const allowed = new Set(['catalog.json', 'release-manifest.json']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(technicalBuild, 'catalog.json'))), technicalCatalog);
  for (const item of manifest.files) {
    assert(typeof item.path === 'string' && /^[a-zA-Z0-9 _./-]+$/.test(item.path));
    assert(!item.path.split('/').some(part => part === '..' || !part));
    assert(!/private|owned.project|owner.project|signed|token/i.test(item.path));
    assert(!allowed.has(item.path), 'Duplicate presentation asset');
    const bytes = fs.readFileSync(path.join(technicalBuild, item.path));
    assert.equal(bytes.length, item.bytes, 'Changed presentation asset: ' + item.path);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, 'Changed presentation bytes: ' + item.path);
    allowed.add(item.path);
  }
  for (const lesson of technicalCatalog.lessons) {
    for (const name of ['source.mp4','result.mp4','tutorial.mp4','poster.jpg','lesson.graphics.json','starter.graphics.json','practice-kit.zip','student-worksheet.pdf','teacher-guide.pdf','STUDIO-RECIPE.txt','STUDENT-EXERCISES.txt','TEACHER-ASSESSMENT.txt','TEACHER-REVIEW-CHECKLIST.txt','TECHNICAL-VERIFICATION.json','PROJECT-RESTORE.txt'])
      assert(allowed.has(lesson.id + '/' + name), 'Missing technical review material: ' + lesson.id + '/' + name);
    for (const [file, field] of [['result.mp4','resultSha256'],['tutorial.mp4','tutorialSha256']])
      assert.equal(manifest.files.find(item => item.path === lesson.id + '/' + file).sha256, lesson.media[field]);
  }
  assert(allowed.has('teacher-review-pack.zip'));
  function cleanTechnical(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const target = path.join(dir,entry.name);
    if (entry.isDirectory()) { cleanTechnical(target); if (!fs.readdirSync(target).length) fs.rmdirSync(target); }
    else if (!allowed.has(path.relative(technicalBuild,target).split(path.sep).join('/'))) fs.unlinkSync(target);
  } }
  cleanTechnical(technicalBuild);
  console.log(JSON.stringify({technicalTeacherReviewLessons:4,verifiedPresentationAssets:manifest.files.length,learnerEnrolment:false,formalApproval:false}));
}
const catBuild = path.join(build, 'education/cat-html-v1');
if (!preview && catCatalog.presentationRelease?.channel !== 'teacher-review') {
  fs.rmSync(catBuild, { recursive: true, force: true });
} else if (!preview) {
  assert.equal(catCatalog.presentationRelease.curriculumApproval, false);
  assert.equal(catCatalog.presentationRelease.learnerEnrolment, false);
  assert(/^https:\/\/github\.com\/Tibule12\/AutoPromote\/releases\/download\//.test(catCatalog.presentationRelease.packUrl));
  const allowed = new Set(['catalog.json', 'TEACHER-REVIEW.txt', 'PERMISSIONS.txt']);
  const common = ['index.html','source.mp4','result.mp4','tutorial-result.mp4','tutorial.mp4','lesson.graphics.json','STUDIO-RECIPE.txt','STUDENT-EXERCISES.txt','TEACHER-ASSESSMENT.txt','LEARNER-NOTES.txt','TUTORIAL-TRANSCRIPT.txt','CONCEPT-TRANSCRIPT.txt','SOURCE-PROVENANCE.txt','student-worksheet.pdf','teacher-guide.pdf','practice-kit.zip'];
  for (const lesson of catCatalog.lessons) {
    for (const flag of ['canonicalExport','actualNativeDownload','movingPreview','fullFinishedPlayback','exactColdRecovery','tutorial','bundle','htmlAccuracyChecked']) assert.equal(lesson.evidence?.[flag],true,lesson.id+': missing '+flag);
    assert.equal(lesson.evidence.teacherFeedbackReceived,false,'Teacher-review release does not imply teacher approval');
    for (const name of new Set([...common,...Object.keys(lesson.files||{}),...(lesson.number===2?['club.svg','broken.html','about.html']:[]),...(lesson.number===3?['ordered.html']:[])])) {
      assert(/^[a-zA-Z0-9._-]+$/.test(name));const relative=lesson.id+'/'+name;
      assert(fs.statSync(path.join(catBuild,relative)).size>0,'Missing teacher-review material '+relative);allowed.add(relative);
    }
  }
  function clean(dir) {for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory()){clean(target);if(!fs.readdirSync(target).length)fs.rmdirSync(target);}else if(!allowed.has(path.relative(catBuild,target).split(path.sep).join('/')))fs.unlinkSync(target);}}
  clean(catBuild);
  console.log(JSON.stringify({teacherReviewLessons:catCatalog.lessons.length,learnerRelease:false,formalApproval:false}));
}
