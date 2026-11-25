import { validateStudioProjectDocument } from '../../components/studioProjectDocument';
// Only reviewed catalog entries may be bound; use the private authoring build
// in this test without conferring any school/subscription entitlement.
jest.mock('../educationCatalog', () => ({ educationLesson: id => ['first-project', 'bubble-sort'].includes(id) ? { id, number: id === 'first-project' ? 1 : 8, practiceSource: id === 'first-project' ? 'normal-input.mp4' : 'algorithm-stage.mp4' } : undefined }));
import { requestedEducationLesson, createEducationPracticeProject } from '../educationStudioPractice';
test('unknown or unreleased lesson identities cannot become workspace intents', () => {
  expect(requestedEducationLesson({ search: '?educationLesson=first-project' }).id).toBe('first-project');
  expect(requestedEducationLesson({ search: '?educationLesson=not-released' })).toBeNull();
  expect(requestedEducationLesson({ hash: '#/?educationLesson=first-project' }).id).toBe('first-project');
});
test('the manual swap intent chooses only its fixed six-second source and never an arbitrary URL', () => {
  expect(requestedEducationLesson({ search: '?educationLesson=bubble-sort&educationExercise=first-swap' })).toMatchObject({ id: 'bubble-sort', practiceSource: 'first-swap-stage.mp4' });
  expect(requestedEducationLesson({ hash: '#/?educationLesson=bubble-sort&educationExercise=first-swap' }).practiceSource).toBe('first-swap-stage.mp4');
  expect(requestedEducationLesson({ search: '?educationLesson=bubble-sort&educationExercise=https://foreign.test/video.mp4' }).practiceSource).toBe('algorithm-stage.mp4');
  expect(requestedEducationLesson({ search: '?educationLesson=first-project&educationExercise=first-swap' }).practiceSource).toBe('normal-input.mp4');
});
test('each starter is a fresh editable canonical project bound only to the provided owned upload', () => {
  const lesson = { id: 'first-project', number: 1 }, source = { name: 'normal-input.mp4', url: 'https://example.test/owned.mp4', storagePath: 'studio/sources/current-owner/video.mp4', contentHash: 'a'.repeat(64) };
  const first = createEducationPracticeProject(lesson, source, 11), second = createEducationPracticeProject(lesson, source, 11);
  validateStudioProjectDocument(first.snapshot.studioDocument);
  expect(first.id).not.toBe(second.id);
  expect(first.snapshot.timeline).toHaveLength(1);
  expect(first.snapshot.timeline[0].sourceStoragePath).toBe(source.storagePath);
  expect(first.snapshot.reframeAspect).toBe('16:9');
  expect(first.snapshot.autoCaptions).toBe(false);
  expect(first.snapshot.exportSettings).toMatchObject({ resolution: '720p', fps: '24' });
  expect(JSON.stringify(first)).not.toContain('previous-owner');
});
test('a download cannot restore a foreign media path or bypass source upload requirements', () => {
  expect(() => createEducationPracticeProject({ id: 'first-project' }, { url: 'https://example.test/file.mp4' }, 11)).toThrow(/Upload/);
  expect(() => createEducationPracticeProject({ id: 'not-released' }, { url: 'https://example.test/file.mp4', storagePath: 'foreign', contentHash: 'a'.repeat(64) }, 11)).toThrow(/Upload/);
});
