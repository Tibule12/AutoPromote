const { formatHashtagsForPlatform, generateCustomHashtags } = require('../hashtagEngine');

describe('hashtagEngine formatting', () => {
  test('LinkedIn formatting returns space-separated # tags and limits to 5', async () => {
    const tags = ['#one', '#two', '#three', '#four', '#five', '#six'];
    const str = formatHashtagsForPlatform(tags, 'linkedin');
    expect(str).toBe('#one #two #three #four #five');
  });

  test('Reddit formatting removes leading # and returns comma list', async () => {
    const tags = ['#one', '#two', '#three'];
    const str = formatHashtagsForPlatform(tags, 'reddit');
    expect(str).toBe('one, two, three');
  });

  test('generateCustomHashtags includes formatted string in result for LinkedIn and Reddit', async () => {
    const content = { title: 'Test' };
    const resLinkedIn = await generateCustomHashtags({ content, platform: 'linkedin', customTags: ['#lp1'] });
    expect(resLinkedIn.hashtagString.includes('#')).toBe(true);
    const resReddit = await generateCustomHashtags({ content, platform: 'reddit', customTags: ['#rd1'] });
    expect(resReddit.hashtagString.includes('#')).toBe(false);
    expect(resReddit.hashtagString.includes(',')).toBe(true);
  });
});
