import catalog from './lessons.json';
export const EDUCATION_PREVIEW = process.env.REACT_APP_EDUCATION_PREVIEW === 'true';
export const EDUCATION_ASSETS = '/education/it-studio-v1/';
export const educationCatalog = catalog;
export function hasCompleteLessonEvidence(lesson) {
  const proof = lesson.evidence;
  const realPractice = proof?.realMovingSource || (proof?.nativeMotionScene && proof?.realMovingPreview);
  return Boolean(proof?.nativeControls && realPractice && proof?.canonicalExport && proof?.previewExportReviewed &&
    proof?.fullDurationInspected && proof?.independentReproduction && proof?.teacherReview &&
    lesson.media?.tutorial && lesson.media?.result && lesson.media?.source && lesson.media?.screenshot && lesson.media?.project);
}
export function visibleEducationLessons(preview = EDUCATION_PREVIEW) {
  return catalog.lessons.filter(lesson => preview || (lesson.releaseStatus === 'published' && hasCompleteLessonEvidence(lesson)));
}
export function educationLesson(id, preview = EDUCATION_PREVIEW) { return visibleEducationLessons(preview).find(lesson => lesson.id === id); }
export const educationRoute = path => `/#/education${path ? '/' + path : ''}`;
