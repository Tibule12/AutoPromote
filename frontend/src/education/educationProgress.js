const KEY = 'autopromote.education.it-studio.v1';
export const EMPTY_PROGRESS = { version: 1, lessons: {} };
export function readEducationProgress(storage = window.localStorage) {
  try { return validateEducationProgress(JSON.parse(storage.getItem(KEY) || 'null')); }
  catch (_) { return { ...EMPTY_PROGRESS, lessons: {} }; }
}
export function validateEducationProgress(value, lessonIds = []) {
  if (!value || value.version !== 1 || !value.lessons || typeof value.lessons !== 'object' || Array.isArray(value.lessons)) return { ...EMPTY_PROGRESS, lessons: {} };
  const lessons = {};
  for (const [id, entry] of Object.entries(value.lessons).slice(0, 100)) {
    if (!/^[a-z0-9-]{1,70}$/.test(id) || (lessonIds.length && !lessonIds.includes(id)) || !entry || typeof entry !== 'object') continue;
    lessons[id] = { checked: [...new Set(Array.isArray(entry.checked) ? entry.checked.filter(x => Number.isInteger(x) && x >= 0 && x < 30) : [])],
      completed: entry.completed === true, updatedAt: typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt)) ? entry.updatedAt : null };
  }
  return { version: 1, lessons };
}
export function saveEducationProgress(progress, storage = window.localStorage) {
  storage.setItem(KEY, JSON.stringify(validateEducationProgress(progress)));
}
export function clearEducationProgress(storage = window.localStorage) { storage.removeItem(KEY); }
export function updateLessonProgress(progress, lesson, checked) {
  const safe = checked.filter(index => Number.isInteger(index) && index >= 0 && index < lesson.assessment.length);
  return { version: 1, lessons: { ...progress.lessons, [lesson.id]: { checked: safe, completed: safe.length === lesson.assessment.length,
    updatedAt: new Date().toISOString() } } };
}
