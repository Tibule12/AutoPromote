// Authoring uses the programme's saved aspect, independent of monitor size,
// split comparisons, rounded frames or a collapsed inspector.
export function studioProjectAspect(snapshot) {
  const aspect = snapshot.reframeAspect || snapshot.studioDocument?.output?.aspectRatio || '9:16';
  const dimensions = { '9:16': [405, 720], '4:5': [576, 720], '1:1': [720, 720], '16:9': [1280, 720] }[aspect];
  if (!dimensions) throw Error('Choose a supported project output aspect.');
  return { width: dimensions[0], height: dimensions[1], ratio: dimensions[0] / dimensions[1] };
}
