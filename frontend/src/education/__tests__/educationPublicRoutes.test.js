import { publicEntryRoute } from '../../utils/publicEntryRoute';
test('direct education URLs reach the same App route without changing other hash intents', () => {
  expect(publicEntryRoute({ pathname: '/education/lessons/first-project' })).toBe('/#/education/lessons/first-project');
  expect(publicEntryRoute({ pathname: '/education/teachers/' })).toBe('/#/education/teachers');
  expect(publicEntryRoute({ pathname: '/', hash: '#/education' })).toBeNull();
  expect(publicEntryRoute({ pathname: '/api/education' })).toBeNull();
});
