import { readEducationProgress, saveEducationProgress, clearEducationProgress, validateEducationProgress, updateLessonProgress } from '../educationProgress';
import { hasCompleteLessonEvidence, visibleEducationLessons } from '../educationCatalog';
test('unreleased lessons never enter the public library, including when only technical evidence exists', () => {
  expect(visibleEducationLessons(false)).toEqual([]);
  expect(visibleEducationLessons(true)).toHaveLength(9);
  expect(hasCompleteLessonEvidence({ evidence: { canonicalExport: true, nativeControls: true } })).toBe(false);
});
test('native concept films require moving-preview evidence and the same teacher and reproduction gates', () => {
  const lesson = { media: { tutorial: 't', result: 'r', source: 's', screenshot: 'i', project: 'p', captions: 'c' }, evidence: { nativeControls: true, nativeMotionScene: true, realMovingSource: false, realMovingPreview: true, canonicalExport: true, previewExportReviewed: true, fullDurationInspected: true, independentReproduction: false, teacherReview: false } };
  expect(hasCompleteLessonEvidence(lesson)).toBe(false);
  lesson.evidence.independentReproduction = true;lesson.evidence.teacherReview = true;
  expect(hasCompleteLessonEvidence(lesson)).toBe(true);
  lesson.evidence.realMovingPreview = false;
  expect(hasCompleteLessonEvidence(lesson)).toBe(false);
});
test('a shared browser can save, reopen and clear only this learning record', () => {
  localStorage.setItem('other-app-record', 'keep');
  const lesson = { id: 'first-project', assessment: ['a', 'b'] };
  const pending = updateLessonProgress({ version: 1, lessons: {} }, lesson, [0]);
  expect(pending.lessons[lesson.id].completed).toBe(false);
  const done = updateLessonProgress(pending, lesson, [0, 1]);
  saveEducationProgress(done);expect(readEducationProgress().lessons[lesson.id].completed).toBe(true);
  clearEducationProgress();expect(readEducationProgress().lessons).toEqual({});expect(localStorage.getItem('other-app-record')).toBe('keep');
});
test('damaged progress is discarded; optional imported values cannot inject objects or arbitrary names', () => {
  expect(validateEducationProgress(null)).toEqual({ version: 1, lessons: {} });
  const result = validateEducationProgress({ version: 1, lessons: { 'first-project': { checked: [-1, 0, 0, 500, 'x'], completed: 'true' }, 'unknown': { checked: [0] } } }, ['first-project']);
  expect(result.lessons['first-project']).toEqual({ checked: [0], completed: false, updatedAt: null });
  expect(result.lessons.unknown).toBeUndefined();
});
