jest.mock('../educationCatalog', () => ({ EDUCATION_ASSETS: '/education/it-studio-v1/', educationLesson: id => id === 'first-project' ? { id, assets: [{ file: 'normal-input.mp4' }] } : null }));
import { readEducationPracticeRecipe } from '../EducationStudioGuide';
const file = value => ({ size: 100, text: async () => JSON.stringify(value) });
test('a prepared project identifies only a curated lesson; it cannot import owner state or foreign sources', async () => {
  const recipe = { format: 'autopromote-education-practice', version: 1, lessonId: 'first-project', sourceFiles: ['normal-input.mp4'] };
  await expect(readEducationPracticeRecipe(file(recipe), 'first-project')).resolves.toMatchObject({ id: 'first-project' });
  await expect(readEducationPracticeRecipe(file({ ...recipe, ownerUid: 'somebody-else' }), 'first-project')).rejects.toThrow(/Unsupported/);
  await expect(readEducationPracticeRecipe(file({ ...recipe, sourceFiles: ['https://foreign.test/private.mp4'] }), 'first-project')).rejects.toThrow(/Unsupported/);
  await expect(readEducationPracticeRecipe(file(recipe), 'another-lesson')).rejects.toThrow(/match/);
});
