const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const catalog = require(root + '/frontend/src/education/lessons.json');
const verifier = root + '/frontend/scripts/verify-education-assets.js';
const technicalCatalogPath = root + '/frontend/src/education/technicalCatalog.json';

function fixture(action) {
  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'autopromote-education-release-'));
  function link(dir, target) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'teacher-review-pack.zip' && dir.includes('cat-html-v1')) continue;
      const source = path.join(dir, entry.name), destination = path.join(target, entry.name);
      if (entry.isDirectory()) link(source, destination);
      else fs.linkSync(source, destination);
    }
  }
  const it = path.join(build, 'education/it-studio-v1');
  fs.mkdirSync(it, { recursive: true });
  for (const lesson of catalog.lessons) for (const name of Object.values(lesson.media))
    fs.copyFileSync(root + '/frontend/public/education/it-studio-v1/' + name, it + '/' + name);
  for (const name of ['cat-html-v1', 'technical-v1'])
    link(root + '/frontend/public/education/' + name, path.join(build, 'education', name));
  const run = setup => spawnSync(process.execPath, ['-e', (setup || '') + `require(${JSON.stringify(verifier)});`], {
    env: { ...process.env, BUILD_PATH: build, REACT_APP_EDUCATION_PREVIEW: 'false' }, encoding: 'utf8',
  });
  try { action({ build, it, cat: path.join(build, 'education/cat-html-v1'), technical: path.join(build, 'education/technical-v1'), run }); }
  finally { fs.rmSync(build, { recursive: true, force: true }); }
}

test('public builds preserve IT sources while excluding unreleased IT films and guides', () => fixture(({ it, run }) => {
  const result = run(); assert.equal(result.status, 0, result.stderr);
  for (const lesson of catalog.lessons) {
    assert(fs.existsSync(it + '/' + lesson.media.source));
    assert(!fs.existsSync(it + '/' + lesson.media.tutorial));
    assert(!fs.existsSync(it + '/' + lesson.media.result));
  }
}));

test('draft screenshots and manual chapters are excluded even before catalog packaging', () => fixture(({ it, run }) => {
  fs.writeFileSync(it + '/click-unreviewed-control.png', 'draft');
  fs.writeFileSync(it + '/first-swap-unreviewed-chapter.mp4', 'draft');
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert(!fs.existsSync(it + '/click-unreviewed-control.png'));
  assert(!fs.existsSync(it + '/first-swap-unreviewed-chapter.mp4'));
}));

test('authorised CAT and technical teacher presentations retain exact approved materials and remove drafts', () => fixture(({ cat, technical, run }) => {
  fs.writeFileSync(cat + '/unreviewed-result.mp4', 'private');
  fs.writeFileSync(technical + '/private-result.mp4', 'private');
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert(!fs.existsSync(cat + '/unreviewed-result.mp4'));
  assert(!fs.existsSync(technical + '/private-result.mp4'));
  for (const lesson of require(technicalCatalogPath).lessons) for (const name of ['result.mp4', 'tutorial.mp4', 'practice-kit.zip', 'student-worksheet.pdf', 'teacher-guide.pdf'])
    assert(fs.existsSync(technical + '/' + lesson.id + '/' + name));
  assert(fs.existsSync(technical + '/teacher-review-pack.zip'));
  assert(!fs.existsSync(cat + '/teacher-review-pack.zip'));
}));

test('changed technical movie bytes fail the public build', () => fixture(({ technical, run }) => {
  const movie = technical + '/egd-drawing-views/result.mp4';
  // Break the fixture hard link before tampering; the original film is immutable.
  fs.unlinkSync(movie); fs.writeFileSync(movie, 'wrong movie');
  const result = run(); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Changed presentation asset/);
}));

test('a missing technical teaching guide fails the public build', () => fixture(({ technical, run }) => {
  fs.unlinkSync(technical + '/civil-brick-sequence/teacher-guide.pdf');
  const result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /ENOENT/);
}));

test('an unreleased technical catalog keeps its entire media directory private', () => fixture(({ technical, run }) => {
  const result = run(`delete require(${JSON.stringify(technicalCatalogPath)}).presentationRelease;`);
  assert.equal(result.status, 0, result.stderr); assert(!fs.existsSync(technical));
}));

test('a declared release with incomplete native evidence is refused', () => fixture(({ run }) => {
  const result = run(`require(${JSON.stringify(technicalCatalogPath)}).lessons[0].evidence.tutorial = false;`);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Invalid technical presentation release/);
}));
