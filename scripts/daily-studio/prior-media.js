// Creative review does not publish a saved draft. Reserve every prior post's
// media conservatively, including unfinished or uncertain submissions, and
// bind its separate clean result so it cannot count as a new story either.
function reservedMediaHashes(book) {
  const posts = book.posts || [];
  const storyIds = new Set(posts.map(post => post.storyId).filter(Boolean));
  const hashes = new Set(posts.map(post => post.mediaSha256).filter(Boolean));
  for (const story of book.stories || []) {
    if (book.status !== "SCHEDULED_VERIFIED" && !storyIds.has(story.id)) continue;
    for (const hash of [story.movieSha256, story.recordingSha256])
      if (hash) hashes.add(hash);
  }
  return [...hashes];
}

module.exports = { reservedMediaHashes };
