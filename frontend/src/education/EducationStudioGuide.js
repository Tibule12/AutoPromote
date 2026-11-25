import React, { useState } from 'react';
import { EDUCATION_ASSETS, educationRoute, educationLesson } from './educationCatalog';
export async function readEducationPracticeRecipe(file, currentLessonId) {
  if (!file || file.size > 32768) throw new Error('Choose the small practice project file downloaded from this lesson.');
  const recipe = JSON.parse(await file.text());
  const lesson = educationLesson(recipe.lessonId);
  if (recipe.format !== 'autopromote-education-practice' || recipe.version !== 1 || !lesson || lesson.id !== currentLessonId)
    throw new Error('This practice project does not match the open lesson.');
  const allowed = ['format', 'version', 'lessonId', 'projectName', 'sourceFiles', 'openInStudio', 'accountBinding', 'startingSettings', 'steps'];
  if (Object.keys(recipe).some(key => !allowed.includes(key)) || !Array.isArray(recipe.sourceFiles) ||
      recipe.sourceFiles.some(name => !lesson.assets.some(asset => asset.file === name)))
    throw new Error('Unsupported practice project fields or source files. Use the original download.');
  return lesson;
}
export default function EducationStudioGuide({ lesson, onPrepare, busy }) {
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  if (!lesson) return null;
  const load = async () => {
    if (loading || busy) return;
    setLoading(true);setError('');
    try {
      const sourceName = lesson.practiceSource || 'normal-input.mp4';
      const response = await fetch(EDUCATION_ASSETS + sourceName, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('The practice recording could not be loaded. Download it from the lesson and use Choose videos.');
      const blob = await response.blob();
      if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error('The practice recording is outside this lesson’s size limit.');
      await onPrepare(new File([blob], sourceName, { type: 'video/mp4' }));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  return <section className="studio-entry-education" aria-label="Education practice project" style={{ border: '1px solid #4d6e5a', background: '#11231b', borderRadius: 14, padding: 22, marginBottom: 24, gridColumn: "1 / -1" }}><p style={{ color: '#b0efcb', fontSize: 12 }}>AUTOPROMOTE EDUCATION · IT PRACTICE {lesson.number}</p><h3>{lesson.title}</h3><p>Load the original recording, then open a fresh editable practice project. Your upload uses the normal account permissions; it starts no render.</p><div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}><button type="button" className="creator-studio-btn" style={{ pointerEvents: "auto", cursor: "pointer" }} disabled={busy || loading} onClick={load}>{loading ? 'Loading practice recording…' : 'Load prepared practice recording'}</button><label style={{ fontSize: 13, color: "#b0efcb" }}>Open a downloaded practice project<input type="file" accept="application/json,.json" aria-label="Open education practice project" disabled={loading || busy} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { await readEducationPracticeRecipe(file, lesson.id); await load(); } catch (failure) { setError(failure.message); } }} /></label><a href={educationRoute('lessons/' + lesson.id)} target="_blank" rel="noreferrer">Keep the lesson steps open ↗</a></div><p style={{ fontSize: 12 }}>School access is not enabled. Existing account terms and export costs apply. The lesson grants no free processing or public-publishing permission.</p>{error && <p role="alert">{error}</p>}</section>;
}
